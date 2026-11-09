-- Foods a household likes, as free text such as 'Pasta' or 'Pad thai'. The plan function offers recipes that
-- match these first. An empty list means none chosen, so planning is unchanged.
-- Existing profile policies already cover this column. Adding it needs no backfill and does not affect old app builds.
alter table public.profiles
  add column if not exists likes text[] not null default '{}';
