-- Waitlist: record which version of the privacy notice the person agreed to, and bound a direct flood of the public
-- insert (anyone with the anon key can post to the API without going through the website).

alter table public.waitlist
  add column if not exists consent_version text check (consent_version is null or char_length(consent_version) <= 40);

-- Anon may insert only these columns; created_at is the server's.
grant insert (email, consent_version) on table public.waitlist to anon;

create index if not exists waitlist_created_at_idx on public.waitlist (created_at);

-- Table-wide, because a request through the API has no usable per-person identity: at most 30 sign-ups a minute and
-- 500 an hour. A real flood is cut off; the cost is that a flood also pauses real sign-ups until it ends. Security
-- definer, because anon cannot read the table it is counting.
create or replace function public.waitlist_throttle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_per_minute constant int := 30;
  c_per_hour constant int := 500;
begin
  perform pg_advisory_xact_lock(hashtextextended('waitlist', 0));
  if (select count(*) from public.waitlist where created_at > now() - interval '1 minute') >= c_per_minute
     or (select count(*) from public.waitlist where created_at > now() - interval '1 hour') >= c_per_hour then
    raise exception 'Too many sign-ups right now. Try again in a few minutes.' using errcode = 'P0001', hint = 'waitlist_throttled';
  end if;
  return new;
end;
$$;

drop trigger if exists waitlist_throttle_check on public.waitlist;
create trigger waitlist_throttle_check before insert on public.waitlist
  for each row execute function public.waitlist_throttle();
