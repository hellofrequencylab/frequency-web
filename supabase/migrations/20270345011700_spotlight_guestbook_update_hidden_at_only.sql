-- A Spotlight owner's UPDATE on their guestbook is the hide/unhide seam, and nothing else (SCAN-758).
--
-- THE DEFECT. 20270325000000_spotlight_guestbook.sql creates spotlight_guestbook_update whose USING
-- and WITH CHECK only test `owner_profile_id = private.get_my_profile_id()` (or staff). The comment
-- above that policy says the owner's update is the set/clear-hidden_at seam, and the app only ever
-- writes hidden_at (app/spotlight/[handle]/guestbook-actions.ts hide/unhide). But a ROW policy
-- cannot limit COLUMNS, and no migration ever narrowed the grant, so Supabase's default per-role
-- grant (ALTER DEFAULT PRIVILEGES, ADR-959) left `authenticated` with table-wide UPDATE. A page
-- owner, with their own JWT, could run
--
--     PATCH /rest/v1/spotlight_guestbook?id=eq.<note>   {"message": "...", "signer_profile_id": "<anyone>"}
--
-- and the policy let it through because owner_profile_id was unchanged. The public Spotlight
-- (lib/spotlight/guestbook.ts) then shows a note that member never wrote, under their handle and
-- avatar. Only the not_self check stopped pointing a note at the owner themselves. This is the
-- ADR-964 shape again: a correct row policy on a table whose column grants were never narrowed.
--
-- THE FIX. Revoke UPDATE from the named roles (a REVOKE FROM public does not remove Supabase's
-- explicit per-role default grants, see 20270215000001) and grant back UPDATE on hidden_at alone.
-- Postgres checks the column privilege before RLS and before any trigger, so a PATCH naming
-- message, signer_profile_id, owner_profile_id or created_at is refused with 42501 outright.
--
-- WHAT STILL WORKS, by construction:
--   hideGuestbookEntry / unhideGuestbookEntry   send only hidden_at on the caller's session.
--   app/(main)/feed/report-actions.ts           the report path hides through createAdminClient()
--                                                (service_role, grants do not apply).
--   signers                                     never held an UPDATE policy; they delete their own
--                                                note (spotlight_guestbook_delete), unchanged.
--   SELECT / INSERT / DELETE grants             untouched. The hide's `where id = ...` and its
--                                                `returning id` still read through table-wide SELECT.
--
-- Pinned by supabase/tests/spotlight_guestbook_update_columns.test.sql (pgTAP, the privilege and
-- the behaviour) and supabase/migrations/spotlight-guestbook-grants.test.ts (the migration text).

begin;

revoke update on public.spotlight_guestbook from anon, authenticated;
grant update (hidden_at) on public.spotlight_guestbook to authenticated;

-- PROVE IT, IN THE SAME TRANSACTION, BOTH WAYS. A grant that silently broke the owner's hide would
-- be a worse outcome than the defect, so the positive half runs too.
do $$
begin
  if has_table_privilege('authenticated', 'public.spotlight_guestbook', 'UPDATE')
     or has_table_privilege('anon', 'public.spotlight_guestbook', 'UPDATE')
     or has_column_privilege('authenticated', 'public.spotlight_guestbook', 'message', 'UPDATE')
     or has_column_privilege('authenticated', 'public.spotlight_guestbook', 'signer_profile_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.spotlight_guestbook', 'owner_profile_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.spotlight_guestbook', 'created_at', 'UPDATE')
  then
    raise exception 'spotlight_guestbook: the UPDATE revoke did not take, aborting';
  end if;
  if not has_column_privilege('authenticated', 'public.spotlight_guestbook', 'hidden_at', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.spotlight_guestbook', 'SELECT')
     or not has_table_privilege('authenticated', 'public.spotlight_guestbook', 'INSERT')
     or not has_table_privilege('authenticated', 'public.spotlight_guestbook', 'DELETE')
  then
    raise exception 'spotlight_guestbook: the revoke took too much, the hide seam would break, aborting';
  end if;
end $$;

comment on column public.spotlight_guestbook.hidden_at is
  'Owner/staff soft-hide. The ONLY column authenticated may UPDATE (column grant, SCAN-758): message, signer_profile_id, owner_profile_id and created_at are fixed once a note is signed, so a page owner cannot rewrite a note or move it under another member''s name.';

commit;
