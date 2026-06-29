-- =============================================================================
-- Auto-sync new code pages into saved menus (ADR-390 follow-up).
--
-- Saved menus are snapshots: once a surface is seeded/edited, a new nav page added
-- in code (e.g. Resonance CRM) does NOT appear in it. We want new pages to be added
-- automatically WITHOUT resurrecting items an operator deliberately deleted.
--
-- `synced_default_keys` is the set of default-item identities (hrefs) this menu has
-- already reconciled against. The sync pass (lib/menus/actions.ts syncMenuFromDefaults,
-- run when the Menu Manager opens a surface) injects only default pages whose href is
-- NOT already in the menu AND NOT in this set (= genuinely new), then records the
-- current default set here. A deliberately-deleted page keeps its href in this set, so
-- it is never re-added. Empty = never synced (the sync baselines it on first run).
-- =============================================================================

alter table public.menus
  add column if not exists synced_default_keys jsonb not null default '[]'::jsonb;

comment on column public.menus.synced_default_keys is
  'Set of code-default item hrefs already reconciled into this menu (lib/menus syncMenuFromDefaults). New defaults not in this set are auto-injected; deleted items stay in the set so they are not resurrected.';
