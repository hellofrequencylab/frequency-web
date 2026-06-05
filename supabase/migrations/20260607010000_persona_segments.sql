-- Persona segments (Entry Points Phase 3). One saved segment per persona so operators
-- can broadcast to / target "all practitioners", "all partners", etc. in the existing
-- /marketing/campaigns composer (which already lists every saved segment) and the
-- segment engine generally. Predicate is the persona's boolean tag (persona_<id>),
-- already registered in lib/traits/registry.ts. Idempotent (on conflict do nothing).

insert into public.segments (slug, name, description, definition, is_system) values
  ('persona-visitor',
   'Persona · Just here to belong',
   'Members who said they came in to find their people.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"persona_visitor"}]}'::jsonb,
   true),
  ('persona-practitioner',
   'Persona · Practitioner',
   'Members who said they have something to offer.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"persona_practitioner"}]}'::jsonb,
   true),
  ('persona-partner',
   'Persona · Partner business',
   'Members who said they run a local spot.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"persona_partner"}]}'::jsonb,
   true),
  ('persona-builder',
   'Persona · Community builder',
   'Members who said they want to help build it.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"persona_builder"}]}'::jsonb,
   true),
  ('persona-investor',
   'Persona · Lab champion',
   'Members who said they want a Frequency Lab in their town.',
   '{"combinator":"all","predicates":[{"type":"tag","key":"persona_investor"}]}'::jsonb,
   true)
on conflict (slug) do nothing;
