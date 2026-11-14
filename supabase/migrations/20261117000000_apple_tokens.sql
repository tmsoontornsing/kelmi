-- Sign in with Apple: the refresh token Apple gave us at sign-in, kept only so the delete-account function can tell Apple to
-- revoke it when the person deletes their account (App Store Review Guideline 5.1.1(v)). Nobody can read or write it through
-- the API: only the service role (the apple-link and delete-account functions) touches it. It goes with the account.
create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null check (char_length(refresh_token) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.apple_tokens enable row level security;
revoke all on public.apple_tokens from public, anon, authenticated;
