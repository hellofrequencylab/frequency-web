-- Performance hygiene: covering indexes for 31 foreign keys the advisor flagged as unindexed. Each speeds
-- up parent-side deletes and joins on the FK column. Idempotent (IF NOT EXISTS). Non-concurrent is fine
-- at current scale (brief locks); revisit with CONCURRENTLY if a table grows hot.
create index if not exists idx_beta_admission_waves_approved_by on public.beta_admission_waves (approved_by);
create index if not exists idx_beta_admission_waves_created_by on public.beta_admission_waves (created_by);
create index if not exists idx_beta_audit_log_actor_profile_id on public.beta_audit_log (actor_profile_id);
create index if not exists idx_campaigns_approved_by on public.campaigns (approved_by);
create index if not exists idx_commerce_disputes_opener_profile_id on public.commerce_disputes (opener_profile_id);
create index if not exists idx_commerce_disputes_resolved_by on public.commerce_disputes (resolved_by);
create index if not exists idx_commerce_order_items_variant_id on public.commerce_order_items (variant_id);
create index if not exists idx_commerce_reviews_reviewer_profile_id on public.commerce_reviews (reviewer_profile_id);
create index if not exists idx_crm_tasks_created_by on public.crm_tasks (created_by);
create index if not exists idx_element_settings_space_id on public.element_settings (space_id);
create index if not exists idx_element_settings_updated_by on public.element_settings (updated_by);
create index if not exists idx_email_templates_created_by on public.email_templates (created_by);
create index if not exists idx_event_placement_requests_requested_by on public.event_placement_requests (requested_by);
create index if not exists idx_event_placement_requests_responded_by on public.event_placement_requests (responded_by);
create index if not exists idx_lead_entry_points_captured_by_profile_id on public.lead_entry_points (captured_by_profile_id);
create index if not exists idx_lead_touchpoints_actor_profile_id on public.lead_touchpoints (actor_profile_id);
create index if not exists idx_listing_comments_profile_id on public.listing_comments (profile_id);
create index if not exists idx_listing_intake_created_by on public.listing_intake (created_by);
create index if not exists idx_listing_offers_profile_id on public.listing_offers (profile_id);
create index if not exists idx_listings_claimed_by on public.listings (claimed_by);
create index if not exists idx_market_listings_claimed_by on public.market_listings (claimed_by);
create index if not exists idx_podcast_shows_cover_asset_id on public.podcast_shows (cover_asset_id);
create index if not exists idx_recording_reviews_reviewer_profile_id on public.recording_reviews (reviewer_profile_id);
create index if not exists idx_recordings_loom_asset_id on public.recordings (loom_asset_id);
create index if not exists idx_space_availability_schedule_id on public.space_availability (schedule_id);
create index if not exists idx_space_bookings_service_type_id on public.space_bookings (service_type_id);
create index if not exists idx_space_nonprofit_verifications_reviewed_by on public.space_nonprofit_verifications (reviewed_by);
create index if not exists idx_space_nonprofit_verifications_submitted_by on public.space_nonprofit_verifications (submitted_by);
create index if not exists idx_space_reviews_response_author_profile_id on public.space_reviews (response_author_profile_id);
create index if not exists idx_space_service_types_product_id on public.space_service_types (product_id);
create index if not exists idx_spaces_claimed_by on public.spaces (claimed_by);
