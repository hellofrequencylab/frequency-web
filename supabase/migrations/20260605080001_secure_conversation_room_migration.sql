-- Launch hardening: the one-time conversation_room_migration mapping table
-- (created in 20260604220000_group_dms_to_private_rooms) shipped without RLS, so
-- the Supabase security advisor flags it ERROR-level as anon-readable
-- (rls_disabled_in_public). It's a migration audit map (old conversation_id → new
-- room_id), only ever written by the migration itself and read via the admin
-- client — never the user client (no `.from('conversation_room_migration')` in app
-- code). Enable RLS with no policy so it's service-role only, matching every other
-- internal table. No data change, no app impact.
alter table if exists public.conversation_room_migration enable row level security;
