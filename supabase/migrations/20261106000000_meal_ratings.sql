-- How a household rated a meal after cooking it: 1 (not for us) to 5 (make it again). One rating per person per recipe.
create table public.meal_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  rated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.meal_ratings enable row level security;
create policy "meal_ratings: own rows" on public.meal_ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
