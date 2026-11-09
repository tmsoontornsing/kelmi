-- Grocery list hardening: rebuilds are serialised per plan, one bad stored value can no longer break them, an
-- ingredient appears once per list, plus the foreign-key indexes the tables were missing.

-- 1. recipe_edits.factors must be an object of numbers from 0 to 100 and small. Clean what is there first.
update public.recipe_edits set factors = '{}'::jsonb where jsonb_typeof(factors) is distinct from 'object';
update public.recipe_edits e
set factors = coalesce((
      select jsonb_object_agg(f.key, to_jsonb(least(100, greatest(0, (f.value #>> '{}')::numeric))))
      from jsonb_each(e.factors) as f
      where jsonb_typeof(f.value) = 'number'
    ), '{}'::jsonb)
where exists (
  select 1 from jsonb_each(e.factors) as f
  where case when jsonb_typeof(f.value) = 'number' then (f.value #>> '{}')::numeric not between 0 and 100 else true end
);
update public.recipe_edits set factors = '{}'::jsonb where length(factors::text) > 4000;

create or replace function public.valid_edit_factors(f jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(f) = 'object' then
      length(f::text) <= 4000
      and not exists (
        select 1 from jsonb_each(f) as x
        where case when jsonb_typeof(x.value) = 'number' then (x.value #>> '{}')::numeric not between 0 and 100 else true end
      )
    else false
  end;
$$;

alter table public.recipe_edits drop constraint if exists recipe_edits_factors_valid;
alter table public.recipe_edits add constraint recipe_edits_factors_valid
  check (jsonb_typeof(factors) = 'object' and public.valid_edit_factors(factors));

-- The amount factor for one ingredient: a stored number from 0 to 100, else 1. A bad value is ignored, never an error.
create or replace function public.edit_factor(f jsonb, ingredient text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(f) = 'object' and jsonb_typeof(f -> ingredient) = 'number'
      then least(100, greatest(0, (f -> ingredient #>> '{}')::numeric))
    else 1
  end;
$$;

-- 2. One row per ingredient per list. Keep a checked one when there are several.
delete from public.grocery_items
where id in (
  select id from (
    select id, row_number() over (partition by list_id, ingredient_id order by checked desc, id) as n
    from public.grocery_items
  ) d
  where d.n > 1
);
create unique index if not exists grocery_items_list_ingredient on public.grocery_items (list_id, ingredient_id);

-- 3. Rebuild: lock the plan row so two rebuilds of one plan run one after the other, delete then insert as separate
-- steps (a delete and an insert in one statement can trip the unique index), and sum an ingredient across recipes as
-- one line. The importer guarantees one pricing unit per ingredient; min() just makes that explicit.
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
  v_checked uuid[];
begin
  -- Runs as the caller, so row-level security limits this to the caller's own plan.
  select p.user_id into v_user from public.meal_plans p where p.id = p_plan_id for update;
  if v_user is null then
    raise exception 'plan % not found', p_plan_id;
  end if;
  select coalesce(pr.household_size, 2) into v_people from public.profiles pr where pr.id = v_user;

  insert into public.grocery_lists (plan_id, user_id) values (p_plan_id, v_user) on conflict (plan_id) do nothing;
  select l.id into v_list from public.grocery_lists l where l.plan_id = p_plan_id;

  select coalesce(array_agg(gi.ingredient_id), '{}') into v_checked
  from public.grocery_items gi where gi.list_id = v_list and gi.checked;
  delete from public.grocery_items gi where gi.list_id = v_list;

  insert into public.grocery_items (list_id, ingredient_id, quantity, unit, checked)
  with needed as (
    select ri.ingredient_id,
           min(ri.unit) as unit,
           sum(ri.quantity * public.edit_factor(e.factors, ing.name) * v_people * s.fraction / r.servings) as qty,
           exists (
             select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = ri.ingredient_id
           ) as on_shelf
    from public.cook_slots(p_plan_id, v_people) s
    join public.recipes r on r.id = s.recipe_id
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.ingredients ing on ing.id = ri.ingredient_id
    left join public.recipe_edits e on e.user_id = v_user and e.recipe_id = r.id
    where s.fraction > 0 and public.edit_factor(e.factors, ing.name) > 0
    group by ri.ingredient_id
  )
  select v_list, n.ingredient_id, greatest(round(public.purchase_quantity(n.qty, n.unit), 2), 0.01), n.unit, n.ingredient_id = any (v_checked)
  from needed n
  where not n.on_shelf;

  update public.grocery_lists l
  set estimated_total_usd = coalesce((
        select round(sum(gi.quantity * i.avg_price_usd), 2)
        from public.grocery_items gi join public.ingredients i on i.id = gi.ingredient_id
        where gi.list_id = v_list
      ), 0),
      pantry_savings_usd = coalesce((
        select round(sum(ri.quantity * public.edit_factor(e.factors, i.name) * v_people * s.fraction / r.servings * i.avg_price_usd), 2)
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

-- 4. The grocery-list function sets every meal's state and rebuilds the list in one call, so a failure half way cannot
-- leave some meals changed and the list stale. Runs as the caller: row-level security limits it to their own plan.
-- p_patches: [{ "id": meal_plan_items.id, "status": "cook|skip|leftover", "conflict": true|false }]
create or replace function public.apply_grocery_choices(p_plan_id uuid, p_patches jsonb, p_build_list boolean default true)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_list uuid;
begin
  if p_patches is null or jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches) > 21 then
    raise exception 'p_patches must be a list of at most 21 meals' using errcode = '22023';
  end if;
  perform 1 from public.meal_plans p where p.id = p_plan_id for update;
  if not found then
    raise exception 'plan % not found', p_plan_id;
  end if;

  update public.meal_plan_items mi
  set status = x.status,
      conflict = x.conflict,
      -- Only a leftovers meal keeps its leftover link.
      leftover_id = case when x.status = 'leftover' then mi.leftover_id else null end
  from jsonb_to_recordset(p_patches) as x(id uuid, status text, conflict boolean)
  where mi.id = x.id and mi.plan_id = p_plan_id;

  if p_build_list then
    v_list := public.rebuild_grocery_list(p_plan_id);
  end if;
  return v_list;
end;
$$;

revoke all on function public.apply_grocery_choices(uuid, jsonb, boolean) from public, anon;
grant execute on function public.apply_grocery_choices(uuid, jsonb, boolean) to authenticated;
revoke all on function public.rebuild_grocery_list(uuid) from public, anon;
grant execute on function public.rebuild_grocery_list(uuid) to authenticated;

-- 5. Indexes on the columns these tables are joined and cascaded by.
create index if not exists grocery_items_list_idx on public.grocery_items (list_id);
create index if not exists grocery_lists_user_idx on public.grocery_lists (user_id);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists meal_plan_items_recipe_idx on public.meal_plan_items (recipe_id);
create index if not exists meal_plan_items_leftover_idx on public.meal_plan_items (leftover_id);
create index if not exists leftovers_recipe_idx on public.leftovers (recipe_id);
create index if not exists meal_ratings_recipe_idx on public.meal_ratings (recipe_id);
create index if not exists recipe_edits_recipe_idx on public.recipe_edits (recipe_id);
create index if not exists household_members_member_idx on public.household_members (member_id);
create index if not exists recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);
-- Also serves a plain user_id lookup, and the daily cap on events in the next migration.
create index if not exists experiment_events_user_idx on public.experiment_events (user_id, created_at);
