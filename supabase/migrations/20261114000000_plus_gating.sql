-- Plus-only writes are enforced by the database, not just hidden in the app. Nobody can be Plus until billing writes a
-- subscriptions row (service role only), so for now these writes are closed to everyone.

-- Recipe edits: anyone can read and delete their own (so someone whose Plus ended can still see and clear them), but
-- adding or changing one needs an active subscription.
drop policy if exists "recipe_edits: own rows" on public.recipe_edits;
drop policy if exists "recipe_edits: read own" on public.recipe_edits;
drop policy if exists "recipe_edits: add as plus" on public.recipe_edits;
drop policy if exists "recipe_edits: change as plus" on public.recipe_edits;
drop policy if exists "recipe_edits: delete own" on public.recipe_edits;

create policy "recipe_edits: read own" on public.recipe_edits
  for select using (auth.uid() = user_id);
create policy "recipe_edits: add as plus" on public.recipe_edits
  for insert with check (auth.uid() = user_id and public.user_is_plus(auth.uid()));
create policy "recipe_edits: change as plus" on public.recipe_edits
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id and public.user_is_plus(auth.uid()));
create policy "recipe_edits: delete own" on public.recipe_edits
  for delete using (auth.uid() = user_id);

-- The free pantry limit is the pantry_quota trigger in 20261112000000_input_limits.sql.
