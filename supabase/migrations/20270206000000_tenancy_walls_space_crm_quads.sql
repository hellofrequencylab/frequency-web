-- Tenancy walls, batch 1: per-Space RLS policy quads for the deny-all space_* and CRM tables.
--
-- THE GAP. After the CRM convergence pass (20260905000000) gave crm_deals / crm_activities /
-- crm_stages / contacts / client_notes their per-Space policies, the REST of the Space-scoped
-- operator surface stayed fail-closed: RLS enabled, zero policies, service-role only (the
-- documented posture in scripts/rls-deny-all.txt). That posture is safe but structurally blind:
-- isolation lives entirely in app-layer guards on the admin client, the DB proves nothing, and
-- the App Platform + white-label phases (ADR-921) are gated on DB-enforced walls existing.
--
-- THE FIX. Extend the canonical policy quad to every deny-all table that carries a space_id
-- tenancy column, in two shapes:
--
--   RESOURCE tables (operator-managed rows: CRM work items, campaigns, segments, templates,
--   drips, automations, invites, availability, offerings, tiers, programs) get the FULL QUAD,
--   byte-for-byte the shape live on public.contacts (20260905000000 + the operator-only read
--   narrowing in 20261215000000):
--     SELECT  private.can_write_space_content(space_id)
--             OR private.get_my_web_role() in ('admin','janitor')
--     INSERT  WITH CHECK private.can_write_space_content(space_id)
--     UPDATE  USING + WITH CHECK private.can_write_space_content(space_id)  (blocks cross-Space moves)
--     DELETE  USING private.can_write_space_content(space_id)
--
--   LEDGER and MEMBER-STATE tables (send/event ledgers written by crons and webhooks; membership,
--   enrollment, booking, RSVP, follow rows owned by a member but serviced by server actions) get
--   READ ARMS ONLY: the member sees their own row (member/follower profile id =
--   private.get_my_profile_id()), the Space's write-authorized operators see their Space's rows,
--   platform staff retain the global view. No client write policies: a ledger stays append-only
--   via the service-role path, and member-state transitions keep their server-side validation.
--   Client-side write arms land per table WITH the session-client convergence of that surface,
--   not before.
--
-- Helpers are called schema-qualified as private.* (ADR-847 moved them out of PostgREST reach;
-- this file sorts after 20270101000000, so private.* exists on a fresh apply). SERVICE ROLE
-- bypasses RLS, so every existing admin-client path is unchanged: this migration is additive
-- defense-in-depth plus the substrate the App Platform tenancy (ADR-921) requires.
--
-- Tables that stay deny-all ON PURPOSE (no space_id column; reachable only through the root
-- console or crons): segments, email_templates, automation_rules, nurture_* (the legacy global
-- CRM set), space_venue_holds, space_collaborations, space_availability_overrides,
-- space_function_type_defaults, space_follower_event_reminders_sent. They remain listed in
-- scripts/rls-deny-all.txt; giving the *_overrides table a join-based policy through its parent
-- schedule is a follow-up, not a blocker.
--
-- Cross-tenant proof: supabase/tests/space_tenancy_walls.test.sql (pgTAP) seeds two Spaces and
-- asserts the walls from every seat (operator, plain member, anon, cross-tenant operator).
--
-- House style: additive + idempotent (drop policy if exists / create), safe to re-run.

-- ── 0. Re-assert RLS (idempotent; already enabled from the table-creation migrations) ────────────
alter table public.crm_tasks                  enable row level security;
alter table public.contact_relationships      enable row level security;
alter table public.campaigns                  enable row level security;
alter table public.space_segments             enable row level security;
alter table public.space_email_templates      enable row level security;
alter table public.space_drip_sequences       enable row level security;
alter table public.space_drip_steps           enable row level security;
alter table public.space_drip_enrollments     enable row level security;
alter table public.space_automation_rules     enable row level security;
alter table public.space_invites              enable row level security;
alter table public.space_availability         enable row level security;
alter table public.space_availability_schedules enable row level security;
alter table public.space_service_types        enable row level security;
alter table public.space_donation_asks        enable row level security;
alter table public.space_membership_tiers     enable row level security;
alter table public.space_ticket_tiers         enable row level security;
alter table public.space_programs             enable row level security;
alter table public.outreach_sends             enable row level security;
alter table public.space_email_events         enable row level security;
alter table public.event_space_shares         enable row level security;
alter table public.space_memberships          enable row level security;
alter table public.space_enrollments          enable row level security;
alter table public.space_bookings             enable row level security;
alter table public.space_ticket_rsvps         enable row level security;
alter table public.space_follows              enable row level security;

