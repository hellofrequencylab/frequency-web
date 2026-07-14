-- Phase 5 — Unified segments + messaging control panel (docs/CRM-MASTER-BUILD-PLAN.md §Phase 5).
--
-- dispatch_recipients — the per-recipient LEDGER for a broadcast Dispatch fan-out. Until now a
-- Dispatch fanned out fire-and-forget and persisted NO record of who it reached (CRM-MASTER-BUILD
-- §2.E: "broadcasts persist no recipient log"), so a Dispatch could never appear in the "who-got-what"
-- messaging control panel alongside campaign sends (outreach_sends) and queued jobs (notification_queue).
-- This is that log: one row per (dispatch, member, channel) recording the send-gate outcome, written
-- during fan-out through the service-role admin client (fire-safe — a log write never breaks the send).
--
-- SCOPE / RLS (mirrors 20260625040000_event_dispatches.sql — author/staff, and the CRM RLS convergence):
--   • READ: platform staff (admin / janitor) OR the dispatch's own author (the scope owner who sent it).
--     A Dispatch is place-tree scoped (circle/hub/nexus/global), so "scope owner" is the author who was
--     already authorized to broadcast to that scope in app/(main)/broadcast/actions.ts.
--   • WRITE: none for authenticated. Rows are written ONLY by the service-role admin client during
--     fan-out (service_role keeps BYPASSRLS, so it is unaffected by the absence of a write policy).
-- FORCE ROW LEVEL SECURITY so even the table owner is subject to the policy. auth-derived predicate
-- (get_my_profile_id / get_my_web_role) is already an initplan-friendly function (ADR-365). Every
-- policy predicate column (dispatch_id, and dispatches.author_id it joins to) is indexed.
--
-- Additive + idempotent (create if not exists / drop-then-create). SAFE to re-run. No em/en dashes.

-- ── Table ─────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.dispatch_recipients (
  id           uuid primary key default gen_random_uuid(),
  dispatch_id  uuid not null references public.dispatches(id) on delete cascade,
  -- The member this touch was aimed at. Nullable so a deleted profile keeps the historical row.
  profile_id   uuid references public.profiles(id) on delete set null,
  -- Which lane: email | push (kept in lock-step with the fan-out in broadcast/actions.ts).
  channel      text not null check (channel in ('email', 'push')),
  -- The send-gate outcome: sent | skipped (pref/consent/cap) | suppressed (hard list) | failed.
  status       text not null check (status in ('sent', 'skipped', 'suppressed', 'failed')),
  -- The gate reason (send-gate SendGateReason) or an error note, for the control panel's "why".
  reason       text,
  -- The address the email lane targeted (null for push), for the control panel's per-person view.
  email        text,
  created_at   timestamptz not null default now()
);

create index if not exists dispatch_recipients_dispatch_idx on public.dispatch_recipients (dispatch_id, created_at desc);
create index if not exists dispatch_recipients_profile_idx  on public.dispatch_recipients (profile_id);
create index if not exists dispatch_recipients_status_idx   on public.dispatch_recipients (status);

comment on table public.dispatch_recipients is
  'Per-recipient ledger for a broadcast Dispatch fan-out (CRM Phase 5). One row per (dispatch, member, channel) recording the send-gate outcome. Service-role write during fan-out (fire-safe); staff/author read. Feeds the messaging control panel. See app/(main)/broadcast/actions.ts.';

-- ── RLS ───────────────────────────────────────────────────────────────────────────────────────────

alter table public.dispatch_recipients enable row level security;
alter table public.dispatch_recipients force  row level security;

-- READ: platform staff, or the author of the parent dispatch (the scope owner who sent it).
drop policy if exists dispatch_recipients_read on public.dispatch_recipients;
create policy dispatch_recipients_read on public.dispatch_recipients
  for select to authenticated
  using (
    public.get_my_web_role() in ('admin', 'janitor')
    or dispatch_id in (
      select d.id from public.dispatches d where d.author_id = public.get_my_profile_id()
    )
  );

-- No INSERT / UPDATE / DELETE policy: the ledger is written only by the service-role admin client
-- during fan-out, and is otherwise read-only (append-only in practice; no correction path).
