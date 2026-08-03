-- Practice reminders join the notification grid (ADR-920 Phase 3). A new `practice` category
-- with the standard three channels plus a frequency, matching the existing per-category shape
-- (20240206000000). Defaults follow the evidence + the house posture: in-app ON (the quiet
-- rail), email OFF (a daily reminder email is churn fuel; the weekly digest carries the recap),
-- push OFF (push always starts opt-in here, it needs a browser grant anyway).
--
-- The reminder itself is scheduled by /api/cron/practice-lifecycle: at most ONE a day, at the
-- hour the member usually practices (derived from their own log history), tz-correct via
-- profiles.home_timezone. Additive + idempotent; safe to re-run.

alter table public.notification_preferences
  add column if not exists email_practice boolean not null default false,
  add column if not exists inapp_practice boolean not null default true,
  add column if not exists push_practice  boolean not null default false,
  add column if not exists freq_practice  text    not null default 'realtime'
    check (freq_practice in ('realtime', 'daily_digest', 'weekly_digest'));

comment on column public.notification_preferences.inapp_practice is
  'Practice reminders + practice-complete notices, in-app. Default on. ADR-920 Phase 3.';
comment on column public.notification_preferences.push_practice is
  'Practice reminders by push, opt-in (needs a browser grant). At most one a day, at the member''s usual hour.';
