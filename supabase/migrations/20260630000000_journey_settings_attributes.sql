-- More Journey settings (ADR-302): difficulty, category + tags (for discovery), daily time, and an
-- optional enrollment cap. Cohort dates reuse journey_plans.window_starts_at / window_ends_at.
alter table public.journey_plans
  add column if not exists difficulty text,
  add column if not exists category text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists daily_minutes integer,
  add column if not exists enroll_cap integer;
