-- RLS Tier-1 convergence (H2-1) — store_items off the admin client onto the
-- caller's session client + DB-enforced RLS.
--
-- store_items already had host+ INSERT, host+ UPDATE, and public SELECT policies
-- but NO DELETE policy, so deleteStoreItem could not run under the session client.
-- Add the matching host+ DELETE policy (identical predicate to host+ update). The
-- app-side authorizeHostAction() stays as defense-in-depth; the DB now enforces it.
--
-- Verified by RLS dry-run on prod (BEGIN/ROLLBACK): as a host the insert/update/
-- delete all succeed; as a non-host the insert is blocked and the delete affects 0.
--
-- NOTE: resonance_consent (the other recon candidate) is intentionally NOT converged
-- here. Its self-writes are upserts (INSERT ... ON CONFLICT DO UPDATE), and that path
-- does not cleanly satisfy a cross-table self-policy under RLS (the ON CONFLICT arm
-- is rejected even with both insert + update self policies). It already writes safely
-- self-scoped + fail-closed on the admin client; converging it needs a SELECT policy
-- + a non-upsert (or SECURITY DEFINER RPC) rewrite — tracked as a separate slice.

create policy "store_items: host+ delete" on public.store_items
  for delete using (get_my_role() >= 'host'::community_role);
