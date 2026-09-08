-- =============================================================================
-- Reports: a Guestbook note becomes a valid report target (PROG-SPOT, ADR-1279).
--
-- `reports.target_type` is a CHECK over a closed list (20240117000000_reports.sql);
-- the app's runtime allowlist (app/(main)/feed/report-actions.ts VALID_TARGETS)
-- mirrors it. Adding 'guestbook' lets a signed-in member flag a note on a Spotlight
-- through the same dialog + moderation queue posts and comments use; the queue's
-- "actioned" verdict soft-hides the note (spotlight_guestbook.hidden_at), which is
-- the same hide seam the guestbook owner already holds.
--
-- Additive and idempotent: the constraint is re-created under its default name
-- with the widened list, so re-running is a no-op in effect.
-- =============================================================================

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('post', 'dispatch', 'comment', 'member', 'event', 'guestbook'));

comment on column public.reports.target_type is
  'What the report names: post | dispatch | comment | member | event | guestbook (a spotlight_guestbook note, ADR-1279). Mirrored by VALID_TARGETS in app/(main)/feed/report-actions.ts.';
