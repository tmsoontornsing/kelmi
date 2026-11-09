-- A/B test log: which variant of an experiment someone was in, and what they did. One row per event, so a result is
-- a count of events per variant (for example paywall_viewed against subscribe_tapped). Read it with the service role
-- or the SQL editor; the app can add rows but never read them back.

create table public.experiment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- A random id kept on the device, so a person keeps the same variant before and after signing in.
  install_id text not null,
  experiment text not null,
  variant text not null,
  event text not null,
  created_at timestamptz not null default now()
);

create index experiment_events_by_experiment on public.experiment_events (experiment, variant, event);

alter table public.experiment_events enable row level security;

create policy "experiment_events: add own" on public.experiment_events
  for insert with check (auth.uid() = user_id);

-- Example result for one experiment: people who saw the paywall, and how many of them tapped Continue.
--   select variant,
--          count(distinct user_id) filter (where event = 'paywall_viewed') as viewed,
--          count(distinct user_id) filter (where event like 'subscribe_tapped%') as subscribed
--   from experiment_events where experiment = 'paywall_default_plan' group by variant;
