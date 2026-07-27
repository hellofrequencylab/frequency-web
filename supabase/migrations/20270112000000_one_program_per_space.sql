-- =====================================================================
-- One Program per Space (ADR-865, review fix on ADR-864).
--
-- createSpaceProgram is two inserts with no transaction; a double submit
-- could mint two public Program channels for one Space, and v1 has no
-- delete surface to remediate. The unique partial index makes the second
-- insert fail at the database no matter how the requests interleave; the
-- action's pre-check turns that into a sentence instead of an error.
-- =====================================================================

create unique index if not exists topical_channels_one_program_per_space
  on public.topical_channels (owner_space_id)
  where owner_space_id is not null;
