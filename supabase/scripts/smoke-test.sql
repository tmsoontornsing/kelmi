-- Local smoke test for migrations 20261110..20261115. LOCAL ONLY: run it against `supabase start` after `supabase db reset`,
-- never against the hosted project:
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/scripts/smoke-test.sql
--
-- It makes a throwaway user, acts as the `authenticated` role, and checks that what must be refused is refused and what
-- must work works. Each check prints a NOTICE starting PASS or FAIL. Everything is rolled back at the end.

begin;

-- A test user and an (empty) profile, made as the superuser.
insert into auth.users (id, email, aud, role, instance_id)
values ('00000000-0000-4000-8000-0000000000a1', 'smoke@example.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000000a1')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
begin
  -- (a) Writing ai_consent_at directly must fail.
  begin
    update public.profiles set ai_consent_at = now() where id = '00000000-0000-4000-8000-0000000000a1';
    raise notice 'FAIL (a) a direct write to ai_consent_at was allowed';
  exception when others then
    raise notice 'PASS (a) direct write to ai_consent_at refused: % %', sqlstate, sqlerrm;
  end;

  -- (b) Inserting into plan_generations must fail (no insert grant or policy).
  begin
    insert into public.plan_generations (user_id) values ('00000000-0000-4000-8000-0000000000a1');
    raise notice 'FAIL (b) insert into plan_generations was allowed';
  exception when others then
    raise notice 'PASS (b) insert into plan_generations refused: % %', sqlstate, sqlerrm;
  end;

  -- (c) claim_plan_generation is for the service role only: expect permission denied (42501).
  begin
    perform * from public.claim_plan_generation('00000000-0000-4000-8000-0000000000a1', false);
    raise notice 'FAIL (c) claim_plan_generation was callable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS (c) claim_plan_generation: permission denied';
  when others then
    raise notice 'FAIL (c) wrong error: % %', sqlstate, sqlerrm;
  end;

  -- (d) record_consent('age') must work, and must stamp age_confirmed_at.
  begin
    perform public.record_consent('age');
    if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-0000000000a1' and age_confirmed_at is not null) then
      raise notice 'PASS (d) record_consent(age) ok';
    else
      raise notice 'FAIL (d) record_consent(age) ran but age_confirmed_at is empty';
    end if;
  exception when others then
    raise notice 'FAIL (d) record_consent(age) raised: % %', sqlstate, sqlerrm;
  end;
end;
$$;

reset role;
rollback;
