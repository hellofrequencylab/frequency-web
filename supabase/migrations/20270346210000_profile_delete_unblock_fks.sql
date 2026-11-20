-- SEC-040: deleting an account works for a member who follows a Space, holds a Space membership,
-- or ever asked one Space for something.
--
-- THE BUG. lib/account.ts deleteMyAccount erases the member's stored files and Stripe customer, then
-- calls auth.admin.deleteUser, which cascades to public.profiles. Twenty-four foreign keys to
-- profiles(id) carry no ON DELETE rule (NO ACTION), so the profile delete is refused the moment the
-- member has one row in any of them, and the member is told the delete failed with their files and
-- billing already gone. space_follows alone is bulk-filled from every Space Circle roster
-- (20270346028800), so this hits most members. 20240212000000 fixed only five older columns.
-- Read on production 2026-11-19 (pg_constraint, confdeltype 'a'): exactly these 24, plus
-- hunts.owner_profile_id (RESTRICT, kept below).
--
-- THE FIX, by what the row is:
--   * The member's OWN standing with a Space (follow, membership, enrolment, ticket RSVP, benefit
--     redemption) goes with them: ON DELETE CASCADE. Nothing references those five tables.
--   * A business record the Space keeps (a booking, a collaboration, a share, a hold, a host transfer,
--     a placement request, an email-domain operation, a CRM task, an invite, a review reply, a
--     verification, a tip review) keeps its row and forgets the person: ON DELETE SET NULL. Six of
--     those actor columns were NOT NULL; they become nullable so the record can outlive its author.
--   * space_bookings: the booker rule (a member, or a guest name and email) was a CHECK, which a
--     SET NULL on a member booking would break, refusing the delete again. It moves to a BEFORE
--     INSERT / UPDATE OF guest_name, guest_email trigger that raises the same 23514, so every
--     booking still starts with a booker and only the erasure itself can clear one.
--   * conversations.migrated_to_room_id points at rooms, which cascade from their creator's profile,
--     with no ON DELETE rule. It is a pointer, so it becomes SET NULL (0 rows set today).
--   * hunts.owner_profile_id stays ON DELETE RESTRICT on purpose: a Hunt must have exactly one owner
--     (num_nonnulls check), and no Hunt is owned by a profile today. Hunts are switched off.
--
-- Idempotent: each constraint is dropped if present and re-created under the same name.
-- ROLLBACK: re-create each constraint with no ON DELETE clause, set the six columns NOT NULL again
-- once no NULLs exist, drop trg_space_bookings_booker_check and public.guard_space_booking_booker(),
-- and re-add space_bookings_booker_check.

begin;
set local lock_timeout = '5s';

-- Actor columns that must be able to hold NULL once their author is gone.
alter table public.space_collaborations          alter column requested_by     drop not null;
alter table public.event_space_shares            alter column requested_by     drop not null;
alter table public.space_venue_holds             alter column requested_by     drop not null;
alter table public.event_host_transfers          alter column requested_by     drop not null;
alter table public.event_placement_requests      alter column requested_by     drop not null;
alter table public.space_email_domain_operations alter column owner_profile_id drop not null;

-- The booker rule, from a CHECK to an insert/edit trigger.
create or replace function public.guard_space_booking_booker()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.member_profile_id is null and (new.guest_name is null or new.guest_email is null) then
    raise exception 'space_bookings: a booking needs a member or a guest name and email'
      using errcode = '23514', constraint = 'space_bookings_booker_check';
  end if;
  return new;
end;
$$;

comment on function public.guard_space_booking_booker() is
  'BEFORE INSERT / UPDATE OF guest_name, guest_email on space_bookings (SEC-040). A booking needs a member or a guest name and email. Replaces the space_bookings_booker_check CHECK so an account delete (member_profile_id ON DELETE SET NULL) can keep the booking.';

revoke execute on function public.guard_space_booking_booker() from public, anon, authenticated;

drop trigger if exists trg_space_bookings_booker_check on public.space_bookings;
create trigger trg_space_bookings_booker_check
  before insert or update of guest_name, guest_email on public.space_bookings
  for each row execute function public.guard_space_booking_booker();

alter table public.space_bookings drop constraint if exists space_bookings_booker_check;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- the member's own rows
      ('space_follows',                 'follower_profile_id',        'cascade'),
      ('space_memberships',             'member_profile_id',          'cascade'),
      ('space_enrollments',             'member_profile_id',          'cascade'),
      ('space_ticket_rsvps',            'member_profile_id',          'cascade'),
      ('space_benefit_redemptions',     'member_profile_id',          'cascade'),
      -- records the Space keeps
      ('space_bookings',                'member_profile_id',          'set null'),
      ('creator_tips',                  'reviewed_by',                'set null'),
      ('space_invites',                 'invited_by',                 'set null'),
      ('space_reviews',                 'response_author_profile_id', 'set null'),
      ('space_nonprofit_verifications', 'reviewed_by',                'set null'),
      ('space_nonprofit_verifications', 'submitted_by',               'set null'),
      ('crm_tasks',                     'assignee_profile_id',        'set null'),
      ('crm_tasks',                     'created_by',                 'set null'),
      ('space_collaborations',          'requested_by',               'set null'),
      ('space_collaborations',          'responded_by',               'set null'),
      ('event_space_shares',            'requested_by',               'set null'),
      ('event_space_shares',            'responded_by',               'set null'),
      ('space_venue_holds',             'requested_by',               'set null'),
      ('space_venue_holds',             'responded_by',               'set null'),
      ('event_host_transfers',          'requested_by',               'set null'),
      ('event_host_transfers',          'responded_by',               'set null'),
      ('event_placement_requests',      'requested_by',               'set null'),
      ('event_placement_requests',      'responded_by',               'set null'),
      ('space_email_domain_operations', 'owner_profile_id',           'set null')
    ) as t(tbl, col, rule)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl || '_' || r.col || '_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete %s not valid',
      r.tbl, r.tbl || '_' || r.col || '_fkey', r.col, r.rule);
    execute format('alter table public.%I validate constraint %I', r.tbl, r.tbl || '_' || r.col || '_fkey');
  end loop;
end $$;

alter table public.conversations drop constraint if exists conversations_migrated_to_room_id_fkey;
alter table public.conversations
  add constraint conversations_migrated_to_room_id_fkey
  foreign key (migrated_to_room_id) references public.rooms(id) on delete set null not valid;
alter table public.conversations validate constraint conversations_migrated_to_room_id_fkey;

commit;
