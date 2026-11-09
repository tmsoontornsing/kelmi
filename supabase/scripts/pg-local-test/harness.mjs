// Supabase-like harness on PGlite (Postgres in WASM). LOCAL ONLY.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = process.env.KAVI_MIGRATIONS ?? path.resolve(here, '../../migrations');

export const BOOTSTRAP = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit login;
grant anon, authenticated, service_role to authenticator;
create role supabase_admin superuser;

create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table auth.users enable row level security;
grant usage on schema auth to anon, authenticated, service_role;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;

-- Supabase default privileges: everything new in public is granted to the three API roles.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.waitReady;
  await db.exec(BOOTSTRAP);
  return db;
}

export function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

export async function applyOne(db, file) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  await db.exec('begin;\n' + sql + '\ncommit;');
}

// Applies each file in order, one transaction per file (like supabase). Returns [{file, ok, error}].
export async function applyAll(db, { from = '', to = '￿', only = null } = {}) {
  const out = [];
  for (const f of migrationFiles()) {
    const v = f.slice(0, 14);
    if (v < from.slice(0, 14) || v > to.slice(0, 14)) continue;
    if (only && !only.includes(f)) continue;
    try { await applyOne(db, f); out.push({ file: f, ok: true }); }
    catch (e) { try { await db.exec('rollback'); } catch {} out.push({ file: f, ok: false, error: e.message }); }
  }
  return out;
}

// Run fn as an API role with a JWT sub (PostgREST-like: role switch + request.jwt.claims GUCs, session-level, then reset).
export async function as(db, role, uid, fn) {
  await db.exec('reset role');
  const claims = JSON.stringify({ role, ...(uid ? { sub: uid } : {}) });
  await db.query(`select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('request.jwt.claim.role', $3, false)`, [claims, uid ?? '', role]);
  await db.exec(`set role ${role}`);
  try { return await fn(db); }
  finally {
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claims','',false), set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claim.role','',false)`);
  }
}
