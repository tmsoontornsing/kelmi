-- Billing and plan-cap hardening.
--
-- Subscriptions: RevenueCat events are applied in the order they happened, not the order they arrive. Each row keeps
-- the timestamp of the last event applied to it, and an event that is not newer is ignored (a retried event, a late
-- EXPIRATION after a RENEWAL, a late RENEWAL after a refund). Writes go through two service-role-only functions so the
-- check and the write are one statement.
--
-- Plan generations:
--   * ai_attempts: how many paid model requests a plan request sent, recorded BEFORE each request. A request that times
--     out reports no tokens, so attempts are what the monthly cap and the daily AI ceiling count.
--   * A pending row older than 10 minutes that sent no paid request is an abandoned request (the function was killed):
--     it stops counting and is marked failed.
--   * The daily AI ceiling keeps the last 20% for Plus, and when it is reached the request is answered by the free
--     built-in planner (reason 'basic_only') instead of being refused.
--   * Deleting an account keeps its rows (user_id becomes null), so the daily ceiling does not forget calls already paid
--     for. Rows with no user are visible to nobody through RLS.

-- ---------- subscriptions ----------
alter table public.subscriptions add column if not exists last_event_ms bigint;

create or replace function public.apply_subscription_event(
  p_user uuid,
  p_source text,
  p_external_id text,
  p_status text,
  p_period_end timestamptz,
  p_event_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if p_external_id is null or p_event_ms is null then
    raise exception 'external_id and event time are required' using errcode = '22023';
  end if;
  insert into public.subscriptions as s (user_id, source, status, period_end, external_id, last_event_ms, updated_at)
  values (p_user, p_source, p_status, p_period_end, p_external_id, p_event_ms, now())
  on conflict (source, external_id) do update
    set user_id = excluded.user_id,
        status = excluded.status,
        period_end = excluded.period_end,
        last_event_ms = excluded.last_event_ms,
        updated_at = now()
    -- Newer only: an older event, or the same event delivered twice, changes nothing. Two different events with the
    -- same timestamp (RevenueCat can send e.g. PRODUCT_CHANGE and RENEWAL together) both apply.
    where s.last_event_ms is null or s.last_event_ms < excluded.last_event_ms
       or (s.last_event_ms = excluded.last_event_ms
           and (s.user_id, s.status, s.period_end) is distinct from (excluded.user_id, excluded.status, excluded.period_end));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- RevenueCat TRANSFER: the subscriptions of the old accounts move to the new one (keeping their end date). With no
-- signed-in recipient they simply end.
create or replace function public.transfer_subscriptions(p_from uuid[], p_to uuid, p_event_ms bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if p_event_ms is null then
    raise exception 'event time is required' using errcode = '22023';
  end if;
  update public.subscriptions s
  set user_id = coalesce(p_to, s.user_id),
      status = case when p_to is null then 'expired' else s.status end,
      last_event_ms = p_event_ms,
      updated_at = now()
  where s.source = 'revenuecat'
    and s.user_id = any(p_from)
    and (p_to is null or s.user_id <> p_to)
    and (s.last_event_ms is null or s.last_event_ms < p_event_ms);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.apply_subscription_event(uuid, text, text, text, timestamptz, bigint) from public, anon, authenticated;
revoke all on function public.transfer_subscriptions(uuid[], uuid, bigint) from public, anon, authenticated;
grant execute on function public.apply_subscription_event(uuid, text, text, text, timestamptz, bigint) to service_role;
grant execute on function public.transfer_subscriptions(uuid[], uuid, bigint) to service_role;

-- ---------- plan_generations ----------
alter table public.plan_generations add column if not exists ai_attempts integer not null default 0;

-- Keep rows when the account is deleted (the AI calls were still paid for today).
alter table public.plan_generations alter column user_id drop not null;
alter table public.plan_generations drop constraint if exists plan_generations_user_id_fkey;
alter table public.plan_generations
  add constraint plan_generations_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

-- Rows that already ran a model before this column existed.
update public.plan_generations
set ai_attempts = 1
where ai_attempts = 0 and (input_tokens > 0 or (status = 'succeeded' and provider is not null and provider not in ('basic', 'none')));

-- Records that a paid model request is about to be sent for a claimed request. Called by generate-plan before every
-- paid attempt (retries included); if it fails, the attempt is not made.
create or replace function public.record_ai_attempt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plan_generations set ai_attempts = least(ai_attempts + 1, 10) where id = p_id and status = 'pending' and provider is null;
  -- Not found: already finished, or claimed for the built-in planner only (basic_only), so no paid call is allowed.
  if not found then
    raise exception 'no pending plan request %', p_id using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.record_ai_attempt(uuid) from public, anon, authenticated;
grant execute on function public.record_ai_attempt(uuid) to service_role;

-- Same signature, result columns and grants as before. allowed with reason 'basic_only' means: go ahead, but with the
-- free built-in planner only (the daily AI ceiling is reached for this person).
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
  -- Keep in step with DAILY_AI_CALL_CEILING in supabase/functions/_shared/plan-logic.ts.
  c_daily_ai_ceiling constant int := 2000;
  -- Free accounts stop using AI at 80% of the ceiling; the rest is kept for Plus.
  c_free_share constant numeric := 0.8;
  -- A request still pending after this long was abandoned (the function was killed before it recorded a result).
  c_pending_ttl constant interval := interval '10 minutes';
  v_plus boolean;
  v_burst int;
  v_month int;
  v_cap int;
  v_daily int;
  v_ai_limit int;
  v_id uuid;
begin
  if p_user is null then
    raise exception 'a user is required' using errcode = '22023';
  end if;
  -- One claim at a time per user: the counts below and the insert are a single step.
  perform pg_advisory_xact_lock(hashtextextended('plan_generations:' || p_user::text, 0));

  -- Abandoned requests of this person end as failed. One that already sent a paid request still counts (ai_attempts).
  update public.plan_generations g
  set status = 'failed'
  where g.user_id = p_user and g.status = 'pending' and g.created_at < now() - c_pending_ttl;

  v_plus := exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.status in ('active', 'trialing') and (s.period_end is null or s.period_end > now())
  );

  -- Everything counts toward the burst limit, failed plans included.
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

  -- The monthly cap counts saved plans, requests still in flight, and any request that sent a paid model call or used
  -- paid tokens, even if it then failed (a timed-out call reports no tokens, but it was sent).
  select count(*) into v_month from public.plan_generations g
  where g.user_id = p_user
    and g.created_at >= (date_trunc('month', now() at time zone 'utc') at time zone 'utc')
    and (g.status in ('succeeded', 'pending') or g.ai_attempts > 0 or g.input_tokens > 0);
  v_cap := case when v_plus then c_plus_cap else c_free_cap end;
  if v_month >= v_cap then
    return query select false, case when v_plus then 'plan_cap' else 'plan_limit' end, null::uuid, v_plus;
    return;
  end if;

  -- Today's paid AI requests across everyone: requests that sent a paid call or used tokens, finished AI plans, and requests in
  -- flight that may still call a model (pending, not abandoned, not limited to the built-in planner).
  -- Counted in paid requests: a row that retried counts each attempt.
  select coalesce(sum(greatest(g.ai_attempts, 1)), 0) into v_daily from public.plan_generations g
  where g.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    and (g.ai_attempts > 0
      or g.input_tokens > 0
      or (g.status = 'succeeded' and g.provider is not null and g.provider not in ('basic', 'none'))
      or (g.status = 'pending' and g.provider is null and g.created_at >= now() - c_pending_ttl));
  v_ai_limit := case when v_plus then c_daily_ai_ceiling else floor(c_daily_ai_ceiling * c_free_share)::int end;
  if v_daily >= v_ai_limit then
    -- Over the AI budget: still plan the week, with the free built-in planner. provider 'basic' marks the row as one
    -- that will not call a model, so it does not hold AI budget while pending.
    insert into public.plan_generations (user_id, status, provider) values (p_user, 'pending', 'basic') returning id into v_id;
    return query select true, 'basic_only'::text, v_id, v_plus;
    return;
  end if;

  insert into public.plan_generations (user_id, status) values (p_user, 'pending') returning id into v_id;
  return query select true, null::text, v_id, v_plus;
end;
$$;

revoke all on function public.claim_plan_generation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_plan_generation(uuid, boolean) to service_role;

-- Counting today's rows across everyone stays an index scan.
create index if not exists plan_generations_created_at on public.plan_generations (created_at);
