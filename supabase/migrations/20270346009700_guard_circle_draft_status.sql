-- SCAN-848: a host cannot take a draft Circle live with a direct database update.
--
-- THE GAP. SCAN-688 stopped the Settings rail from writing any status onto a draft
-- (updateCircleSettings reads the stored row and refuses). The 'circles:
-- host/guide/mentor update' policy still has no column limits, and the BEFORE UPDATE
-- triggers on circles check access shape and the Space-primary row, not the status
-- move. So status 'draft' to 'active' (or forming, or anything else) through
-- PostgREST skips publishCircleAction's create gate, hosting allowance, circle_start
-- reward and pinned announcement. The SCAN-688 row said no migration guards the
-- transition.
--
-- THE FIX. A BEFORE UPDATE trigger refuses old.status = 'draft' and new.status <>
-- 'draft' when the JWT role is authenticated or anon. The JWT role is what matters
-- (auth.role()), not current_user: pgTAP's throws_ok and any SECURITY DEFINER door
-- run as postgres, and a current_user check would see the owner and exempt the
-- write (the SCAN-845 lesson; CI 39278455526 proved it). publishCircle and the
-- other app writers already use the admin client (service_role). A statement with
-- no JWT (the migration runner, a postgres seed) is not a browser caller and stays
-- allowed. Session-client edits that stay on draft still land. Live Circles can
-- still change status.
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version
-- 20270346009700. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   drop trigger if exists guard_circle_draft_status on public.circles;
--   drop function if exists public.guard_circle_draft_status();
--
-- House style: idempotent (create or replace), pinned search_path, revoke by role name.
-- No em or en dashes. pgTAP: supabase/tests/guard_circle_draft_status.test.sql.

begin;

create or replace function public.guard_circle_draft_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only a browser caller (PostgREST authenticated / anon) is refused. service_role
  -- is the admin client. A null JWT is the migration runner or a postgres seed.
  if old.status = 'draft' and new.status <> 'draft'
     and auth.role() in ('authenticated', 'anon') then
    raise exception 'circles: a draft leaves draft only through publish'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_circle_draft_status() is
  'BEFORE UPDATE on public.circles (SCAN-848). Refuses a leave-draft when auth.role() is authenticated or anon, so a host cannot PATCH a draft live through PostgREST. service_role (the admin client) and a null JWT (the migration runner) stay allowed. SECURITY DEFINER so auth.role() is readable; not an RPC.';

drop trigger if exists guard_circle_draft_status on public.circles;
create trigger guard_circle_draft_status
  before update on public.circles
  for each row
  execute function public.guard_circle_draft_status();

revoke all on function public.guard_circle_draft_status() from public, anon, authenticated;
revoke execute on function public.guard_circle_draft_status() from public, anon, authenticated;

commit;
