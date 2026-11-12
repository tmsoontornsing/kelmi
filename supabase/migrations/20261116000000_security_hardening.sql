-- Security hardening from the November 2026 red-team run (supabase/scripts/redteam/). Each section names the exploit it
-- closes. Constraints are added NOT VALID so existing rows never block the deploy; they apply to every new write.

-- 1. Allergen safety flag. meal_plan_items.conflict decides whether a meal's ingredients go on the grocery list, and
-- it was writable by the signed-in user (directly, and through apply_grocery_choices, which took it from the caller).
-- Now only trusted roles may change it, and changing a meal's recipe marks it as a conflict until the grocery-list
-- function (which runs the real allergy and diet check) clears it again. Fails closed.
create or replace function public.protect_meal_item_safety()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.conflict := true;
    else
      -- People may raise the flag (the safe direction) but never clear it.
      if old.conflict and not new.conflict then
        raise exception 'conflict is set by the grocery-list check' using errcode = '42501';
      end if;
      if new.recipe_id is distinct from old.recipe_id or new.plan_id is distinct from old.plan_id then
        new.conflict := true;
      end if;
    end if;
    -- A leftover must belong to the plan's owner (foreign keys ignore row-level security).
    if new.leftover_id is not null and not exists (
      select 1 from public.leftovers lo join public.meal_plans p on p.user_id = lo.user_id
      where lo.id = new.leftover_id and p.id = new.plan_id
    ) then
      raise exception 'leftover not found' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists meal_plan_items_protect_safety on public.meal_plan_items;
create trigger meal_plan_items_protect_safety before insert or update on public.meal_plan_items
  for each row execute function public.protect_meal_item_safety();

-- apply_grocery_choices takes the conflict result from the grocery-list function, so only the service role may call it,
-- naming the user the function already verified.
--
-- The old caller-facing version stays for one release so the grocery-list function deployed before this migration keeps
-- working during the deploy window, but it can no longer clear a flag: it only ever adds one. Drop it in the next
-- migration once the new grocery-list function is live (see SECURITY.md, "Deploying").
create or replace function public.apply_grocery_choices(p_plan_id uuid, p_patches jsonb, p_build_list boolean default true)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_list uuid;
begin
  if p_patches is null or jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches) > 21
     or octet_length(p_patches::text) > 8192 then
    raise exception 'p_patches must be a list of at most 21 meals' using errcode = '22023';
  end if;
  perform 1 from public.meal_plans p where p.id = p_plan_id for update;
  if not found then
    raise exception 'plan % not found', p_plan_id;
  end if;

  update public.meal_plan_items mi
  set status = x.status,
      conflict = mi.conflict or coalesce(x.conflict, false),
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

create or replace function public.apply_grocery_choices(p_user uuid, p_plan_id uuid, p_patches jsonb, p_build_list boolean default true)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_list uuid;
begin
  if p_patches is null or jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches) > 21
     or octet_length(p_patches::text) > 8192 then
    raise exception 'p_patches must be a list of at most 21 meals' using errcode = '22023';
  end if;
  perform 1 from public.meal_plans p where p.id = p_plan_id and p.user_id = p_user for update;
  if not found then
    raise exception 'plan % not found', p_plan_id;
  end if;

  update public.meal_plan_items mi
  set status = x.status,
      conflict = x.conflict,
      leftover_id = case when x.status = 'leftover' then mi.leftover_id else null end
  from jsonb_to_recordset(p_patches) as x(id uuid, status text, conflict boolean)
  where mi.id = x.id and mi.plan_id = p_plan_id and x.conflict is not null;

  if p_build_list then
    v_list := public.rebuild_grocery_list(p_plan_id);
  end if;
  return v_list;
end;
$$;

revoke all on function public.apply_grocery_choices(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_grocery_choices(uuid, uuid, jsonb, boolean) to service_role;

-- Plans and their meals are created only by replace_meal_plan (service role); people only change a meal's state.
-- (UPDATE on meal_plans stays: rebuild_grocery_list locks the plan row with SELECT ... FOR UPDATE as the caller.)
revoke insert, delete on public.meal_plans, public.meal_plan_items from anon, authenticated;

-- 2. Grocery-list squatting: a list could be created on someone else's plan_id (foreign keys skip row-level security),
-- which then broke that person's rebuilds. The list must be on the caller's own plan.
drop policy if exists "grocery_lists: own rows" on public.grocery_lists;
create policy "grocery_lists: own rows" on public.grocery_lists
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.meal_plans p where p.id = plan_id and p.user_id = auth.uid())
  );

