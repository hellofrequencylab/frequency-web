-- =============================================================================
-- Circle sidebar block order (ADR-181)
--
-- The order of the right-rail blocks on a circle page (members / health / practice
-- / events / invite) is arranged by the circle's admin via a drag-and-drop widget
-- editor in the page Settings panel. Stored as an ordered array of block keys;
-- NULL = the coded default order. Unknown/missing keys fall back to the default so
-- the rail never breaks if the block set changes. Service-role write after an
-- editSettings check.
-- =============================================================================

alter table public.circles
  add column if not exists sidebar_order jsonb;

comment on column public.circles.sidebar_order is
  'Admin-chosen order of the circle page right-rail blocks, e.g. ["members","health","practice","events","invite"]. NULL = coded default (ADR-181).';
