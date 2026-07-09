-- Loom: register the operator funnel-door graphics as shared library elements (ADR-591).
-- The five signature scenes + the feature icon set are code-drawn (components/marketing/funnel/
-- funnel-graphics.tsx) and catalogued in lib/library/element-catalog.ts + resolved in
-- lib/library/element-registry.tsx. This seeds the matching `library_assets` rows so they appear (and
-- sort/search) in Loom Studio's element grid, in the Frequency shared master library (space_id null).
--
-- kind = 'element', config = { registry, name } (the resolver draws the live component from that). Idempotent:
-- inserts only the rows that are not already present by (slug, shared library), so re-applying is a no-op.

insert into public.library_assets (kind, title, slug, category, tags, config, space_id, visibility, status)
select v.kind, v.title, v.slug, v.category, v.tags::text[], v.config::jsonb, null, 'public', 'approved'
from (values
  ('element', 'Funnel hero product',      'funnel-hero-product',    'Funnel doors', array['spot','funnel','hero','product'],   '{"registry":"spot","name":"funnel-hero-product"}'),
  ('element', 'Funnel scattered stack',   'funnel-scattered-stack', 'Funnel doors', array['spot','funnel','problem','before'],  '{"registry":"spot","name":"funnel-scattered-stack"}'),
  ('element', 'Funnel setup steps',       'funnel-setup-steps',     'Funnel doors', array['spot','funnel','how-it-works'],      '{"registry":"spot","name":"funnel-setup-steps"}'),
  ('element', 'Funnel referral loop',     'funnel-loop',            'Funnel doors', array['spot','funnel','loop','referral'],   '{"registry":"spot","name":"funnel-loop"}'),
  ('element', 'Funnel break-even chart',  'funnel-break-even',      'Funnel doors', array['spot','funnel','pricing','chart'],   '{"registry":"spot","name":"funnel-break-even"}'),
  ('element', 'Funnel calendar icon',     'funnel-calendar',        'Funnel icons', array['icon','funnel','calendar'],         '{"registry":"icon","name":"funnel-calendar"}'),
  ('element', 'Funnel contact icon',      'funnel-contact',         'Funnel icons', array['icon','funnel','contact'],          '{"registry":"icon","name":"funnel-contact"}'),
  ('element', 'Funnel QR icon',           'funnel-qr',              'Funnel icons', array['icon','funnel','qr'],               '{"registry":"icon","name":"funnel-qr"}'),
  ('element', 'Funnel envelope icon',     'funnel-envelope',        'Funnel icons', array['icon','funnel','envelope'],         '{"registry":"icon","name":"funnel-envelope"}'),
  ('element', 'Funnel spark icon',        'funnel-spark',           'Funnel icons', array['icon','funnel','spark'],            '{"registry":"icon","name":"funnel-spark"}')
) as v(kind, title, slug, category, tags, config)
where not exists (
  select 1 from public.library_assets la where la.slug = v.slug and la.space_id is null and la.kind = 'element'
);
