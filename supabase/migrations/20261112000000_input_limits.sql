-- Size and shape limits on what people type, so a direct API call cannot store megabytes or flood a table, plus the
-- row quotas. Existing rows are cleaned first so none of the new checks fails on data that is already there.

-- A list of short plain strings: at most p_max_items entries, each 1 to p_max_len characters, no control characters.
create or replace function public.text_list_ok(a text[], p_max_items int, p_max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select a is not null
     and cardinality(a) <= p_max_items
     and not exists (
       select 1 from unnest(a) as e
       where e is null or char_length(e) not between 1 and p_max_len or e ~ '[[:cntrl:]]'
     );
$$;

-- The same list made valid: control characters become spaces, entries are trimmed and cut, empty ones dropped.
create or replace function public.clean_text_list(a text[], p_max_items int, p_max_len int)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(c.e order by c.n), '{}')
  from (
    select left(btrim(regexp_replace(e, '[[:cntrl:]]+', ' ', 'g')), p_max_len) as e, n
    from unnest(coalesce(a, '{}')) with ordinality as t(e, n)
    where e is not null
  ) c
  where c.e <> '' and c.n <= p_max_items;
$$;

-- 1. Profiles. Diet ids are the ones the planner knows (DIET_TAGS in plan-logic.ts, DIETS in the app). Goal and
-- meat_level are already restricted to their ids, and food_notes to 300 characters, by earlier migrations.
update public.profiles set diet = 'any' where diet is not null and diet not in ('any', 'vegetarian', 'pescatarian', 'vegan', 'lowcarb', 'halal');
-- Allergies are a safety list: they are never silently dropped or cut. If any profile has more than 20 allergies or an
-- entry longer than 40 characters, this migration stops and says how many, so the owner decides by hand (look at those
-- rows, then shorten or split the entries, or raise the limits, and run it again).
do $$
declare
  v_over_count int;
  v_too_long int;
begin
  select count(*) into v_over_count from public.profiles where allergies is not null and cardinality(allergies) > 20;
  select count(*) into v_too_long from public.profiles p
  where exists (select 1 from unnest(p.allergies) as e where char_length(e) > 40);
  if v_over_count > 0 or v_too_long > 0 then
    raise exception 'input_limits: % profile(s) have more than 20 allergies and % profile(s) have an allergy entry longer than 40 characters. Allergies are not trimmed automatically; fix these rows by hand, then run the migration again.',
      v_over_count, v_too_long;
  end if;
end;
$$;

-- Allergies: control characters become spaces and empty entries go (nothing is cut or capped, the check above made sure).
-- Dislikes and likes are only preferences, so they may be trimmed to fit.
update public.profiles
set allergies = public.clean_text_list(allergies, 20, 40),
    dislikes = public.clean_text_list(dislikes, 20, 40),
    likes = public.clean_text_list(likes, 30, 40),
    appliances = public.clean_text_list(appliances, 20, 40)
where not (public.text_list_ok(allergies, 20, 40) and public.text_list_ok(dislikes, 20, 40)
       and public.text_list_ok(likes, 30, 40) and public.text_list_ok(appliances, 20, 40));

alter table public.profiles drop constraint if exists profiles_diet_known;
alter table public.profiles add constraint profiles_diet_known
  check (diet is null or diet in ('any', 'vegetarian', 'pescatarian', 'vegan', 'lowcarb', 'halal'));
alter table public.profiles drop constraint if exists profiles_lists_ok;
alter table public.profiles add constraint profiles_lists_ok
  check (public.text_list_ok(allergies, 20, 40) and public.text_list_ok(dislikes, 20, 40)
     and public.text_list_ok(likes, 30, 40) and public.text_list_ok(appliances, 20, 40));

-- 2. Pantry item names. Names are unique per person ignoring case (and trimmed), so cutting to 80 characters could make
-- two names collide. First, among each person's items that would end up with the same cut name, keep one (an uncut name
-- over a cut one, then the lowest id) and delete the rest; then cut.
delete from public.pantry_items where btrim(name) = '';
delete from public.pantry_items p
using (
  select id, row_number() over (
           partition by user_id, lower(btrim(left(name, 80)))
           order by (char_length(name) > 80), id
         ) as rn
  from public.pantry_items
) d
where p.id = d.id and d.rn > 1;
delete from public.pantry_items where btrim(left(name, 80)) = '';
update public.pantry_items set name = btrim(left(name, 80)) where char_length(name) > 80;
alter table public.pantry_items drop constraint if exists pantry_items_name_len;
alter table public.pantry_items add constraint pantry_items_name_len check (char_length(name) between 1 and 80);

