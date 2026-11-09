-- Plan requests are claimed in the database, in one locked step, so a burst of parallel requests cannot all pass the
-- same count and each run a paid model call. Only the service role (the generate-plan function, acting for a user it
-- has already verified) can claim a request or record what it cost; people can only read their own rows.

alter table public.plan_generations
  add column if not exists status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed'));
-- Rows that exist now are finished requests. From here on a row starts as pending.
alter table public.plan_generations alter column status set default 'pending';

-- A failed plan still counts toward the burst limit. It counts toward the monthly cap only if it used paid tokens
-- (input_tokens > 0), so the monthly count is by status and tokens.
create index if not exists plan_generations_user_status_month on public.plan_generations (user_id, status, created_at);
-- The daily AI-call ceiling counts across everyone.
create index if not exists plan_generations_created_at on public.plan_generations (created_at);

-- People no longer add or change these rows from the app: the count and the cost columns are the server's.
drop policy if exists "plan_generations: add own" on public.plan_generations;
drop policy if exists "plan_generations: update own usage" on public.plan_generations;
revoke insert, update, delete on public.plan_generations from anon, authenticated;

-- Caps. Keep in step with FREE_MONTHLY_PLAN_CAP, SUBSCRIBER_MONTHLY_PLAN_CAP, BURST_LIMIT and BURST_WINDOW_MS in
-- supabase/functions/_shared/plan-logic.ts, and with FREE_PLANS_PER_MONTH / PLUS_PLANS_PER_MONTH in apps/mobile/src/lib/limits.ts.
create or replace function public.claim_plan_generation(p_user uuid, p_requires_plus boolean default false)
returns table (allowed boolean, reason text, generation_id uuid, is_plus boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_burst_limit constant int := 5;
  c_burst_window constant interval := interval '10 minutes';
  c_free_cap constant int := 3;
  c_plus_cap constant int := 40;
  -- Global ceiling on AI calls a day across everyone (rows that are not the built-in planner, or that used paid tokens), so a swarm of new accounts
  -- cannot run up the bill. Keep in step with DAILY_AI_CALL_CEILING in supabase/functions/_shared/plan-logic.ts.
  c_daily_ai_ceiling constant int := 2000;
  v_plus boolean;
  v_burst int;
  v_month int;
  v_cap int;
  v_daily int;
  v_id uuid;
begin
  -- One claim at a time per user: the counts below and the insert are a single step.
  perform pg_advisory_xact_lock(hashtextextended('plan_generations:' || p_user::text, 0));

  v_plus := exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.status in ('active', 'trialing') and (s.period_end is null or s.period_end > now())
  );

  -- Everything counts toward the burst limit, failed plans included: a failed attempt can still cost money.
  select count(*) into v_burst from public.plan_generations g
  where g.user_id = p_user and g.created_at >= now() - c_burst_window;
  if v_burst >= c_burst_limit then
    return query select false, 'rate_limited'::text, null::uuid, v_plus;
    return;
  end if;

  if p_requires_plus and not v_plus then
    return query select false, 'plus_required'::text, null::uuid, v_plus;
    return;
  end if;

  select count(*) into v_month from public.plan_generations g
  where g.user_id = p_user
    and (g.status <> 'failed' or g.input_tokens > 0)
    and g.created_at >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc');
  -- The cap is picked in its own statement: PL/pgSQL ends an IF condition at the first THEN, so a CASE inside it breaks.
  v_cap := case when v_plus then c_plus_cap else c_free_cap end;
  if v_month >= v_cap then
    return query select false, case when v_plus then 'plan_cap' else 'plan_limit' end, null::uuid, v_plus;
    return;
  end if;

  -- One cheap counted query over today's rows that are not the built-in planner, or that used tokens (a pending row has no provider yet, so it
  -- counts). Checked last, so a person over their own cap hears about that first.
  select count(*) into v_daily from public.plan_generations g
  where g.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    and (g.provider is distinct from 'basic' or g.input_tokens > 0);
  if v_daily >= c_daily_ai_ceiling then
    return query select false, 'busy'::text, null::uuid, v_plus;
    return;
  end if;

  insert into public.plan_generations (user_id, status) values (p_user, 'pending') returning id into v_id;
  return query select true, null::text, v_id, v_plus;
end;
$$;

-- What a request cost and how it ended. Only a pending row can be finished, once. A failed row keeps the tokens it used,
-- because they count toward the monthly cap (see claim_plan_generation).
create or replace function public.record_generation_result(
  p_id uuid,
  p_status text,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'status must be succeeded or failed' using errcode = '22023';
  end if;
  update public.plan_generations
  set status = p_status,
      provider = left(p_provider, 40),
      model = left(p_model, 80),
      input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = greatest(coalesce(p_output_tokens, 0), 0)
  where id = p_id and status = 'pending';
end;
$$;

-- Swaps a week's meals in one transaction. The meal_plans row is kept (so its id stays the same) and its items are
-- replaced; the week's grocery list is dropped, because it was built from the old meals. Everything is checked before
-- anything is deleted, and any failure rolls the whole swap back, so the person never ends up with no plan.
create or replace function public.replace_meal_plan(p_user uuid, p_week date, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
  v_count int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 21 then
    raise exception 'a plan has 1 to 21 meals' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(recipe_id uuid, day_of_week int, meal_type text)
    where x.recipe_id is null or x.day_of_week is null or x.day_of_week not between 1 and 7
       or x.meal_type is null or x.meal_type not in ('breakfast', 'lunch', 'dinner')
  ) then
    raise exception 'a meal is missing its recipe, day or meal type' using errcode = '22023';
  end if;
  select count(distinct (x.day_of_week, x.meal_type)) into v_count
  from jsonb_to_recordset(p_items) as x(recipe_id uuid, day_of_week int, meal_type text);
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'a day and meal is used twice' using errcode = '22023';
  end if;
  -- Every recipe must exist (locked ones included) before anything is touched.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(recipe_id uuid, day_of_week int, meal_type text)
    where not exists (select 1 from public.recipes r where r.id = x.recipe_id)
  ) then
    raise exception 'a recipe in the plan does not exist' using errcode = '23503';
  end if;

  select id into v_plan from public.meal_plans where user_id = p_user and week_start = p_week for update;
  if v_plan is null then
    insert into public.meal_plans (user_id, week_start, status) values (p_user, p_week, 'generated') returning id into v_plan;
  else
    update public.meal_plans set status = 'generated' where id = v_plan;
    delete from public.meal_plan_items where plan_id = v_plan;
    delete from public.grocery_lists where plan_id = v_plan;
  end if;

  insert into public.meal_plan_items (plan_id, recipe_id, day_of_week, meal_type)
  select v_plan, x.recipe_id, x.day_of_week, x.meal_type
  from jsonb_to_recordset(p_items) as x(recipe_id uuid, day_of_week int, meal_type text);

  return v_plan;
end;
$$;

-- Supabase grants new functions to anon and authenticated by default. These three take a user id as an argument, so
-- they must not be callable with anyone's own numbers: service role only.
revoke all on function public.claim_plan_generation(uuid, boolean) from public, anon, authenticated;
revoke all on function public.record_generation_result(uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.replace_meal_plan(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.claim_plan_generation(uuid, boolean) to service_role;
grant execute on function public.record_generation_result(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.replace_meal_plan(uuid, date, jsonb) to service_role;
