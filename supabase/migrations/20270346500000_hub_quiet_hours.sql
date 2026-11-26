-- Quiet hours for hub notices (EMAIL-091).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- The notice ladder (lib/notifications/ladder.ts) holds a push or an email that would land inside
-- a person's quiet hours until the window ends; the bell still rings at once. Two hours of the day
-- in the person's own time zone (profiles.home_timezone, Pacific when unset). Both null, or equal,
-- means no quiet hours. The SMS quiet window (sms_quiet_*) stays its own: SMS is a separate
-- channel with its own legal hours.
--
-- Additive and idempotent. ROLLBACK:
--   alter table public.notification_preferences drop column if exists quiet_hours_start;
--   alter table public.notification_preferences drop column if exists quiet_hours_end;

alter table public.notification_preferences
  add column if not exists quiet_hours_start smallint check (quiet_hours_start is null or quiet_hours_start between 0 and 23),
  add column if not exists quiet_hours_end smallint check (quiet_hours_end is null or quiet_hours_end between 0 and 23);

comment on column public.notification_preferences.quiet_hours_start is
  'Hour (0-23, the person''s own time zone) from which hub pushes and emails wait (EMAIL-091). Null: no quiet hours.';
comment on column public.notification_preferences.quiet_hours_end is
  'Hour (0-23) at which held hub pushes and emails go out. Equal to start, or null: no quiet hours.';