-- ── 1. RESOURCE tables: the full operator quad ───────────────────────────────────────────────────
-- Written as literal statements (not a generated do-block) so scripts/check-rls.mjs can see every
-- policy statically. The quad is identical on every table; any drift between tables is a bug.

-- crm_tasks
drop policy if exists crm_tasks_space_read on public.crm_tasks;
create policy crm_tasks_space_read on public.crm_tasks
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists crm_tasks_space_insert on public.crm_tasks;
create policy crm_tasks_space_insert on public.crm_tasks
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists crm_tasks_space_update on public.crm_tasks;
create policy crm_tasks_space_update on public.crm_tasks
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists crm_tasks_space_delete on public.crm_tasks;
create policy crm_tasks_space_delete on public.crm_tasks
  for delete using (private.can_write_space_content(space_id));

-- contact_relationships
drop policy if exists contact_relationships_space_read on public.contact_relationships;
create policy contact_relationships_space_read on public.contact_relationships
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists contact_relationships_space_insert on public.contact_relationships;
create policy contact_relationships_space_insert on public.contact_relationships
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists contact_relationships_space_update on public.contact_relationships;
create policy contact_relationships_space_update on public.contact_relationships
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists contact_relationships_space_delete on public.contact_relationships;
create policy contact_relationships_space_delete on public.contact_relationships
  for delete using (private.can_write_space_content(space_id));

-- campaigns
drop policy if exists campaigns_space_read on public.campaigns;
create policy campaigns_space_read on public.campaigns
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists campaigns_space_insert on public.campaigns;
create policy campaigns_space_insert on public.campaigns
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists campaigns_space_update on public.campaigns;
create policy campaigns_space_update on public.campaigns
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists campaigns_space_delete on public.campaigns;
create policy campaigns_space_delete on public.campaigns
  for delete using (private.can_write_space_content(space_id));

-- space_segments
drop policy if exists space_segments_space_read on public.space_segments;
create policy space_segments_space_read on public.space_segments
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_segments_space_insert on public.space_segments;
create policy space_segments_space_insert on public.space_segments
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_segments_space_update on public.space_segments;
create policy space_segments_space_update on public.space_segments
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_segments_space_delete on public.space_segments;
create policy space_segments_space_delete on public.space_segments
  for delete using (private.can_write_space_content(space_id));

-- space_email_templates
drop policy if exists space_email_templates_space_read on public.space_email_templates;
create policy space_email_templates_space_read on public.space_email_templates
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_email_templates_space_insert on public.space_email_templates;
create policy space_email_templates_space_insert on public.space_email_templates
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_email_templates_space_update on public.space_email_templates;
create policy space_email_templates_space_update on public.space_email_templates
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_email_templates_space_delete on public.space_email_templates;
create policy space_email_templates_space_delete on public.space_email_templates
  for delete using (private.can_write_space_content(space_id));

-- space_drip_sequences
drop policy if exists space_drip_sequences_space_read on public.space_drip_sequences;
create policy space_drip_sequences_space_read on public.space_drip_sequences
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_drip_sequences_space_insert on public.space_drip_sequences;
create policy space_drip_sequences_space_insert on public.space_drip_sequences
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_drip_sequences_space_update on public.space_drip_sequences;
create policy space_drip_sequences_space_update on public.space_drip_sequences
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_drip_sequences_space_delete on public.space_drip_sequences;
create policy space_drip_sequences_space_delete on public.space_drip_sequences
  for delete using (private.can_write_space_content(space_id));

