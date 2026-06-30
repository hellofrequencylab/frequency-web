-- T0 RLS convergence — per-Space Row Level Security POLICIES for the CRM tables.
--
-- THE GAP: the CRM tables (crm_deals / crm_activities / crm_stages / contacts, created
-- service-role-only in 20240221000000_studio_crm.sql + 20260605060000_crm_pipeline.sql) and
-- client_notes (20260713010000_crm_space_id_client_notes.sql) all carry a `space_id` tenancy
-- column (added + backfilled-to-root in 20260713010000) but have RLS ENABLED with ZERO client
-- policies — so every direct session-client read/write is denied and the ONLY access path is the
-- service-role admin client behind the app's CRM guards. As surfaces converge onto the caller's
-- session client (ADR-042 / the T0 RLS convergence), those tables need DB-enforced per-Space
-- tenant isolation so a Space owner/editor sees and writes ONLY their own Space's CRM rows.
--
-- THE FIX (POLICIES ONLY this pass): add permissive SELECT/INSERT/UPDATE/DELETE policies scoped by
-- the row's space_id, reusing the canonical, already-converged space helpers — NO new helper:
--   • SELECT  -> public.is_space_member(space_id)         (owner OR active member of the Space)
--               OR public.get_my_web_role() in ('admin','janitor')  (platform staff)
--   • INSERT  -> public.can_write_space_content(space_id) WITH CHECK
--   • UPDATE  -> public.can_write_space_content(space_id) USING + WITH CHECK (blocks cross-space moves)
--   • DELETE  -> public.can_write_space_content(space_id) USING
-- These mirror EXACTLY how the already-converged space-scoped tables do it:
--   - is_space_member in SELECT policies: commerce_products / commerce_orders
--     (20260815000000_commerce_core.sql), spaces_read_active (20260711080000) — the canonical read gate.
--   - can_write_space_content for the write authority: the *_space_writable_* policies on
--     circles/events/practices/journey_plans/programs (20260711100000_space_content_write_isolation.sql),
--     fixed to the get_my_profile_id() identity idiom in 20260902000000. That helper already folds in
--     the owner / active editor+/moderator/admin member / staff(+root) authority, so we reuse it
--     verbatim rather than re-deriving the predicate.
--
-- The staff arm on SELECT preserves the GLOBAL /admin/crm tool's whole-table view: it is staff-gated
-- and reads through the admin client (RLS bypass) today, so this only re-grants the same staff view
-- defensively for any session-client convergence, AND covers the backfilled root-space rows
-- (is_space_member(root) is false for a non-member, but staff retain access).
--
-- SERVICE ROLE retains full access: it bypasses RLS entirely, so the existing admin-client CRM
-- guards (lib/crm/pipeline.ts, lib/crm/client-notes.ts) are unchanged. These policies are PURELY
-- ADDITIVE defense-in-depth + the substrate for session-client convergence.
--
-- client_notes is GDPR/CCPA PERSONAL DATA and was deliberately fail-closed (RLS, zero policies). The
-- policies added here keep it strictly per-Space and never cross-space: read/write require Space
-- membership/write-authority for the note's space_id, exactly the owner-scoped model the app enforces
-- (getSpaceCapabilities). No staff SELECT arm is added to client_notes — personal data stays
-- owner/member-scoped only; staff reach it solely via the service-role path, as today.
--
-- SCOPE: POLICIES ONLY. space_id is left NULLABLE — flipping it to NOT NULL needs a separate
-- backfill-verification step (the contract phase, deferred to a follow-up migration). RLS is already
-- enabled on all five tables; the enables below are idempotent re-asserts.
--
-- House style: additive + idempotent (drop policy if exists / create), applied to production via the
-- Supabase SQL Editor. SAFE to re-run.

-- ── 0. Re-assert RLS is enabled (idempotent; already on from the table-creation migrations) ──────
alter table public.crm_deals      enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_stages     enable row level security;
alter table public.contacts       enable row level security;
alter table public.client_notes   enable row level security;

-- ── 1. crm_deals ────────────────────────────────────────────────────────────────────────────────
drop policy if exists crm_deals_space_read on public.crm_deals;
create policy crm_deals_space_read on public.crm_deals
  for select using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists crm_deals_space_insert on public.crm_deals;
create policy crm_deals_space_insert on public.crm_deals
  for insert with check (public.can_write_space_content(space_id));

drop policy if exists crm_deals_space_update on public.crm_deals;
create policy crm_deals_space_update on public.crm_deals
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists crm_deals_space_delete on public.crm_deals;
create policy crm_deals_space_delete on public.crm_deals
  for delete using (public.can_write_space_content(space_id));

-- ── 2. crm_activities ─────────────────────────────────────────────────────────────────────────
drop policy if exists crm_activities_space_read on public.crm_activities;
create policy crm_activities_space_read on public.crm_activities
  for select using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists crm_activities_space_insert on public.crm_activities;
create policy crm_activities_space_insert on public.crm_activities
  for insert with check (public.can_write_space_content(space_id));

drop policy if exists crm_activities_space_update on public.crm_activities;
create policy crm_activities_space_update on public.crm_activities
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists crm_activities_space_delete on public.crm_activities;
create policy crm_activities_space_delete on public.crm_activities
  for delete using (public.can_write_space_content(space_id));

-- ── 3. crm_stages ───────────────────────────────────────────────────────────────────────────────
drop policy if exists crm_stages_space_read on public.crm_stages;
create policy crm_stages_space_read on public.crm_stages
  for select using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists crm_stages_space_insert on public.crm_stages;
create policy crm_stages_space_insert on public.crm_stages
  for insert with check (public.can_write_space_content(space_id));

drop policy if exists crm_stages_space_update on public.crm_stages;
create policy crm_stages_space_update on public.crm_stages
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists crm_stages_space_delete on public.crm_stages;
create policy crm_stages_space_delete on public.crm_stages
  for delete using (public.can_write_space_content(space_id));

-- ── 4. contacts ─────────────────────────────────────────────────────────────────────────────────
drop policy if exists contacts_space_read on public.contacts;
create policy contacts_space_read on public.contacts
  for select using (
    public.is_space_member(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists contacts_space_insert on public.contacts;
create policy contacts_space_insert on public.contacts
  for insert with check (public.can_write_space_content(space_id));

drop policy if exists contacts_space_update on public.contacts;
create policy contacts_space_update on public.contacts
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists contacts_space_delete on public.contacts;
create policy contacts_space_delete on public.contacts
  for delete using (public.can_write_space_content(space_id));

-- ── 5. client_notes (PERSONAL DATA — owner/member-scoped, NO staff SELECT arm) ───────────────────
-- space_id is NOT NULL here, so is_space_member / can_write_space_content always evaluate a real
-- Space. Kept strictly per-Space: a note is visible/writable only to the owning Space's
-- members / write-authorized editors+, never cross-space and never via a blanket staff read.
drop policy if exists client_notes_space_read on public.client_notes;
create policy client_notes_space_read on public.client_notes
  for select using (public.is_space_member(space_id));

drop policy if exists client_notes_space_insert on public.client_notes;
create policy client_notes_space_insert on public.client_notes
  for insert with check (public.can_write_space_content(space_id));

drop policy if exists client_notes_space_update on public.client_notes;
create policy client_notes_space_update on public.client_notes
  for update
  using (public.can_write_space_content(space_id))
  with check (public.can_write_space_content(space_id));

drop policy if exists client_notes_space_delete on public.client_notes;
create policy client_notes_space_delete on public.client_notes
  for delete using (public.can_write_space_content(space_id));
