-- Wrap auth.uid() in (select auth.uid()) on network_contact_reminders' 4 policies so
-- Postgres evaluates it ONCE per query (an initplan) instead of once per row. Purely an
-- evaluation-timing change; the access semantics are identical. Clears the Supabase
-- `auth_rls_initplan` performance advisor for this table (the policies shipped in
-- 20260723000000_network_contacts_crm_p1.sql, which is also forward-fixed so a fresh DB
-- is born correct). Decision: ADR-365.
-- Idempotent: any policy whose calls are already wrapped is skipped, so a re-run is a
-- no-op and double-wrapping cannot occur. Same sweep body as 20260615200000.
do $$
declare
  r record;
  q text;
  c text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = 'network_contact_reminders'
      and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* '(auth\.(uid|role|jwt)\(\)|current_setting\()'
      -- skip policies already optimized (calls already preceded by SELECT)
      and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) !~* 'select\s+(auth\.(uid|role|jwt)\(\)|current_setting\()'
  loop
    q := regexp_replace(
           regexp_replace(coalesce(r.qual, ''), 'auth\.(uid|role|jwt)\(\)', '( SELECT auth.\1() )', 'g'),
           'current_setting\(([^()]*)\)', '( SELECT current_setting(\1) )', 'g');
    c := regexp_replace(
           regexp_replace(coalesce(r.with_check, ''), 'auth\.(uid|role|jwt)\(\)', '( SELECT auth.\1() )', 'g'),
           'current_setting\(([^()]*)\)', '( SELECT current_setting(\1) )', 'g');
    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, q, c);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, q);
    else
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, c);
    end if;
  end loop;
end $$;

-- Rollback (cosmetic perf-only; not required for correctness): re-run the policy bodies
-- with bare auth.uid() from 20260723000000_network_contacts_crm_p1.sql to unwrap them.
