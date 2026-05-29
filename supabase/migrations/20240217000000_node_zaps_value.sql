-- Phase 3: per-node reward amount. A successful, verified capture awards this
-- many zaps (physical/in-person → zaps; see docs/GLOSSARY.md). Tunable per node;
-- 0 = no direct reward. Additive.

alter table public.nodes
  add column if not exists zaps_value integer not null default 0;

comment on column public.nodes.zaps_value is
  'Zaps awarded on a verified capture (0 = none). Physical/in-person engagement earns zaps.';