-- space_drip_steps
drop policy if exists space_drip_steps_space_read on public.space_drip_steps;
create policy space_drip_steps_space_read on public.space_drip_steps
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_drip_steps_space_insert on public.space_drip_steps;
create policy space_drip_steps_space_insert on public.space_drip_steps
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_drip_steps_space_update on public.space_drip_steps;
create policy space_drip_steps_space_update on public.space_drip_steps
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_drip_steps_space_delete on public.space_drip_steps;
create policy space_drip_steps_space_delete on public.space_drip_steps
  for delete using (private.can_write_space_content(space_id));

-- space_drip_enrollments
drop policy if exists space_drip_enrollments_space_read on public.space_drip_enrollments;
create policy space_drip_enrollments_space_read on public.space_drip_enrollments
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_drip_enrollments_space_insert on public.space_drip_enrollments;
create policy space_drip_enrollments_space_insert on public.space_drip_enrollments
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_drip_enrollments_space_update on public.space_drip_enrollments;
create policy space_drip_enrollments_space_update on public.space_drip_enrollments
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_drip_enrollments_space_delete on public.space_drip_enrollments;
create policy space_drip_enrollments_space_delete on public.space_drip_enrollments
  for delete using (private.can_write_space_content(space_id));

-- space_automation_rules
drop policy if exists space_automation_rules_space_read on public.space_automation_rules;
create policy space_automation_rules_space_read on public.space_automation_rules
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_automation_rules_space_insert on public.space_automation_rules;
create policy space_automation_rules_space_insert on public.space_automation_rules
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_automation_rules_space_update on public.space_automation_rules;
create policy space_automation_rules_space_update on public.space_automation_rules
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_automation_rules_space_delete on public.space_automation_rules;
create policy space_automation_rules_space_delete on public.space_automation_rules
  for delete using (private.can_write_space_content(space_id));

-- space_invites
drop policy if exists space_invites_space_read on public.space_invites;
create policy space_invites_space_read on public.space_invites
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_invites_space_insert on public.space_invites;
create policy space_invites_space_insert on public.space_invites
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_invites_space_update on public.space_invites;
create policy space_invites_space_update on public.space_invites
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_invites_space_delete on public.space_invites;
create policy space_invites_space_delete on public.space_invites
  for delete using (private.can_write_space_content(space_id));

-- space_availability
drop policy if exists space_availability_space_read on public.space_availability;
create policy space_availability_space_read on public.space_availability
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_availability_space_insert on public.space_availability;
create policy space_availability_space_insert on public.space_availability
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_availability_space_update on public.space_availability;
create policy space_availability_space_update on public.space_availability
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_availability_space_delete on public.space_availability;
create policy space_availability_space_delete on public.space_availability
  for delete using (private.can_write_space_content(space_id));

-- space_availability_schedules
drop policy if exists space_availability_schedules_space_read on public.space_availability_schedules;
create policy space_availability_schedules_space_read on public.space_availability_schedules
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_availability_schedules_space_insert on public.space_availability_schedules;
create policy space_availability_schedules_space_insert on public.space_availability_schedules
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_availability_schedules_space_update on public.space_availability_schedules;
create policy space_availability_schedules_space_update on public.space_availability_schedules
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_availability_schedules_space_delete on public.space_availability_schedules;
create policy space_availability_schedules_space_delete on public.space_availability_schedules
  for delete using (private.can_write_space_content(space_id));

-- space_service_types
drop policy if exists space_service_types_space_read on public.space_service_types;
create policy space_service_types_space_read on public.space_service_types
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_service_types_space_insert on public.space_service_types;
create policy space_service_types_space_insert on public.space_service_types
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_service_types_space_update on public.space_service_types;
create policy space_service_types_space_update on public.space_service_types
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_service_types_space_delete on public.space_service_types;
create policy space_service_types_space_delete on public.space_service_types
  for delete using (private.can_write_space_content(space_id));

