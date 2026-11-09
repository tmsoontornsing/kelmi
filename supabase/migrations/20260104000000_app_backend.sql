-- Backend pieces the app needs end to end: a profile for every new user, free-text pantry items,
-- and a grocery list built from a plan.

-- 1. Every new auth user gets a profile row, so the app can always update its own profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Pantry items: people type what they have ("brown rice"), so store the name and the shelf it sits on,
-- and link to a catalog ingredient only when the name matches one. Matched items come off the grocery list.
alter table public.pantry_items alter column ingredient_id drop not null;
alter table public.pantry_items add column if not exists name text;
alter table public.pantry_items add column if not exists shelf text not null default 'Staples';
update public.pantry_items p set name = i.name from public.ingredients i where i.id = p.ingredient_id and p.name is null;
alter table public.pantry_items alter column name set not null;
alter table public.pantry_items drop constraint if exists pantry_items_user_id_ingredient_id_key;
create unique index if not exists pantry_items_user_name on public.pantry_items (user_id, lower(name));

create or replace function public.pantry_match_ingredient()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := trim(new.name);
  select i.id into new.ingredient_id from public.ingredients i where lower(i.name) = lower(new.name) limit 1;
  return new;
end;
$$;

drop trigger if exists pantry_match on public.pantry_items;
create trigger pantry_match
  before insert or update of name on public.pantry_items
  for each row execute function public.pantry_match_ingredient();

-- 3. Grocery list for a plan: every ingredient the week needs, scaled to the household and summed across
-- recipes, minus what is already in the pantry. Rebuilding keeps items already checked off.
alter table public.grocery_lists add column if not exists pantry_savings_usd numeric(8, 2) not null default 0;

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
           sum(ri.quantity * v_people / r.servings) as qty,
           exists (
             select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id
           ) as on_shelf
    from public.meal_plan_items mi
    join public.recipes r on r.id = mi.recipe_id
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    where mi.plan_id = p_plan_id
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
  select v_list, n.ingredient_id, greatest(round(n.qty, 2), 0.01), n.unit, coalesce(pv.checked, false)
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
        select round(sum(ri.quantity * v_people / r.servings * i.avg_price_usd), 2)
        from public.meal_plan_items mi
        join public.recipes r on r.id = mi.recipe_id
        join public.recipe_ingredients ri on ri.recipe_id = r.id
        join public.ingredients i on i.id = ri.ingredient_id
        where mi.plan_id = p_plan_id
          and exists (select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id)
      ), 0)
  where l.id = v_list;

  return v_list;
end;
$$;

revoke all on function public.rebuild_grocery_list(uuid) from public, anon;
grant execute on function public.rebuild_grocery_list(uuid) to authenticated;
