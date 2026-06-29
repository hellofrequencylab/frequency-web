-- Restore security_invoker on practices_ranked. It was created with security_invoker=true
-- (20260606160000), but 20260617000000 recreated it with CREATE OR REPLACE VIEW WITHOUT
-- restating the option, so it reverted to the implicit security_definer and tripped the
-- Supabase `security_definer_view` advisor (ERROR). This realigns it with the original
-- intent: the view enforces the underlying tables' RLS as the querying role. Idempotent.
-- Decision: ADR-365.
alter view public.practices_ranked set (security_invoker = on);

-- Rollback: alter view public.practices_ranked set (security_invoker = off);
