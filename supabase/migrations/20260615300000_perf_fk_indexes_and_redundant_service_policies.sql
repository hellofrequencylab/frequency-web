-- Maintenance 2026-06-11, P3 follow-up. Two safe, semantics-preserving perf fixes.
-- Applied to prod (Frequency Community) via the Supabase MCP and verified:
-- unindexed_foreign_keys 45 -> 0, multiple_permissive_policies 98 -> 14.
--
-- (1) Covering indexes for the 45 foreign keys the `unindexed_foreign_keys` advisor
--     flagged. Speeds up joins and cascade/constraint checks on those columns.
--
-- (2) Drop 8 redundant "service role full access" RLS policies. Each is
--     `FOR ALL TO public USING (auth.role() = 'service_role')`. The service_role
--     Postgres role has BYPASSRLS, so these policies are never consulted for it; for
--     anon/authenticated the predicate is always false, so they grant nothing. They
--     only add per-query permissive-policy overhead (the `multiple_permissive_policies`
--     advisor). Dropping them changes access for no one.
--
-- The 14 remaining multiple_permissive findings are genuine user+user overlaps
-- (dispatch_likes, events, posts, user_achievements); consolidating those can change
-- access semantics, so they are deferred to a separate reviewed pass.

-- (1) Foreign-key covering indexes -----------------------------------------------
create index if not exists ix_admin_audit_log_actor_id on admin_audit_log (actor_id);
create index if not exists ix_ai_help_queries_profile_id on ai_help_queries (profile_id);
create index if not exists ix_ai_usage_profile_id on ai_usage (profile_id);
create index if not exists ix_capability_permissions_updated_by on capability_permissions (updated_by);
create index if not exists ix_circle_challenge_adoptions_adopted_by on circle_challenge_adoptions (adopted_by);
create index if not exists ix_circle_topics_topical_channel_id on circle_topics (topical_channel_id);
create index if not exists ix_connection_settings_updated_by on connection_settings (updated_by);
create index if not exists ix_conversation_room_migration_room_id on conversation_room_migration (room_id);
create index if not exists ix_conversations_migrated_to_room_id on conversations (migrated_to_room_id);
create index if not exists ix_creator_tips_reviewed_by on creator_tips (reviewed_by);
create index if not exists ix_crm_activities_contact_id on crm_activities (contact_id);
create index if not exists ix_crm_activities_created_by on crm_activities (created_by);
create index if not exists ix_crm_deals_created_by on crm_deals (created_by);
create index if not exists ix_crm_deals_profile_id on crm_deals (profile_id);
create index if not exists ix_entry_point_conversions_profile_id on entry_point_conversions (profile_id);
create index if not exists ix_event_cohosts_added_by on event_cohosts (added_by);
create index if not exists ix_events_domain_id on events (domain_id);
create index if not exists ix_journey_plan_items_domain_id on journey_plan_items (domain_id);
create index if not exists ix_journey_plan_items_practice_id on journey_plan_items (practice_id);
create index if not exists ix_journey_plans_reviewed_by on journey_plans (reviewed_by);
create index if not exists ix_member_tags_assigned_by on member_tags (assigned_by);
create index if not exists ix_network_contact_notes_author_id on network_contact_notes (author_id);
create index if not exists ix_nurture_sequences_created_by on nurture_sequences (created_by);
create index if not exists ix_page_content_updated_by on page_content (updated_by);
create index if not exists ix_platform_flag_events_changed_by on platform_flag_events (changed_by);
create index if not exists ix_practice_sessions_practice_id on practice_sessions (practice_id);
create index if not exists ix_practice_streaks_practice_id on practice_streaks (practice_id);
create index if not exists ix_practice_tag_defs_created_by on practice_tag_defs (created_by);
create index if not exists ix_practice_tag_defs_domain_id on practice_tag_defs (domain_id);
create index if not exists ix_practice_tags_assigned_by on practice_tags (assigned_by);
create index if not exists ix_practices_reviewed_by on practices (reviewed_by);
create index if not exists ix_profile_personas_verified_by on profile_personas (verified_by);
create index if not exists ix_program_adoptions_profile_id on program_adoptions (profile_id);
create index if not exists ix_programs_author_id on programs (author_id);
create index if not exists ix_programs_reviewed_by on programs (reviewed_by);
create index if not exists ix_qr_codes_circle_id on qr_codes (circle_id);
create index if not exists ix_qr_codes_created_by on qr_codes (created_by);
create index if not exists ix_qr_codes_event_id on qr_codes (event_id);
create index if not exists ix_qr_codes_node_id on qr_codes (node_id);
create index if not exists ix_segments_created_by on segments (created_by);
create index if not exists ix_sequence_overrides_updated_by on sequence_overrides (updated_by);
create index if not exists ix_studio_site_changes_actor_id on studio_site_changes (actor_id);
create index if not exists ix_support_ticket_messages_author_id on support_ticket_messages (author_id);
create index if not exists ix_vera_config_updated_by on vera_config (updated_by);
create index if not exists ix_witnessed_grants_granted_by on witnessed_grants (granted_by);

-- (2) Drop redundant service_role-only policies ----------------------------------
drop policy if exists "service role full access poll options" on public.dispatch_poll_options;
drop policy if exists "service role full access poll votes" on public.dispatch_poll_votes;
drop policy if exists friendships_service_role_full_access on public.friendships;
drop policy if exists "service role full access notifications" on public.notifications;
drop policy if exists "service role full access mentions" on public.post_mentions;
drop policy if exists room_members_service_write on public.room_members;
drop policy if exists room_messages_service_write on public.room_messages;
drop policy if exists rooms_service_write on public.rooms;
