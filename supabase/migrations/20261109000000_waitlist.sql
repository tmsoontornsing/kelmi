-- Email waitlist for usekavi.com. The website's server route inserts with the anon key; nobody can read, change or
-- delete the list through the API. Read it from the Supabase dashboard or with the service role.
create table public.waitlist (
  email text primary key
    check (length(email) <= 254 and email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Supabase grants new tables to anon and authenticated by default. Take that back, then give anon only what the
-- form needs: insert the email column. Without a select policy or grant, the list cannot be read through the API.
revoke all on table public.waitlist from anon, authenticated;
grant insert (email) on table public.waitlist to anon;

create policy "anyone can join the waitlist" on public.waitlist
  for insert to anon
  with check (true);
