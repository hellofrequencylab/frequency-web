-- =============================================================================
-- Security hardening: pin search_path on the 20 functions the Supabase security
-- advisor flagged as `function_search_path_mutable` (BUILD-LIST P1, go-live
-- advisors run). A role-mutable search_path lets a caller shadow objects the
-- function references; pinning to `public` closes that class. Behavior-neutral —
-- every one of these already resolves everything in `public`. New functions
-- should declare `SET search_path = public` inline (repo convention since the
-- circle_field trigger).
-- =============================================================================

ALTER FUNCTION public.challenge_outcomes() SET search_path = public;
ALTER FUNCTION public.check_hub_circle_limit() SET search_path = public;
ALTER FUNCTION public.enforce_member_not_suspended() SET search_path = public;
ALTER FUNCTION public.engagement_event_counts(_days integer) SET search_path = public;
ALTER FUNCTION public.engagement_prop_counts(_event text, _prop text, _days integer, _limit integer) SET search_path = public;
ALTER FUNCTION public.is_blocked_between(a uuid, b uuid) SET search_path = public;
ALTER FUNCTION public.maintain_engagement_on_reaction() SET search_path = public;
ALTER FUNCTION public.maintain_engagement_on_reply() SET search_path = public;
ALTER FUNCTION public.member_engagement_stats() SET search_path = public;
-- public.quest_outcomes() was retired in 20260609104000_retire_quest_chains_engine.sql;
-- nothing left to pin (ALTER FUNCTION has no IF EXISTS, so this line is removed).
ALTER FUNCTION public.rooms_maintain_member_count() SET search_path = public;
ALTER FUNCTION public.rooms_touch_last_message() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.trg_circle_auto_activate() SET search_path = public;
ALTER FUNCTION public.trg_decrement_circle_member_count() SET search_path = public;
ALTER FUNCTION public.trg_decrement_member_count() SET search_path = public;
ALTER FUNCTION public.trg_hub_auto_activate() SET search_path = public;
ALTER FUNCTION public.trg_increment_circle_member_count() SET search_path = public;
ALTER FUNCTION public.trg_increment_member_count() SET search_path = public;
ALTER FUNCTION public.trg_nexus_auto_activate() SET search_path = public;
