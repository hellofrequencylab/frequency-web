-- Circle lineage: a Circle records the Circle it was seeded from (LIVE-665).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- A full Circle used to turn people away. Now its host (as it nears its cap) and a member who
-- finds it full can start a SISTER Circle in one tap: lib/circles/sister.ts copies the Circle's
-- shape into a private draft the starter hosts, and stamps this column with the Circle it came
-- from, so the family of Circles a good one seeds can be read back (and credited) later.
--
-- ON DELETE SET NULL: deleting the original never takes its sisters with it. Nothing reads the
-- column in a policy, so no RLS changes; circles keeps its existing policies and grants.
--
-- Additive and idempotent. ROLLBACK: alter table public.circles drop column seeded_from_circle_id;

alter table public.circles
  add column if not exists seeded_from_circle_id uuid
    references public.circles (id) on delete set null;

create index if not exists circles_seeded_from_circle_id_idx
  on public.circles (seeded_from_circle_id);

comment on column public.circles.seeded_from_circle_id is
  'The Circle this one was seeded from as a sister Circle (LIVE-665, lib/circles/sister.ts). Null for an original.';
