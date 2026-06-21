-- space_enrollments.program_id: index the unindexed foreign key (Supabase advisor "unindexed FK").
--
-- space_enrollments.program_id references public.space_programs(id) ON DELETE CASCADE (see
-- 20260716000100_space_enroll.sql). The table already indexes space_id and member_profile_id, but the
-- program_id FK has no covering index. The advisor flags this because:
--   - a CASCADE delete of a program (setSpaceProgram replaces the program in v1, deleting the old row)
--     must seq-scan space_enrollments to find the dependent rows, and
--   - any join/filter by program_id (e.g. resolving a program's roster) cannot use an index.
-- This is a low-severity performance finding, not a correctness or tenancy one.
--
-- Additive + idempotent, matching the house style (space_enrollments_space_idx /
-- space_enrollments_member_idx in the source migration). SAFE to re-run. NOT applied by this change;
-- the integrator applies it via the Supabase SQL Editor.
create index if not exists space_enrollments_program_idx
  on public.space_enrollments (program_id);