-- space_donation_asks
drop policy if exists space_donation_asks_space_read on public.space_donation_asks;
create policy space_donation_asks_space_read on public.space_donation_asks
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_donation_asks_space_insert on public.space_donation_asks;
create policy space_donation_asks_space_insert on public.space_donation_asks
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_donation_asks_space_update on public.space_donation_asks;
create policy space_donation_asks_space_update on public.space_donation_asks
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_donation_asks_space_delete on public.space_donation_asks;
create policy space_donation_asks_space_delete on public.space_donation_asks
  for delete using (private.can_write_space_content(space_id));

-- space_membership_tiers
drop policy if exists space_membership_tiers_space_read on public.space_membership_tiers;
create policy space_membership_tiers_space_read on public.space_membership_tiers
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_membership_tiers_space_insert on public.space_membership_tiers;
create policy space_membership_tiers_space_insert on public.space_membership_tiers
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_membership_tiers_space_update on public.space_membership_tiers;
create policy space_membership_tiers_space_update on public.space_membership_tiers
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_membership_tiers_space_delete on public.space_membership_tiers;
create policy space_membership_tiers_space_delete on public.space_membership_tiers
  for delete using (private.can_write_space_content(space_id));

-- space_ticket_tiers
drop policy if exists space_ticket_tiers_space_read on public.space_ticket_tiers;
create policy space_ticket_tiers_space_read on public.space_ticket_tiers
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_ticket_tiers_space_insert on public.space_ticket_tiers;
create policy space_ticket_tiers_space_insert on public.space_ticket_tiers
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_ticket_tiers_space_update on public.space_ticket_tiers;
create policy space_ticket_tiers_space_update on public.space_ticket_tiers
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_ticket_tiers_space_delete on public.space_ticket_tiers;
create policy space_ticket_tiers_space_delete on public.space_ticket_tiers
  for delete using (private.can_write_space_content(space_id));

-- space_programs
drop policy if exists space_programs_space_read on public.space_programs;
create policy space_programs_space_read on public.space_programs
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

drop policy if exists space_programs_space_insert on public.space_programs;
create policy space_programs_space_insert on public.space_programs
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists space_programs_space_update on public.space_programs;
create policy space_programs_space_update on public.space_programs
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists space_programs_space_delete on public.space_programs;
create policy space_programs_space_delete on public.space_programs
  for delete using (private.can_write_space_content(space_id));

-- ── 2. LEDGER tables: operator + staff read only (append stays service-role) ─────────────────────

-- outreach_sends
drop policy if exists outreach_sends_space_read on public.outreach_sends;
create policy outreach_sends_space_read on public.outreach_sends
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- space_email_events
drop policy if exists space_email_events_space_read on public.space_email_events;
create policy space_email_events_space_read on public.space_email_events
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- event_space_shares
drop policy if exists event_space_shares_space_read on public.event_space_shares;
create policy event_space_shares_space_read on public.event_space_shares
  for select using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- ── 3. MEMBER-STATE tables: self + operator + staff read only ────────────────────────────────────
-- The member arm names the owning column per table; writes remain server-mediated.

-- space_memberships
drop policy if exists space_memberships_self_or_space_read on public.space_memberships;
create policy space_memberships_self_or_space_read on public.space_memberships
  for select using (
    member_profile_id = private.get_my_profile_id()
    or private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- space_enrollments
drop policy if exists space_enrollments_self_or_space_read on public.space_enrollments;
create policy space_enrollments_self_or_space_read on public.space_enrollments
  for select using (
    member_profile_id = private.get_my_profile_id()
    or private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- space_bookings
drop policy if exists space_bookings_self_or_space_read on public.space_bookings;
create policy space_bookings_self_or_space_read on public.space_bookings
  for select using (
    member_profile_id = private.get_my_profile_id()
    or private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- space_ticket_rsvps
drop policy if exists space_ticket_rsvps_self_or_space_read on public.space_ticket_rsvps;
create policy space_ticket_rsvps_self_or_space_read on public.space_ticket_rsvps
  for select using (
    member_profile_id = private.get_my_profile_id()
    or private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );

-- space_follows
drop policy if exists space_follows_self_or_space_read on public.space_follows;
create policy space_follows_self_or_space_read on public.space_follows
  for select using (
    follower_profile_id = private.get_my_profile_id()
    or private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
  );
