-- =====================================================================
-- 🔴 SECURITY: the EVENT claim token had the same hole as the Space one
-- (sibling of 20270127000000)
-- =====================================================================
-- Found by the drift guard written for the Space fix: it flags any module
-- selecting `claim_token`, and it flagged two EVENT readers. Checking the
-- sibling table showed the identical defect, at larger scale.
--
-- Executed as `role anon` with RLS enforced, before this migration:
--
--     select slug, claim_token from events where claim_token is not null;
--
-- returned every token. 23 events carry one, 21 of them still unclaimed.
-- `/events/claim/<token>` transfers the event to whoever presents it.
--
-- Same root cause as the Space case: `claim_token` is a plain column on a
-- table that is anon-readable at the ROW level (public events must be
-- listable), and RLS is row-level, so the policy returns the row and hands
-- over the secret with it.
--
-- Same fix, and the same trap: 🔴 a column-level `revoke select
-- (claim_token)` is a SILENT NO-OP against the table-wide grant these
-- roles hold. It reports success and changes nothing. Drop the table-level
-- SELECT, then re-grant the allowed columns explicitly.
--
-- ⚠️ FAIL-CLOSED CONSEQUENCE: a column added to `events` later is not
-- readable by anon/authenticated until granted. That is intended. Any new
-- public column needs one line in its own migration:
--     grant select (new_col) on public.events to anon, authenticated;
--
-- ⚠️ `select *` ERRORS under partial column grants rather than omitting.
-- Verified before applying: the app issues no `select('*')` and no
-- embedded `events(*)` against this table.
--
-- APP IMPACT: none. The two readers that legitimately touch the token are
-- server-side and already correct — app/(main)/events/[slug]/page.tsx
-- reads it on the ADMIN client (service_role, unaffected) and only ever
-- renders it when `myProfileId === postedById`, and
-- app/(main)/admin/events/posted-actions.ts is operator-only. The anon
-- event RPCs narrowed by ADR-903 never selected it.
--
-- `claimed_at` is deliberately KEPT readable: "is this event claimed?" is
-- public state the UI branches on, and it discloses nothing.
--
-- NOT COVERED HERE: the 21 live tokens must be treated as disclosed.
-- Rotation is the operator's call, not a migration's, because it
-- invalidates claim links already sent. See the PR follow-up note.
-- =====================================================================

revoke select on public.events from anon, authenticated;

grant select (
  id, title, description, host_id, scope_id, scope_type, location,
  starts_at, ends_at, slug, is_cancelled, mux_stream_id, mux_playback_id,
  created_at, recurrence_type, recurrence_until, parent_event_id, is_demo,
  price_cents, currency, capacity, visibility, category, energy_tag,
  status, published_at, posted_by_profile_id, poster_path, source,
  domain_id, claimed_at, organizer_name, organizer_contact, removed_at,
  removed_reason, details, geog, venue_name, street, city, region,
  country, postal_code, attendance_mode, online_url, cover_image_path,
  theme, featured_at, space_id, gallery_image_paths, scope_circle_id,
  scope_region_id, cancelled_at, cancelled_by, cancellation_reason,
  time_zone, venmo_handle, host_space_id, hide_address, join_mode,
  journey_id
) on public.events to anon, authenticated;

revoke insert (claim_token) on public.events from anon, authenticated;
revoke update (claim_token) on public.events from anon, authenticated;

comment on column public.events.claim_token is
  'One-time secret that transfers ownership of an unclaimed posted event to whoever presents it at /events/claim/<token>. service_role ONLY: 20270128000000 revoked the table-wide SELECT on events and re-granted every column except this one, because events is anon-readable at the ROW level and RLS cannot hide a column (a column-level revoke against a table-level grant is a silent no-op). Read it only on the admin client, and only behind an ownership check. A NEW public column on events needs its own explicit grant.';
