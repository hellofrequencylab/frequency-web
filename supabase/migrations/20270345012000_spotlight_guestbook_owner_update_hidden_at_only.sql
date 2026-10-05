-- ============================================================================
-- A SPOTLIGHT OWNER MAY HIDE A GUESTBOOK NOTE, NEVER REWRITE OR RE-SIGN IT (SCAN-758, 2026-10-05)
-- ============================================================================
--
-- THE GAP. spotlight_guestbook_update (20270325000000) lets the page owner UPDATE their own
-- rows, and the comment calls it the hide / unhide seam. The policy tests owner_profile_id
-- only, and nothing limited WHICH columns the owner may change: no migration ever revoked the
-- table-wide UPDATE Supabase grants authenticated by default. So an owner with their own JWT
-- could PATCH message and signer_profile_id and publish a note another member never wrote,
-- under that member's handle and avatar.
--
-- THE FIX, two layers:
--   1. The grant: UPDATE on the table is revoked from the named roles (a revoke from PUBLIC
--      alone leaves Supabase's per-role default grants, 20270215000001) and re-granted on
--      hidden_at only. The app's hide and unhide paths send hidden_at and nothing else;
--      moderation and report paths use service_role, which is unaffected.
--   2. The belt: a BEFORE UPDATE trigger that refuses any change to message,
--      signer_profile_id, owner_profile_id or created_at, whoever the caller is.
--
-- Additive, idempotent, safe to re-run. Rollback:
--   drop trigger if exists trg_spotlight_guestbook_hidden_at_only on public.spotlight_guestbook;
--   drop function if exists public.spotlight_guestbook_hidden_at_only();
--   grant update on public.spotlight_guestbook to authenticated;

revoke update on public.spotlight_guestbook from anon, authenticated;
grant update (hidden_at) on public.spotlight_guestbook to authenticated;

create or replace function public.spotlight_guestbook_hidden_at_only()
returns trigger
language plpgsql
as $$
begin
  if new.message is distinct from old.message
     or new.signer_profile_id is distinct from old.signer_profile_id
     or new.owner_profile_id is distinct from old.owner_profile_id
     or new.created_at is distinct from old.created_at then
    raise exception 'spotlight_guestbook: only hidden_at may change on an existing note'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.spotlight_guestbook_hidden_at_only() from public, anon, authenticated;

drop trigger if exists trg_spotlight_guestbook_hidden_at_only on public.spotlight_guestbook;
create trigger trg_spotlight_guestbook_hidden_at_only
  before update on public.spotlight_guestbook
  for each row execute function public.spotlight_guestbook_hidden_at_only();

comment on trigger trg_spotlight_guestbook_hidden_at_only on public.spotlight_guestbook is
  'A guestbook note is immutable except hidden_at (SCAN-758): the owner moderates, nobody rewrites or re-signs.';
