-- Kelmi core schema. RLS is enabled on every table.

create extension if not exists "pgcrypto";

-- Profiles: one row per auth user
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  household_size int not null default 2 check (household_size between 1 and 12),
  weekly_budget_usd numeric(8, 2) check (weekly_budget_usd >= 0),
  diet text,
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Ingredients: static price table, shared catalog (read-only to users)
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aisle text not null,
  avg_price_usd numeric(8, 2) not null check (avg_price_usd >= 0),
  unit text not null
);

-- Recipes: shared catalog imported from CSV (read-only to users)
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  steps text not null,
  servings int not null check (servings > 0),
  minutes int not null check (minutes > 0),
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null,
  primary key (recipe_id, ingredient_id)
);

-- Meal plans: one per user per week
create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  status text not null default 'generated' check (status in ('generated', 'active', 'archived')),
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 1 and 7)
);

-- Pantry: what the user already has
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  unique (user_id, ingredient_id)
);

-- Households and grocery lists
create table public.household_members (
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  primary key (owner_id, member_id)
);

create table public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.meal_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  estimated_total_usd numeric(8, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.grocery_lists (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null,
  checked boolean not null default false
);

-- Subscriptions: written by RevenueCat and Stripe webhooks (service role only)
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('revenuecat', 'stripe')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  period_end timestamptz,
  external_id text,
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.pantry_items enable row level security;
alter table public.household_members enable row level security;
alter table public.grocery_lists enable row level security;
alter table public.grocery_items enable row level security;
alter table public.subscriptions enable row level security;

-- Own-row policies
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "meal_plans: own rows" on public.meal_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "meal_plan_items: via own plan" on public.meal_plan_items
  for all using (exists (
    select 1 from public.meal_plans p where p.id = plan_id and p.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.meal_plans p where p.id = plan_id and p.user_id = auth.uid()
  ));

create policy "pantry_items: own rows" on public.pantry_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "grocery_lists: own rows" on public.grocery_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "grocery_items: via own list" on public.grocery_items
  for all using (exists (
    select 1 from public.grocery_lists l where l.id = list_id and l.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.grocery_lists l where l.id = list_id and l.user_id = auth.uid()
  ));

create policy "household_members: owner or member" on public.household_members
  for select using (auth.uid() = owner_id or auth.uid() = member_id);

create policy "subscriptions: own read" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Catalog tables: readable by signed-in users, written only by service role / import script
create policy "ingredients: read" on public.ingredients
  for select using (auth.role() = 'authenticated');

create policy "recipes: read" on public.recipes
  for select using (auth.role() = 'authenticated');

create policy "recipe_ingredients: read" on public.recipe_ingredients
  for select using (auth.role() = 'authenticated');

-- Subscriptions and household writes happen only through the service role (no insert/update policies).
