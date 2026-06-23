-- CRM overhaul, Phase 3 (ADR-372 · docs/CRM-OVERHAUL.md): structured PROVENANCE on the member graph.
--
-- `friendships` already carries the brief's hard parts: mutual opt-in (status pending → accepted, a
-- canonical one-row-per-pair with requested_by), plus free-text how_met / met_context / met_at. What
-- the brief's connection_edges adds is STRUCTURED provenance, a classified edge_type and relational
-- FKs, so "how / where / who introduced" is queryable instead of parsed from text. This is a schema
-- extension, not a new table (private network_contacts stay off the member graph by construction).
--
-- Referral lineage is deliberately NOT modeled here: a referral is member RECRUITMENT (capture →
-- member), tracked on the CRM axis (network_contacts + the referral reward), not a member-to-member
-- connection. So edge_type omits 'referral'.
--
-- ADDITIVE + idempotent (safe to re-run). Regenerate types after apply. Rollback note at the bottom.

alter table public.friendships
  add column if not exists edge_type text
    check (edge_type in ('met_at_event', 'introduced_by', 'shared_circle', 'opt_in_connect')),
  add column if not exists event_id uuid references public.events(id) on delete set null,
  add column if not exists introduced_by uuid references public.profiles(id) on delete set null,
  add column if not exists circle_id uuid references public.circles(id) on delete set null;

-- Partial indexes: only edges that carry the provenance (most won't), so the indexes stay small.
create index if not exists friendships_event_id_idx
  on public.friendships (event_id) where event_id is not null;
create index if not exists friendships_introduced_by_idx
  on public.friendships (introduced_by) where introduced_by is not null;
create index if not exists friendships_circle_id_idx
  on public.friendships (circle_id) where circle_id is not null;

comment on column public.friendships.edge_type is
  'How the connection was made (ADR-372): met_at_event | introduced_by | shared_circle | opt_in_connect. The provenance FKs (event_id / introduced_by / circle_id) carry the specifics. Referral lineage stays on the CRM axis, not here.';

-- Rollback:
--   alter table public.friendships
--     drop column if exists edge_type,
--     drop column if exists event_id,
--     drop column if exists introduced_by,
--     drop column if exists circle_id;
