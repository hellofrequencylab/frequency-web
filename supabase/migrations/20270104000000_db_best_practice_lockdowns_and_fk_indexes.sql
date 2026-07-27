-- Database best-practice sweep (2026-07-27, closes the meta scan's "needs your call" items).
-- Three lockdowns and one dedup, each verified against BOTH the live catalog and the code's
-- actual call sites before being written — the status doc's claims were re-checked, and two
-- were stale (see ADR-856):
--
--   circle_momentum      IS called on the AUTHED client (lib/connections/metrics.ts →
--                        components/connections/circle-momentum.tsx), so authenticated KEEPS
--                        EXECUTE; only anon loses it. Anon could previously read membership
--                        and friendship-tie counts for any circle id.
--   resonance_neighbors  is called only via the SERVICE-ROLE client (lib/resonance/embeddings)
--                        and from two SECURITY DEFINER SQL functions (housing_match_candidates,
--                        housing_roommate_matches), whose inner calls are ACL-checked as the
--                        function OWNER, not the end caller. Revoking anon+authenticated is
--                        therefore behaviour-preserving; it exposed any profile's similarity
--                        graph before.
--   mkt_interest_demand  is called only via the SERVICE-ROLE client (lib/analytics/
--                        marketing-intel.ts, admin insights). Channel-demand BI was
--                        anon-callable; the rest of the mkt_* family was locked down in
--                        20261185000000 and this one was missed.
--
--   record_qr_scan       had TWO overloads, both anon-executable. The 8-arg one already
--                        defaults p_variant to null, so the 7-arg twin is pure hazard: a call
--                        that omits p_variant (every scan with no A/B variant — the /q/<slug>
--                        route drops undefined keys) can resolve to the old body and silently
--                        lose variant attribution. Drop the 7-arg; every call now lands on the
--                        one true function.
--
-- Then the 19 unindexed foreign keys the performance advisor flags. All 19 point at
-- profiles / spaces / contacts — tables we genuinely DELETE from (profile deletion is a real
-- flow; 20240212000000 exists precisely because of it). Each parent-row delete makes Postgres
-- probe every child FK; unindexed, that is a sequential scan per child table, which is the
-- classic delete-stall. All 19 arrived with #1961's new tables, so they are empty-or-tiny now
-- and the indexes are effectively free. Precedent: 20260820000000 + 20261186000000.

-- ── Lockdowns ─────────────────────────────────────────────────────────────────────────────
-- Postgres grants functions to PUBLIC by default, and a role-specific revoke does nothing
-- while the PUBLIC grant stands — has_function_privilege('anon', …) stays true. So each
-- lockdown here is revoke-from-PUBLIC first, then explicit grants for exactly the roles the
-- verified call sites use.
revoke execute on function public.circle_momentum(uuid) from public, anon;
grant execute on function public.circle_momentum(uuid) to authenticated, service_role;

revoke execute on function public.resonance_neighbors(uuid, integer) from public, anon, authenticated;
grant execute on function public.resonance_neighbors(uuid, integer) to service_role;

revoke execute on function public.mkt_interest_demand() from public, anon, authenticated;
grant execute on function public.mkt_interest_demand() to service_role;

drop function if exists public.record_qr_scan(uuid, uuid, text, text, double precision, double precision, text);

-- ── FK covering indexes (single-column, matching the advisor's list exactly) ──────────────
create index if not exists ix_app_instances_created_by on public.app_instances (created_by);
create index if not exists ix_circle_transfer_offers_from_profile_id on public.circle_transfer_offers (from_profile_id);
create index if not exists ix_circle_transfer_offers_from_space_id on public.circle_transfer_offers (from_space_id);
create index if not exists ix_comms_assignments_assigned_by on public.comms_assignments (assigned_by);
create index if not exists ix_comms_assignments_assigned_to on public.comms_assignments (assigned_to);
create index if not exists ix_comms_conversations_created_by on public.comms_conversations (created_by);
create index if not exists ix_comms_conversations_owner_profile_id on public.comms_conversations (owner_profile_id);
create index if not exists ix_comms_messages_author_contact_id on public.comms_messages (author_contact_id);
create index if not exists ix_comms_messages_author_id on public.comms_messages (author_id);
create index if not exists ix_event_space_shares_invited_by_space_id on public.event_space_shares (invited_by_space_id);
create index if not exists ix_event_space_shares_requested_by on public.event_space_shares (requested_by);
create index if not exists ix_event_space_shares_responded_by on public.event_space_shares (responded_by);
create index if not exists ix_journey_drip_sends_profile_id on public.journey_drip_sends (profile_id);
create index if not exists ix_space_collaborations_invited_by_space_id on public.space_collaborations (invited_by_space_id);
create index if not exists ix_space_collaborations_requested_by on public.space_collaborations (requested_by);
create index if not exists ix_space_collaborations_responded_by on public.space_collaborations (responded_by);
create index if not exists ix_space_follower_event_reminders_sent_profile_id on public.space_follower_event_reminders_sent (profile_id);
create index if not exists ix_space_venue_holds_requested_by on public.space_venue_holds (requested_by);
create index if not exists ix_space_venue_holds_responded_by on public.space_venue_holds (responded_by);
