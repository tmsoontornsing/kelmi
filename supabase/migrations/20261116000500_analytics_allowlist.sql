-- experiment_events holds anonymous usage counts and A/B events (apps/mobile/src/lib/analytics.ts, experiments.ts). The
-- app only sends a fixed list of names, but the table is writable by any signed-in account, so a script with the public key
-- could write anything (up to 64 characters) into it. Hold the table to the same list the app and the privacy policy use.
-- NOT VALID: old rows never block the deploy; it applies to every new write.
alter table public.experiment_events drop constraint if exists experiment_events_allowed;
alter table public.experiment_events add constraint experiment_events_allowed check (
  (experiment = 'app' and variant = 'all' and event in ('app_opened', 'plan_generated', 'grocery_list_built'))
  or (experiment = 'paywall_default_plan' and variant in ('annual', 'monthly')
      and event ~ '^(paywall_viewed|subscribe_tapped_[a-z_]+|plan_picked_[a-z_]+)$')
) not valid;

-- 500 a day per account was far more than the app ever sends (a handful of events a day). 50 still leaves room for normal use.
create or replace function public.experiment_events_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_daily constant int := 50;
begin
  new.created_at := now();
  perform pg_advisory_xact_lock(hashtextextended('experiment_events:' || new.user_id::text, 0));
  if (select count(*) from public.experiment_events where user_id = new.user_id and created_at > now() - interval '1 day') >= c_daily then
    return null;
  end if;
  return new;
end;
$$;
