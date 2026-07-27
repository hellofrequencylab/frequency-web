-- Program blueprints get their own discriminator (ADR-870).
--
-- WHY: circle_templates now holds three kinds of rows: the staff Starter Circles
-- catalog (owner_space_id NULL), Space-owned Program blueprints (owner_space_id
-- set, fenced out of the catalog by the ADR-864 owner filter), and — new with the
-- staff Program lifecycle — blueprints for FREQUENCY-RUN Programs, whose channel
-- has no owner Space. Those last rows would carry owner_space_id NULL and leak
-- straight into the global Starter Circles rail and the staff catalog (both list
-- reads filter owner_space_id IS NULL). is_active cannot double as the fence:
-- it must stay true for Remix to start Chapters, and the staff catalog list
-- (getAllTemplates) ignores it anyway.
--
-- FIX: an explicit program_only flag. TRUE = this row exists solely as a
-- Program's Chapter blueprint and never surfaces as a Starter. The two catalog
-- LIST reads (lib/circles/templates-data.ts getActiveTemplates/getAllTemplates)
-- add program_only = false; the single-row reads (getTemplateById/BySlug) stay
-- unfiltered so Remix keeps loading blueprints when someone starts a Chapter.

alter table circle_templates
  add column if not exists program_only boolean not null default false;

-- Backfill: every blueprint a channel already points at is a Program blueprint,
-- Space-owned or not. (Space-owned rows were already fenced by the owner filter;
-- stamping them too keeps the flag's meaning uniform.)
update circle_templates t
set program_only = true
where exists (
  select 1 from topical_channels c where c.template_id = t.id
);

comment on column circle_templates.program_only is
  'TRUE = a Program''s Chapter blueprint (ADR-864/870), never listed in the Starter Circles catalog. Single-row reads stay open so Remix can start Chapters from it.';
