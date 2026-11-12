-- Waitlist: no more direct inserts with the public anon key.
--
-- Before this, anyone holding the anon key (it is public, and the app's gateway added it for anyone) could insert into
-- public.waitlist through the REST API, skipping the website's checks. That allowed three things:
--   * finding out whether an address is on the list (a duplicate came back as 409, a new address as 201);
--   * filling the table-wide throttle with junk so that real people could not sign up;
--   * adding rows without a consent version.
-- Now the only way in is public.join_waitlist(), callable by the service role only (the website's server route), which
-- answers the same way for a new address and one already on the list.

-- 1. Take away the public insert.
revoke insert on table public.waitlist from anon, authenticated;
drop policy if exists "anyone can join the waitlist" on public.waitlist;

-- 2. A consent version is required from now on. NOT VALID: rows from before consent_version existed are kept as they are,
-- every new or changed row is checked.
alter table public.waitlist drop constraint if exists waitlist_consent_version_required;
alter table public.waitlist
  add constraint waitlist_consent_version_required check (consent_version is not null) not valid;

-- 3. The sign-up function. Validates the address and the consent version, stores the address in lower case, and does
-- nothing (with no error and no hint either way) when the address is already on the list.
create or replace function public.join_waitlist(p_email text, p_consent_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_consent_version is null or p_consent_version !~ '^waitlist-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid consent version' using errcode = '22023';
  end if;
  insert into public.waitlist (email, consent_version) values (v_email, p_consent_version)
  on conflict (email) do nothing;
end;
$$;

revoke all on function public.join_waitlist(text, text) from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text) to service_role;

-- 4. The throttle stays as a backstop behind the website's per-address limit, set higher now that only the website can
-- insert: a flood that gets past the website still stops at 120 a minute / 2000 an hour, and ordinary bursts (a post that
-- goes around) no longer pause real sign-ups. A duplicate still passes through the trigger before the conflict is seen,
-- so it gets the same answer as a new address when the throttle is on.
create or replace function public.waitlist_throttle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_per_minute constant int := 120;
  c_per_hour constant int := 2000;
begin
  perform pg_advisory_xact_lock(hashtextextended('waitlist', 0));
  if (select count(*) from public.waitlist where created_at > now() - interval '1 minute') >= c_per_minute
     or (select count(*) from public.waitlist where created_at > now() - interval '1 hour') >= c_per_hour then
    raise exception 'Too many sign-ups right now. Try again in a few minutes.' using errcode = 'P0001', hint = 'waitlist_throttled';
  end if;
  return new;
end;
$$;
