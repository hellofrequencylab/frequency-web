-- Entity Spaces: per-Space attribution on the AI cost ledger.
-- `ai_usage` records every AI call (feature, model, tokens, cost) but only knows the actor
-- (profile_id) and the surface (feature); spend is per-feature GLOBAL. This adds `space_id` so a
-- space-scoped feature (the Vera co-host, lib/ai/space-copilot.ts) can attribute its cost to the
-- Space it ran for, giving per-Space spend visibility AND a per-Space daily cap so one Space can
-- never run up the whole feature's bill. Additive + nullable: existing rows and every non-space
-- feature (help-search, vera-chat, etc.) simply leave it null, so all current callers are untouched.
-- `on delete set null` keeps the ledger row (the COGS record) even if the Space is later deleted.
alter table public.ai_usage
  add column if not exists space_id uuid references public.spaces(id) on delete set null;

-- The per-Space daily-cap query filters by space_id within today's window, so index (space_id,
-- created_at) to match the existing ai_usage_feature_created_idx shape.
create index if not exists ai_usage_space_created_idx on public.ai_usage (space_id, created_at);

comment on column public.ai_usage.space_id is
  'Optional Space this AI call is attributed to (space-scoped features only, e.g. the Vera co-host). Null for non-space features and for pre-existing rows. Powers per-Space spend visibility + per-Space daily caps. See docs/AI-STRATEGY.md.';
