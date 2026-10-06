-- post_embeddings is service-role only (LIVE-677): take back the table grants Supabase's default
-- privileges hand anon and authenticated on every new public table (ADR-959). RLS with no policy
-- already denies them every row; this makes the grant contract (scripts/table-grants.txt,
-- `internal`) true at the grant layer too, which `pnpm check:grants` requires.
--
-- Additive and idempotent. ROLLBACK: grant select, insert, update, delete on public.post_embeddings
-- to anon, authenticated;

revoke all on table public.post_embeddings from anon, authenticated;
