-- Activate the two-world switch (Phase 3, ADR-811 §3). `spaces.network_connected` has existed since the
-- tenancy migration (20260619000000) but lay dormant with a DEFAULT of false while every app insert path
-- (lib/spaces/provision.ts, lib/importer/materialize.ts, the root seed) set it true explicitly. Phase 3
-- makes it LOAD-BEARING: discovery now lists only connected Spaces, and a disconnected Space is priced
-- standalone (Independent) with a 0% take-rate. Two safe, idempotent changes:
--
--   1. Flip the column DEFAULT to true, so the connected world is the default a raw insert lands in
--      (matches the app paths + the strategy: "in the collective" is the norm; Independent opts OUT).
--   2. BACKFILL every currently network-VISIBLE, active, non-root Space to network_connected = true, so
--      turning on the discovery filter (visibility='network' AND network_connected=true) never silently
--      drops a Space that members can browse today. No Independent Space exists yet (that tier ships this
--      rebuild), so nothing legitimately wants to stay disconnected — this only heals rows that took the
--      old false default.
--
-- SAFE + REVERSIBLE: additive default change + a narrow backfill (only network-visible active non-root
-- rows). Does not touch private / white-label / root Spaces. Reversible:
--   alter table public.spaces alter column network_connected set default false;
-- (the backfilled values are intentionally kept — they reflect the live directory).

alter table public.spaces
  alter column network_connected set default true;

-- Heal any listed Space still carrying the old false default so the new discovery gate keeps it visible.
update public.spaces
  set network_connected = true
  where network_connected = false
    and visibility = 'network'
    and status = 'active'
    and type <> 'root';

comment on column public.spaces.network_connected is
  'The Community Collective world switch (ADR-811 §3): true = IN the collective (affordable ladder, listed in cross-network discovery, eligible for network-sourced referrals + the tier take-rate) | false = standalone / Independent (standard SaaS pricing, walled off from discovery, no network-sourced revenue so every order is self/0%). Defaults to true; Independent onboarding opts out.';
