-- 1. Trigger functions are never meant to be called through the API. Supabase's Security Advisor flagged three
-- SECURITY DEFINER ones as executable by anon and signed-in users (lints 0028 and 0029). Triggers keep firing: EXECUTE is
-- only checked when a trigger is created.
revoke all on function public.experiment_events_daily_cap() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.waitlist_throttle() from public, anon, authenticated;
revoke all on function public.protect_consent_columns() from public, anon, authenticated;
revoke all on function public.pantry_quota() from public, anon, authenticated;

-- 2. Per-person rate limits for the Edge Functions that do not call an AI provider (meal-options, grocery-list). They
-- still cost database reads and function time on a usage-billed project, and a function can be called directly,
-- bypassing the gateway's per-IP limit. A fixed window per person and bucket; only the service role can touch it.
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 40),
  window_start timestamptz not null default now(),
  hits int not null default 0,
  primary key (user_id, bucket)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- True when this call is within p_max calls per p_window_seconds, and counts it.
create or replace function public.hit_rate_limit(p_user uuid, p_bucket text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  if p_user is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'bad rate limit arguments' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
    set window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
        hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

revoke all on function public.hit_rate_limit(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(uuid, text, int, int) to service_role;
grant select, insert, update, delete on public.rate_limits to service_role;
