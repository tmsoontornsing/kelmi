-- What each plan request actually cost: which provider answered and how many tokens it used. Retries count, because
-- a failed attempt is billed too. Measuring this replaces the guessed token counts in the cost estimates.

alter table public.plan_generations
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists input_tokens integer not null default 0,
  add column if not exists output_tokens integer not null default 0;

-- The function fills these in after the request, as the caller. People may update only these four columns on their own
-- rows, so the date a request was made, which the monthly cap counts, cannot be changed from the app.
create policy "plan_generations: update own usage" on public.plan_generations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on public.plan_generations from anon, authenticated;
grant update (provider, model, input_tokens, output_tokens) on public.plan_generations to authenticated;
