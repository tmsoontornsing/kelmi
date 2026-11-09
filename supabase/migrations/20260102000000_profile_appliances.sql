-- Kitchen equipment a household has, as ids such as 'oven' or 'slow-cooker'.
-- An empty list means the household has not said, so the plan function applies no equipment filter.
-- Existing profile policies already cover this column.
alter table public.profiles
  add column if not exists appliances text[] not null default '{}';
