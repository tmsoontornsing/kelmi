-- Free-text food notes ("low sugar") a household types in Settings. Only a soft hint to the planner.
-- Existing profile policies already cover this column.
alter table profiles add column if not exists food_notes text not null default '' check (char_length(food_notes) <= 300);
