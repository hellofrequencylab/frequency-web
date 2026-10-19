-- SCAN-844: a member cannot skip a host's RSVP approval queue by inserting themselves already
-- admitted.
--
-- THE GAP. 20270345011900 (SCAN-696) froze approval_status on INSERT to 'none' or 'pending', and
-- on UPDATE to a move toward 'pending'. That stopped a PATCH to 'approved'. It did not read
-- events.rsvp_requires_approval. Every admission reader (lib/events/admission.ts isAdmitted, the
-- capacity and going counts, the hidden-venue disclosure) treats not-pending as admitted, so
-- status='going' with approval_status='none' is a seat. A member deletes their pending row
-- (delete-own is allowed) and re-inserts it with 'none', and the same works after a host's
-- decline, which deletes the row.
--
-- THE FIX. On a caller-role INSERT, if the event requires approval, approval_status must be
-- 'pending'. The flag is read through a SECURITY DEFINER helper because authenticated is
-- correctly withheld SELECT on events.rsvp_requires_approval (20270330000000), and this trigger
-- stays SECURITY INVOKER so current_user still names the caller (the SCAN-696 lesson: a definer
-- body would read its owner and exempt every write). Unknown or missing events fail closed
-- (treated as gated). Trusted writers and guest seats (profile_id is null) are still exempt.
-- The app's first-RSVP insert already writes pending when the event is gated
-- (app/(main)/events/actions.ts).
--
-- Apply with execute_sql, then insert supabase_migrations.schema_migrations at version
-- 20270346009400. Do not apply_migration. Do not db push.
--
-- ROLLBACK:
--   Restore public.guard_event_rsvp_member_write() from 20270345011900;
--   drop function if exists private.event_rsvp_requires_approval(uuid);
--
-- House style: idempotent (create or replace), pinned search_path, revoke by role name.
-- No em or en dashes. pgTAP: supabase/tests/event_rsvps_member_write_guard.test.sql.

begin;

-- ── 1. The event flag, readable from an INVOKER trigger ─────────────────────────────────────────

create or replace function private.event_rsvp_requires_approval(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select e.rsvp_requires_approval from public.events e where e.id = p_event_id),
    true
  );
$$;

comment on function private.event_rsvp_requires_approval(uuid) is
  'Does this event make a member wait for the host? (SCAN-844). SECURITY DEFINER so the INVOKER RSVP write guard can read events.rsvp_requires_approval, which authenticated is withheld. Missing rows fail closed (true). Not a PostgREST RPC: private schema, execute granted to authenticated only so the trigger can call it.';

revoke all on function private.event_rsvp_requires_approval(uuid) from public, anon, authenticated;
grant execute on function private.event_rsvp_requires_approval(uuid) to authenticated;

-- ── 2. The guard, same shape as 20270345011900 plus the gated INSERT ─────────────────────────────

create or replace function public.guard_event_rsvp_member_write()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  -- Trusted writers: the admin client, the migration runner, and every SECURITY DEFINER door
  -- (which runs as its owner). They are the only writers of the columns frozen below.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- A guest seat has no member behind it; the caller policies already refuse it, and the definer
  -- doors that do write it were exempted above.
  if new.profile_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approval_status not in ('none', 'pending')
       or new.attended_at      is not null
       or new.attended_by      is not null
       or new.guest_email      is not null
       or new.guest_name       is not null
       or new.guest_claimed_by is not null
       or new.guest_claimed_at is not null
       or new.seat_token_hash  is not null
       or new.from_ticket_id   is not null then
      raise exception 'event_rsvps: a member seat starts unapproved, unattended and with no guest, token or ticket columns set'
        using errcode = '42501';
    end if;
    -- SCAN-844: on an approval-gated event a member seat is a request, never an admission.
    if new.approval_status is distinct from 'pending'
       and private.event_rsvp_requires_approval(new.event_id) then
      raise exception 'event_rsvps: a member seat on an approval-gated event starts as a pending request'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: the host-attested and door-written columns never change under a caller role, and
  -- approval moves only toward the queue, never past it.
  if new.attended_at      is distinct from old.attended_at
  or new.attended_by      is distinct from old.attended_by
  or new.guest_email      is distinct from old.guest_email
  or new.guest_name       is distinct from old.guest_name
  or new.guest_claimed_by is distinct from old.guest_claimed_by
  or new.guest_claimed_at is distinct from old.guest_claimed_at
  or new.seat_token_hash  is distinct from old.seat_token_hash
  or new.from_ticket_id   is distinct from old.from_ticket_id then
    raise exception 'event_rsvps: attended_at, attended_by, guest_*, seat_token_hash and from_ticket_id are written by the host or a door, never by the seat holder'
      using errcode = '42501';
  end if;

  if new.approval_status is distinct from old.approval_status
     and new.approval_status <> 'pending' then
    raise exception 'event_rsvps: only the host admits a request (approval_status may only move to pending)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_event_rsvp_member_write() is
  'BEFORE INSERT OR UPDATE on event_rsvps (SCAN-696, SCAN-844). Under a caller role (authenticated, anon) a member seat may not be inserted approved or attended, a member seat on an approval-gated event must be inserted pending, and attended_at, attended_by, guest_*, seat_token_hash, from_ticket_id and approval_status (except a move to pending) may not change. Exempt: service_role, postgres, supabase_admin (the admin client and every SECURITY DEFINER door) and rows with no profile_id. SECURITY INVOKER by design: a definer body would read its owner as current_user and exempt every write.';

revoke execute on function public.guard_event_rsvp_member_write() from public, anon, authenticated;

commit;
