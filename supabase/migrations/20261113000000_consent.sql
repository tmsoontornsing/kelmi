-- Proof of consent: when someone confirmed their age, agreed to share their household details with an AI planner,
-- acknowledged the allergy notice, and accepted the Terms. The app reports each through record_consent(); it cannot
-- write these columns itself, so a client can neither skip a step nor back-date it.

alter table public.profiles
  add column if not exists age_confirmed_at timestamptz,
  add column if not exists ai_consent_at timestamptz,
  add column if not exists allergy_ack_at timestamptz;
-- terms_accepted_at and terms_version already exist (20261104000000_terms_consent.sql).

-- The "profiles: own row" policy is for all columns and Supabase grants the whole table to signed-in users, so a
-- column-level revoke would not take effect. Reject changes instead: only a trusted role (the service role, or a
-- security definer function such as record_consent, whose current_user is its owner) may touch these columns.
create or replace function public.protect_consent_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.age_confirmed_at is not null or new.ai_consent_at is not null or new.allergy_ack_at is not null
         or new.terms_accepted_at is not null or new.terms_version is not null then
        raise exception 'consent is recorded with record_consent()' using errcode = '42501';
      end if;
    elsif new.age_confirmed_at is distinct from old.age_confirmed_at
       or new.ai_consent_at is distinct from old.ai_consent_at
       or new.allergy_ack_at is distinct from old.allergy_ack_at
       or new.terms_accepted_at is distinct from old.terms_accepted_at
       or new.terms_version is distinct from old.terms_version then
      raise exception 'consent is recorded with record_consent()' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_consent on public.profiles;
create trigger profiles_protect_consent before insert or update on public.profiles
  for each row execute function public.protect_consent_columns();

-- p_kind: 'age', 'ai', 'allergy', 'terms' (p_version is the terms version they saw), or 'ai_revoke' to turn AI
-- sharing off again. Only ever the signed-in user's own row, always at server time.
create or replace function public.record_consent(p_kind text, p_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_kind not in ('age', 'ai', 'allergy', 'terms', 'ai_revoke') then
    raise exception 'unknown consent kind' using errcode = '22023';
  end if;
  if p_kind = 'terms' and (p_version is null or char_length(p_version) not between 1 and 40) then
    raise exception 'terms need a version of 1 to 40 characters' using errcode = '22023';
  end if;

  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;

  if p_kind = 'age' then
    update public.profiles set age_confirmed_at = now() where id = v_user;
  elsif p_kind = 'ai' then
    update public.profiles set ai_consent_at = now() where id = v_user;
  elsif p_kind = 'ai_revoke' then
    update public.profiles set ai_consent_at = null where id = v_user;
  elsif p_kind = 'allergy' then
    update public.profiles set allergy_ack_at = now() where id = v_user;
  else
    update public.profiles set terms_accepted_at = now(), terms_version = p_version where id = v_user;
  end if;
end;
$$;

revoke all on function public.record_consent(text, text) from public, anon;
grant execute on function public.record_consent(text, text) to authenticated;
