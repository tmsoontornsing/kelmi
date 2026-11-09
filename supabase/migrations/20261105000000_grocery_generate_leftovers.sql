-- Person-driven grocery lists and leftover meals.
--   meal_plan_items.status    'cook' (buy for it), 'skip' (eating out, nothing to buy) or 'leftover' (eating leftovers)
--   meal_plan_items.conflict  true when the meal breaks the household's allergies or diet, so it stays off the list
--   leftovers                 meals already cooked, with servings left; one can be assigned to a future meal

create table public.leftovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  servings smallint not null check (servings between 1 and 24),
  cooked_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index leftovers_user_idx on public.leftovers (user_id, created_at desc);
alter table public.leftovers enable row level security;
create policy "leftovers: own rows" on public.leftovers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.meal_plan_items
  add column status text not null default 'cook' check (status in ('cook', 'skip', 'leftover')),
  add column leftover_id uuid references public.leftovers (id) on delete set null,
  add column conflict boolean not null default false;

-- Share of a meal that still has to be bought: all of it, unless leftovers cover part or all of the household.
create or replace function public.cook_fraction(p_status text, p_leftover_servings numeric, p_people numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'leftover' then greatest(0, 1 - least(coalesce(p_leftover_servings, 0), p_people) / nullif(p_people, 0))
    else 1
  end;
$$;

-- The meals a list is built from: not skipped, not conflicting with allergies or diet, less any part that leftovers cover.
create or replace function public.cook_slots(p_plan_id uuid, p_people numeric)
returns table (recipe_id uuid, fraction numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select mi.recipe_id, public.cook_fraction(mi.status, lo.servings, p_people)
  from public.meal_plan_items mi
  left join public.leftovers lo on lo.id = mi.leftover_id
  where mi.plan_id = p_plan_id and mi.status in ('cook', 'leftover') and not mi.conflict;
$$;

create or replace function public.rebuild_grocery_list(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid;
  v_people numeric;
  v_list uuid;
begin
  -- Runs as the caller, so row-level security limits this to the caller's own plan.
  select p.user_id into v_user from public.meal_plans p where p.id = p_plan_id;
  if v_user is null then
    raise exception 'plan % not found', p_plan_id;
  end if;
  select coalesce(pr.household_size, 2) into v_people from public.profiles pr where pr.id = v_user;

  insert into public.grocery_lists (plan_id, user_id) values (p_plan_id, v_user) on conflict (plan_id) do nothing;
  select l.id into v_list from public.grocery_lists l where l.plan_id = p_plan_id;

  with needed as (
    select ri.ingredient_id,
           ri.unit,
           sum(ri.quantity * v_people * s.fraction / r.servings) as qty,
           exists (
             select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id
           ) as on_shelf
    from public.cook_slots(p_plan_id, v_people) s
    join public.recipes r on r.id = s.recipe_id
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    where s.fraction > 0
    group by ri.ingredient_id, ri.unit
  ),
  previous as (
    select gi.ingredient_id, bool_or(gi.checked) as checked
    from public.grocery_items gi
    where gi.list_id = v_list
    group by gi.ingredient_id
  ),
  cleared as (
    delete from public.grocery_items gi where gi.list_id = v_list
  )
  insert into public.grocery_items (list_id, ingredient_id, quantity, unit, checked)
  select v_list, n.ingredient_id, greatest(round(public.purchase_quantity(n.qty, n.unit), 2), 0.01), n.unit, coalesce(pv.checked, false)
  from needed n
  left join previous pv on pv.ingredient_id = n.ingredient_id
  where not n.on_shelf;

  update public.grocery_lists l
  set estimated_total_usd = coalesce((
        select round(sum(gi.quantity * i.avg_price_usd), 2)
        from public.grocery_items gi join public.ingredients i on i.id = gi.ingredient_id
        where gi.list_id = v_list
      ), 0),
      pantry_savings_usd = coalesce((
        select round(sum(ri.quantity * v_people * s.fraction / r.servings * i.avg_price_usd), 2)
        from public.cook_slots(p_plan_id, v_people) s
        join public.recipes r on r.id = s.recipe_id
        join public.recipe_ingredients ri on ri.recipe_id = r.id
        join public.ingredients i on i.id = ri.ingredient_id
        where s.fraction > 0
          and exists (select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id)
      ), 0)
  where l.id = v_list;

  return v_list;
end;
$$;
