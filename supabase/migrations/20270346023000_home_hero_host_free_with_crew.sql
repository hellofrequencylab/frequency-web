-- LIVE-1278: the front door says what the gate says. Owner 2026-10-22: a Space comes with Crew, so the
-- home hero no longer promises "Businesses host free". Published home document only; the draft template
-- (lib/page-editor/templates/home.ts) carries the same line.
--
--   "Small groups that keep meeting, near you. Join free. Businesses host free."
--   ->  "Small groups that keep meeting, near you. Join free. Host free with Crew."
--
-- Any other "Businesses host free" in the published document (the three-line model in the body copy) becomes
-- "Host free with Crew". Idempotent: a document without the old phrase is left untouched.
--
-- ROLLBACK (by hand): the same replace in the other direction.

do $$
declare
  v_doc  jsonb;
  v_new  jsonb;
begin
  select published_data into v_doc from public.pages where slug = 'home' and published_data is not null;
  if v_doc is null then
    raise notice 'LIVE-1278: no published home document; nothing to change.';
    return;
  end if;
  v_new := replace(v_doc::text, 'Businesses host free', 'Host free with Crew')::jsonb;
  if v_new is distinct from v_doc then
    update public.pages set published_data = v_new, updated_at = now()
     where slug = 'home' and published_data is not null;
    raise notice 'LIVE-1278: the home document says Host free with Crew.';
  end if;
end $$;
