-- One row per plan request, so a monthly cap can count regenerations. A regenerated week replaces its meal_plans
-- row (one row per user per week), so that table cannot show how many plans someone has asked for.

create table public.plan_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index plan_generations_user_month on public.plan_generations (user_id, created_at);

alter table public.plan_generations enable row level security;

-- People can see and add their own rows. Nothing updates or deletes them, so the count cannot be reset from the app.
create policy "plan_generations: read own" on public.plan_generations
  for select using (auth.uid() = user_id);

create policy "plan_generations: add own" on public.plan_generations
  for insert with check (auth.uid() = user_id);
