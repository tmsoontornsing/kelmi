-- What a household is eating toward, and how much meat they like. The plan function uses these to choose recipes:
--   goal: 'maintain' (balanced, the default), 'cut' (lighter meals with more protein), 'bulk' (bigger meals with
--         more calories and protein).
--   meat_level: 'light' (a couple of meat meals a week), 'some' (the default, meat at most dinners), 'lots' (meat in
--         most meals). It only matters for diets that allow meat.
-- Existing profile policies already cover these columns. The defaults leave current households' plans unchanged, and
-- old app builds, which never send them, keep working.
alter table public.profiles
  add column if not exists goal text not null default 'maintain' check (goal in ('maintain', 'cut', 'bulk')),
  add column if not exists meat_level text not null default 'some' check (meat_level in ('light', 'some', 'lots'));
