-- =============================================================================
-- Foreign-key covering indexes (performance hardening).
--
-- Source: first automated /maintenance advisor sweep, 2026-06-02
-- (docs/maintenance/2026-06-02.md). The performance advisor flagged 45 foreign
-- keys with no covering index, forcing sequential scans on joins and cascade
-- deletes. All statements are PURELY ADDITIVE and idempotent
-- (CREATE INDEX IF NOT EXISTS) — no access or behaviour change. Follows the same
-- pattern as 20240305000000_perf_indexes.sql.
--
-- DRAFT — pending apply to prod (`supabase db push` or the SQL editor).
--
-- DEFERRED (NOT here — they change behaviour / need per-item review; see the
-- report "highest-priority queue"):
--   * Verify the 10 `rls_enabled_no_policy` tables are intentionally backend-only.
--   * auth_rls_initplan ×41 — rewrite policy auth.uid()/auth.role() as (select ...).
--   * SECURITY DEFINER fns executable via RPC — REVOKE EXECUTE after verifying usage.
--   * function_search_path_mutable ×15; public bucket listing ×2.
--   * ERROR rls_disabled_in_public on spatial_ref_sys = known PostGIS table (no action).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_actions_decided_by ON public.agent_actions (decided_by);
CREATE INDEX IF NOT EXISTS idx_area_permissions_updated_by ON public.area_permissions (updated_by);
CREATE INDEX IF NOT EXISTS idx_automation_rules_created_by ON public.automation_rules (created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON public.campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_captures_engagement_event_id ON public.captures (engagement_event_id);
CREATE INDEX IF NOT EXISTS idx_channels_creator_id ON public.channels (creator_id);
CREATE INDEX IF NOT EXISTS idx_circle_practices_practice_id ON public.circle_practices (practice_id);
CREATE INDEX IF NOT EXISTS idx_circle_practices_set_by ON public.circle_practices (set_by);
CREATE INDEX IF NOT EXISTS idx_circles_host_id ON public.circles (host_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON public.conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_crew_completions_verified_by ON public.crew_completions (verified_by);
CREATE INDEX IF NOT EXISTS idx_crew_completions_task_id ON public.crew_completions (task_id);
CREATE INDEX IF NOT EXISTS idx_crew_completions_profile_id ON public.crew_completions (profile_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_comments_author_id ON public.dispatch_comments (author_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_likes_profile_id ON public.dispatch_likes (profile_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_poll_options_dispatch_id ON public.dispatch_poll_options (dispatch_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_poll_votes_profile_id ON public.dispatch_poll_votes (profile_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_hidden_by ON public.dispatches (hidden_by);
CREATE INDEX IF NOT EXISTS idx_dispatches_linked_task_id ON public.dispatches (linked_task_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_profile_id ON public.event_rsvps (profile_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requested_by ON public.friendships (requested_by);
CREATE INDEX IF NOT EXISTS idx_hubs_guide_id ON public.hubs (guide_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_created_by ON public.invite_links (created_by);
CREATE INDEX IF NOT EXISTS idx_member_practices_practice_id ON public.member_practices (practice_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_nexus_regions_parent_id ON public.nexus_regions (parent_id);
CREATE INDEX IF NOT EXISTS idx_nexus_regions_mentor_id ON public.nexus_regions (mentor_id);
CREATE INDEX IF NOT EXISTS idx_nexuses_mentor_id ON public.nexuses (mentor_id);
CREATE INDEX IF NOT EXISTS idx_nodes_owner_profile_id ON public.nodes (owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_nodes_partner_id ON public.nodes (partner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON public.notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_pages_updated_by ON public.pages (updated_by);
CREATE INDEX IF NOT EXISTS idx_partner_redemptions_offer_id ON public.partner_redemptions (offer_id);
CREATE INDEX IF NOT EXISTS idx_partner_redemptions_engagement_event_id ON public.partner_redemptions (engagement_event_id);
CREATE INDEX IF NOT EXISTS idx_partners_contact_profile_id ON public.partners (contact_profile_id);
CREATE INDEX IF NOT EXISTS idx_post_mentions_profile_id ON public.post_mentions (profile_id);
CREATE INDEX IF NOT EXISTS idx_posts_hidden_by ON public.posts (hidden_by);
CREATE INDEX IF NOT EXISTS idx_practice_logs_circle_id ON public.practice_logs (circle_id);
CREATE INDEX IF NOT EXISTS idx_practice_logs_practice_id ON public.practice_logs (practice_id);
CREATE INDEX IF NOT EXISTS idx_practices_created_by ON public.practices (created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_by ON public.profiles (suspended_by);
CREATE INDEX IF NOT EXISTS idx_reports_reviewed_by ON public.reports (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_author_id ON public.room_messages (author_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_parent_id ON public.room_messages (parent_id);
CREATE INDEX IF NOT EXISTS idx_rooms_creator_id ON public.rooms (creator_id);