alter table public.grocery_lists drop constraint if exists grocery_lists_totals_nonneg;
alter table public.grocery_lists add constraint grocery_lists_totals_nonneg
  check (estimated_total_usd >= 0 and coalesce(pantry_savings_usd, 0) >= 0) not valid;

-- 3. Consent record: deleting your own profile row erased the consent timestamps. Accounts are removed by
-- delete-account (service role), which cascades.
revoke delete on public.profiles from anon, authenticated;

-- Terms versions are dates (legal/config.ts TERMS_VERSION).
create or replace function public.consent_version_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
$$;
alter table public.profiles drop constraint if exists profiles_terms_version_format;
alter table public.profiles add constraint profiles_terms_version_format
  check (terms_version is null or public.consent_version_ok(terms_version)) not valid;

-- 4. Experiment events: the daily cap counted by a client-chosen created_at, so back-dating skipped it.
create or replace function public.experiment_events_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily constant int := 500;
begin
  new.created_at := now();
  perform pg_advisory_xact_lock(hashtextextended('experiment_events:' || new.user_id::text, 0));
  if (select count(*) from public.experiment_events where user_id = new.user_id and created_at > now() - interval '1 day') >= c_daily then
    return null;
  end if;
  return new;
end;
$$;

-- 5. Unbounded inputs.
alter table public.pantry_items drop constraint if exists pantry_items_shelf_len;
alter table public.pantry_items add constraint pantry_items_shelf_len check (char_length(shelf) <= 40) not valid;
alter table public.grocery_items drop constraint if exists grocery_items_unit_len;
alter table public.grocery_items add constraint grocery_items_unit_len check (char_length(unit) <= 20) not valid;
alter table public.meal_plans drop constraint if exists meal_plans_week_start_ok;
alter table public.meal_plans add constraint meal_plans_week_start_ok
  check (extract(isodow from week_start) = 1 and week_start between date '2025-01-01' and date '2100-01-01') not valid;

-- At most 100 leftovers a person.
create or replace function public.leftovers_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('leftovers:' || new.user_id::text, 0));
  if (select count(*) from public.leftovers where user_id = new.user_id) >= 100 then
    raise exception 'too many leftovers saved' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists leftovers_quota on public.leftovers;
create trigger leftovers_quota before insert on public.leftovers
  for each row execute function public.leftovers_quota();

-- Trigger functions are never called directly.
revoke all on function public.protect_meal_item_safety() from public, anon, authenticated;
revoke all on function public.leftovers_quota() from public, anon, authenticated;

-- 6. record_consent('terms') stored any 1-40 character text, including future dates. Versions are ISO dates no later
-- than tomorrow (time zones).
create or replace function public.record_consent(p_kind text, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_kind not in ('age', 'ai', 'allergy', 'terms', 'ai_revoke') then
    raise exception 'unknown consent kind' using errcode = '22023';
  end if;
  if p_kind = 'terms' and (p_version is null or not public.consent_version_ok(p_version)
                           or to_date(p_version, 'YYYY-MM-DD') > current_date + 1
                           or to_char(to_date(p_version, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> p_version) then
    raise exception 'terms need a version date (YYYY-MM-DD)' using errcode = '22023';
  end if;

  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;

  if p_kind = 'age' then
    update public.profiles set age_confirmed_at = now() where id = v_user;
  elsif p_kind = 'ai' then
    update public.profiles set ai_consent_at = now() where id = v_user;
  elsif p_kind = 'ai_revoke' then
    update public.profiles set ai_consent_at = null where id = v_user;
  elsif p_kind = 'allergy' then
    update public.profiles set allergy_ack_at = now() where id = v_user;
  else
    update public.profiles set terms_accepted_at = now(), terms_version = p_version where id = v_user;
  end if;
end;
$$;

revoke all on function public.record_consent(text, text) from public, anon;
grant execute on function public.record_consent(text, text) to authenticated;
