-- Editor E0 task 2 (docs/EDITOR-E0.md section 5): one boolean platform_flags row per surface that can
-- switch to the node render path. Seeded FALSE (the old path) and read fail-closed, so a database
-- hiccup can never promote an unproven renderer onto a live page. Additive and idempotent.
insert into public.platform_flags (key, value)
values
  ('render_path_marketing', false),
  ('render_path_space_profile', false),
  ('render_path_spotlight', false),
  ('render_path_email', false),
  ('render_path_site', false)
on conflict (key) do nothing;
