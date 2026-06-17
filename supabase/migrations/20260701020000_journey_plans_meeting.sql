-- Meeting / format details for a Journey (ADR-302 settings expansion): how a Circle gathers around
-- it — virtual / in person / hybrid, when it meets, where, a join link, and any notes. A single
-- jsonb so the shape can grow without a migration per field.
--   { "format": "virtual"|"in_person"|"hybrid"|null, "schedule": text, "location": text,
--     "link": text, "notes": text }
alter table public.journey_plans
  add column if not exists meeting jsonb not null default '{}'::jsonb;

comment on column public.journey_plans.meeting is
  'Meeting/format details: { format, schedule, location, link, notes }. How a Circle gathers around the Journey.';
