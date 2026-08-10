-- Close the default grants on every service-role-only table (ADR-964 follow-through).
--
-- WHAT THESE 76 TABLES HAVE IN COMMON: RLS is ON and they carry ZERO policies, which is this
-- repo's deliberate deny-all posture (scripts/rls-deny-all.txt, enforced by `pnpm check:rls`).
-- Every reader and writer goes through createAdminClient(). And every one of them ALSO holds
-- explicit SELECT/INSERT/UPDATE/DELETE grants for `anon` and `authenticated`, because Supabase
-- ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public` and nothing ever revoked them.
--
-- WHY THIS IS PROVABLY BEHAVIOUR-PRESERVING, and the reason it can land as one sweep:
--   · anon and authenticated both have `rolbypassrls = false` (verified on the live cluster)
--   · a table with RLS enabled and NO policy denies every row to any role that does not bypass
--   · therefore the grant is already unreachable, and removing it cannot change any result
--   · service_role has `rolbypassrls = true` and is not revoked from, so every real caller is
--     untouched
--
-- WHY BOTHER, THEN. RLS-on-no-policy is the SECOND lock. The first lock has been missing on
-- these tables for their whole lives, so the entire protection rests on nobody ever adding a
-- policy or running `alter table ... disable row level security`. ADR-959 put it exactly right:
-- a grant held back only by RLS is one policy mistake away from being live. On this list that
-- mistake would expose, among others:
--     · nodes — holds `secret`, a server-issued signing token, plus owner + geography
--     · financial_transactions — amount_cents, stripe_account_id, stripe_payment_intent_id
--     · founding_members — locked_rate_cents, card_on_file, charged_at
--     · team_members — a PRIVILEGE table: profile_id + role
--     · email_events — raw email per row — a bulk address list
--     · email_suppressions — raw email + reason — an address list AND an inference
--     · nurture_enrollments — email, persona, contact_id
--     · vera_autonomy_decisions — recipient_email, rationale, metadata
--     · qr_scans — profile_id + lat/lng/city — per-member location history
--     · pricing_stripe_prices — write-side rewrites what a plan costs
--     · stripe_webhook_events — the idempotency ledger — write-side is replay suppression
--
-- Explicit statements rather than a DO block over the predicate: a migration must do the SAME
-- thing on a fresh rebuild as it did here, and a predicate would match whatever that database
-- happens to contain. This list is what was swept, in the order it was swept.
--
-- `revoke all` covers SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER in one statement,
-- and is safe to re-run. Note the roles are named: `revoke ... from public` would remove NOTHING
-- here, which is the whole of ADR-959.

revoke all on table public.agent_actions from anon, authenticated;
revoke all on table public.ai_help_queries from anon, authenticated;
revoke all on table public.ai_usage from anon, authenticated;
revoke all on table public.automation_rules from anon, authenticated;
revoke all on table public.beta_audit_log from anon, authenticated;
revoke all on table public.beta_host_prompts from anon, authenticated;
revoke all on table public.beta_phases from anon, authenticated;
revoke all on table public.beta_referrals from anon, authenticated;
revoke all on table public.beta_tasks from anon, authenticated;
revoke all on table public.business_intake from anon, authenticated;
revoke all on table public.challenge_qr_codes from anon, authenticated;
revoke all on table public.circle_transfer_offers from anon, authenticated;
revoke all on table public.content_ratings from anon, authenticated;
revoke all on table public.creator_tips from anon, authenticated;
revoke all on table public.element_settings from anon, authenticated;
revoke all on table public.email_events from anon, authenticated;
revoke all on table public.email_suppressions from anon, authenticated;
revoke all on table public.email_templates from anon, authenticated;
revoke all on table public.entry_campaigns from anon, authenticated;
revoke all on table public.entry_point_conversions from anon, authenticated;
revoke all on table public.entry_point_variants from anon, authenticated;
revoke all on table public.entry_template_settings from anon, authenticated;
revoke all on table public.event_blurb_cache from anon, authenticated;
revoke all on table public.event_embeddings from anon, authenticated;
revoke all on table public.event_host_transfers from anon, authenticated;
revoke all on table public.event_placement_requests from anon, authenticated;
revoke all on table public.financial_transactions from anon, authenticated;
revoke all on table public.founding_members from anon, authenticated;
revoke all on table public.help_chunks from anon, authenticated;
revoke all on table public.invite_links from anon, authenticated;
revoke all on table public.journey_drip_sends from anon, authenticated;
revoke all on table public.journey_enrollments from anon, authenticated;
revoke all on table public.journey_phase_events from anon, authenticated;
revoke all on table public.journey_runs from anon, authenticated;
revoke all on table public.library_assets from anon, authenticated;
revoke all on table public.library_collection_items from anon, authenticated;
revoke all on table public.library_collections from anon, authenticated;
revoke all on table public.library_styles from anon, authenticated;
revoke all on table public.library_versions from anon, authenticated;
revoke all on table public.listing_intake from anon, authenticated;
revoke all on table public.nodes from anon, authenticated;
revoke all on table public.notification_queue from anon, authenticated;
revoke all on table public.nurture_enrollments from anon, authenticated;
revoke all on table public.nurture_sequences from anon, authenticated;
revoke all on table public.nurture_steps from anon, authenticated;
revoke all on table public.pages from anon, authenticated;
revoke all on table public.platform_flag_events from anon, authenticated;
revoke all on table public.platform_settings from anon, authenticated;
revoke all on table public.playbook_runs from anon, authenticated;
revoke all on table public.playbooks from anon, authenticated;
revoke all on table public.podcast_shows from anon, authenticated;
revoke all on table public.practice_slug_redirects from anon, authenticated;
revoke all on table public.pricing_feature_gates from anon, authenticated;
revoke all on table public.pricing_settings from anon, authenticated;
revoke all on table public.pricing_stripe_prices from anon, authenticated;
revoke all on table public.qr_scans from anon, authenticated;
revoke all on table public.recording_attachments from anon, authenticated;
revoke all on table public.recording_reviews from anon, authenticated;
revoke all on table public.recordings from anon, authenticated;
revoke all on table public.resonance_consent from anon, authenticated;
revoke all on table public.resonance_density_cells from anon, authenticated;
revoke all on table public.resonance_edges from anon, authenticated;
revoke all on table public.resonance_embeddings from anon, authenticated;
revoke all on table public.resonance_matches from anon, authenticated;
revoke all on table public.segments from anon, authenticated;
revoke all on table public.space_availability_overrides from anon, authenticated;
revoke all on table public.space_collaborations from anon, authenticated;
revoke all on table public.space_follower_event_reminders_sent from anon, authenticated;
revoke all on table public.space_function_type_defaults from anon, authenticated;
revoke all on table public.space_venue_holds from anon, authenticated;
revoke all on table public.stripe_webhook_events from anon, authenticated;
revoke all on table public.team_members from anon, authenticated;
revoke all on table public.trust_scores from anon, authenticated;
revoke all on table public.trust_signals from anon, authenticated;
revoke all on table public.vera_autonomy_decisions from anon, authenticated;
revoke all on table public.vera_config from anon, authenticated;
