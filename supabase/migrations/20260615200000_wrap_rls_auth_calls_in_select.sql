-- Optimize RLS auth-function calls: wrap auth.uid()/auth.role()/auth.jwt() and
-- current_setting(...) in a scalar subselect so Postgres evaluates them ONCE per
-- query (an initplan) instead of once per row. Purely an evaluation-timing change;
-- the access semantics are identical. Clears the Supabase `auth_rls_initplan`
-- performance advisor (63 public policies flagged in the 2026-06-11 maintenance sweep).
-- Idempotent: any policy whose calls are already wrapped is skipped, so a re-run
-- is a no-op and double-wrapping cannot occur.
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
