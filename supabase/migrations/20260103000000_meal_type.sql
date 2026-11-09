-- A plan now holds breakfast, lunch and dinner for each day, so each plan item records which meal it is.
-- The default only fills any rows saved before this column existed (they were all dinners) and is dropped
-- right after, so every new item has to say which meal it is.
alter table public.meal_plan_items
  add column if not exists meal_type text not null default 'dinner'
  check (meal_type in ('breakfast', 'lunch', 'dinner'));

alter table public.meal_plan_items alter column meal_type drop default;

-- One recipe per day and meal in a plan.
alter table public.meal_plan_items
  add constraint meal_plan_items_one_per_slot unique (plan_id, day_of_week, meal_type);
