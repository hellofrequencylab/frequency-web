-- A member could forge an ACCEPTED friendship with any other member.
--
-- `friendships_update_addressee_accept` supplied an explicit WITH CHECK of
-- `(status = 'accepted')`. Postgres applies USING to the OLD row and WITH CHECK to the NEW
-- one, and an UPDATE policy with NO explicit WITH CHECK reuses its USING for the new row --
-- which is why the other UPDATE policies in this shape are sound. Supplying one REPLACES
-- that fallback, so the new row was constrained only by `status='accepted'`: user_a_id,
-- user_b_id and requested_by were all free. `authenticated` holds column-level UPDATE on
-- all 14 columns, so there was no backstop.
--
-- Exploit: hold any pending INCOMING request (USING passes: caller is in the pair and is not
-- requested_by), then PATCH that row setting the pair to (victim, self) and status='accepted'.
-- Friendship is the DM gate -- lib/messages/actions.ts reads it through the SERVICE-ROLE
-- client, so the forged row is authoritative and opens a conversation with the victim.
--
-- Tightening WITH CHECK alone does NOT close this: any predicate stated over the new row can
-- be satisfied by setting all three identity columns coherently. RLS cannot reference OLD, so
-- the invariant "the identity triple never changes" needs a trigger. Both are applied here:
-- the trigger is the fix, the policy change is defence in depth.

create or replace function public.friendships_freeze_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The service-role/admin clients are trusted and already bypass RLS; the only in-app
  -- service-role writer (lib/connections/introductions.ts) stamps edge_type/introduced_by
  -- and never touches the identity triple, so this exemption is not load-bearing for it.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.user_a_id    is distinct from old.user_a_id
  or new.user_b_id    is distinct from old.user_b_id
  or new.requested_by is distinct from old.requested_by then
    raise exception 'friendships: user_a_id, user_b_id and requested_by are immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_freeze_identity on public.friendships;
create trigger friendships_freeze_identity
  before update on public.friendships
  for each row
  execute function public.friendships_freeze_identity();

-- Defence in depth: re-assert the USING predicate on the new row, so the accepting party must
-- still be a member of the pair and still not be the requester.
alter policy friendships_update_addressee_accept on public.friendships
  with check (
    status = 'accepted'
    and (
      (select p.id from public.profiles p where p.auth_user_id = (select auth.uid()) limit 1) = user_a_id
      or
      (select p.id from public.profiles p where p.auth_user_id = (select auth.uid()) limit 1) = user_b_id
    )
    and (select p.id from public.profiles p where p.auth_user_id = (select auth.uid()) limit 1) <> requested_by
  );