-- 3. Recipe edits: steps (factors were limited in the previous migration).
update public.recipe_edits set steps = left(steps, 4000) where char_length(steps) > 4000;
alter table public.recipe_edits drop constraint if exists recipe_edits_steps_len;
alter table public.recipe_edits add constraint recipe_edits_steps_len check (steps is null or char_length(steps) <= 4000);

-- 4. Experiment events: short text columns. Rows with an empty value are useless and are deleted; long values are cut.
delete from public.experiment_events
where char_length(install_id) = 0 or char_length(experiment) = 0 or char_length(variant) = 0 or char_length(event) = 0;
update public.experiment_events
set install_id = left(install_id, 64), experiment = left(experiment, 64), variant = left(variant, 64), event = left(event, 64)
where char_length(install_id) > 64 or char_length(experiment) > 64 or char_length(variant) > 64 or char_length(event) > 64;
alter table public.experiment_events drop constraint if exists experiment_events_text_len;
alter table public.experiment_events add constraint experiment_events_text_len
  check (char_length(install_id) between 1 and 64 and char_length(experiment) between 1 and 64
     and char_length(variant) between 1 and 64 and char_length(event) between 1 and 64);

-- 5. Pantry quota. Nobody holds more than 200 items. Plus has no limit short of the 200. The check only stops new
-- rows, so someone already over the free limit keeps what they have. Runs as the caller, so it reads only their rows.
--
-- FREE LIMIT: while Plus is not live (PLUS_ENABLED=false in the app) there is no way to pay, so the free limit equals
-- the maximum (200) and matches the app. Flip c_free to 20 (FREE_PANTRY_LIMIT in apps/mobile/src/components/PlusLock.tsx)
-- in the SAME release as PLUS_ENABLED=true, with a new migration that replaces this function.
create or replace function public.pantry_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_max constant int := 200;
  c_free constant int := 200; -- FREE PANTRY LIMIT: must become 20 in the same release as PLUS_ENABLED=true
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('pantry:' || new.user_id::text, 0));
  select count(*) into v_count from public.pantry_items where user_id = new.user_id;
  if v_count >= c_max then
    raise exception 'The pantry is full (% items).', c_max using errcode = 'P0001', hint = 'pantry_full';
  end if;
  if v_count >= c_free and not public.user_is_plus(new.user_id) then
    raise exception 'The free pantry holds % items.', c_free using errcode = 'P0001', hint = 'pantry_free_limit';
  end if;
  return new;
end;
$$;

-- 6. Experiment events: at most 500 a person a day. Extra events are dropped without an error, so analytics can never
-- break the app. Security definer, because people can add events but not read them back, so their own count would be 0.
create or replace function public.experiment_events_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily constant int := 500;
begin
  perform pg_advisory_xact_lock(hashtextextended('experiment_events:' || new.user_id::text, 0));
  if (select count(*) from public.experiment_events where user_id = new.user_id and created_at > now() - interval '1 day') >= c_daily then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists experiment_events_cap on public.experiment_events;
create trigger experiment_events_cap before insert on public.experiment_events
  for each row execute function public.experiment_events_daily_cap();

-- 7. Whether a user has an active Plus subscription. Runs as the caller, so row-level security on subscriptions means
-- people can only ever learn this about themselves; the service role can ask about anyone.
create or replace function public.user_is_plus(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.status in ('active', 'trialing') and (s.period_end is null or s.period_end > now())
  );
$$;
revoke all on function public.user_is_plus(uuid) from public, anon;
grant execute on function public.user_is_plus(uuid) to authenticated, service_role;

drop trigger if exists pantry_quota_check on public.pantry_items;
create trigger pantry_quota_check before insert on public.pantry_items
  for each row execute function public.pantry_quota();
