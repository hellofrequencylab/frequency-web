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
-- 'draft' unless the caller is a trusted writer (service_role, postgres,
-- supabase_admin). Session-client edits that stay on draft still land. Live Circles
-- can still change status. publishCircle and the other app writers already use the
-- admin client, so they stay exempt. SECURITY INVOKER so current_user still names
-- the caller (a definer body would read its owner and exempt every write). There is
-- no member-facing DEFINER RPC that updates circles.status.
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
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Trusted writers: the admin client, the migration runner, and every SECURITY DEFINER
  -- door (which runs as its owner). They are the only writers of a leave-draft move.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if old.status = 'draft' and new.status <> 'draft' then
    raise exception 'circles: a draft leaves draft only through publish'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_circle_draft_status() is
  'BEFORE UPDATE on public.circles (SCAN-848). Under a caller role a draft Circle may not change status. Exempt: service_role, postgres, supabase_admin (the admin client and the migration runner). SECURITY INVOKER by design: a definer body would read its owner as current_user and exempt every write.';

drop trigger if exists guard_circle_draft_status on public.circles;
create trigger guard_circle_draft_status
  before update on public.circles
  for each row
  execute function public.guard_circle_draft_status();

revoke all on function public.guard_circle_draft_status() from public, anon, authenticated;
revoke execute on function public.guard_circle_draft_status() from public, anon, authenticated;

commit;
