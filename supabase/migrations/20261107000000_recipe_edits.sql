-- A Plus member's own version of a recipe: ingredient amounts scaled by a factor (0 removes it), rewritten steps, and a note.
-- The catalog recipe is never changed. `factors` is keyed by ingredient name, e.g. {"Salsa": 0.5, "Avocado": 0}.
create table public.recipe_edits (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  factors jsonb not null default '{}'::jsonb,
  steps text,
  note text check (note is null or length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.recipe_edits enable row level security;
create policy "recipe_edits: own rows" on public.recipe_edits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The grocery list now uses each person's edited amounts, and leaves out ingredients they removed.
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
           sum(ri.quantity * coalesce((e.factors ->> ing.name)::numeric, 1) * v_people * s.fraction / r.servings) as qty,
           exists (
             select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id
           ) as on_shelf
    from public.cook_slots(p_plan_id, v_people) s
    join public.recipes r on r.id = s.recipe_id
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.ingredients ing on ing.id = ri.ingredient_id
    left join public.recipe_edits e on e.user_id = v_user and e.recipe_id = r.id
    where s.fraction > 0 and coalesce((e.factors ->> ing.name)::numeric, 1) > 0
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
        select round(sum(ri.quantity * coalesce((e.factors ->> i.name)::numeric, 1) * v_people * s.fraction / r.servings * i.avg_price_usd), 2)
        from public.cook_slots(p_plan_id, v_people) s
        join public.recipes r on r.id = s.recipe_id
        join public.recipe_ingredients ri on ri.recipe_id = r.id
        join public.ingredients i on i.id = ri.ingredient_id
        left join public.recipe_edits e on e.user_id = v_user and e.recipe_id = r.id
        where s.fraction > 0
          and exists (select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id)
      ), 0)
  where l.id = v_list;

  return v_list;
end;
$$;
