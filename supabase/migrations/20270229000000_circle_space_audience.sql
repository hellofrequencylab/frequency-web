-- The `space_members` Circle mode admits the Space's AUDIENCE, not its staff (ADR-1021).
--
-- ── THE BUG, MEASURED ────────────────────────────────────────────────────────────────────────
--
-- `circles.access = 'space_members'` is documented and LABELLED as "Space members only", with the
-- member-facing hint "Anyone with an active membership in your Space can join themselves". It
-- resolves through `private.is_space_member`, which reads `public.space_members`.
--
-- `space_members` is not the audience. It is the STAFF LADDER — viewer < editor < moderator <
-- admin, the people who operate the Space. Measured on production 2026-08-12:
--
--   space_members       26 rows, EVERY ONE role='admin'   ← what the mode admits today
--   space_memberships    2 rows, both status='active'     ← the people actually PAYING
--   space_follows        7 rows                           ← followers
--
-- So a Host who sets a Circle to "Space members only" opens it to the operator's admins and shuts
-- out every paying member. The label has been wrong since the mode shipped, and the help article
-- written on 2026-08-12 repeated the label.
--
-- ── 🔴 WHY THIS IS A NEW PREDICATE AND NOT A WIDER `is_space_member` ─────────────────────────
--
-- The obvious fix is to teach `is_space_member` about `space_memberships`. It is also a serious
-- data leak, and the reason is that the predicate is not a Circle predicate at all: SIXTEEN RLS
-- policies depend on it, measured on the live cluster.
--
--   client_notes · crm_deals · crm_activities · crm_stages · lead_entry_points ·
--   lead_touchpoints · commerce_orders · commerce_order_items · commerce_disputes ·
--   commerce_products · commerce_variants · app_instances · space_faqs · space_reviews ·
--   space_updates · spaces
--
-- Widening it would hand every paying member of a Space read access to that Space's CRM pipeline,
-- its private client notes, its order history and its disputes. "Who may enter a Circle" and "who
-- may read the CRM" are the same question today only by accident of implementation, and this
-- migration is what stops them being the same question.
--
-- So: a SECOND predicate, used by exactly one arm of one function. `is_space_member` is untouched
-- and all sixteen policies keep the meaning they have today.

create or replace function private.is_space_audience(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  -- The staff ladder still counts: someone who operates the Space is plainly part of it, and this
  -- arm is what keeps the change purely ADDITIVE. Nobody who could enter yesterday is shut out.
  select private.is_space_member(p_space_id)
     -- ...plus the audience the label has always promised: an ACTIVE paid membership.
     or exists (
       select 1
       from public.space_memberships sm
       where sm.space_id = p_space_id
         and sm.member_profile_id = private.get_my_profile_id()
         and sm.status = 'active'
     );
$$;

-- ⚠️ BOTH REVOKE HALVES, IN ONE STATEMENT (ADR-959). Supabase ships `ALTER DEFAULT PRIVILEGES IN
-- SCHEMA public`, so anon and authenticated hold EXPLICIT per-role grants the moment an object
-- exists, and `revoke ... from public` does not touch an explicit per-role grant. Naming all three
-- is the only form that actually closes it. Shape mirrors private.can_enter_circle exactly.
revoke all on function private.is_space_audience(uuid) from public, anon, authenticated;
grant execute on function private.is_space_audience(uuid)
  to anon, authenticated, service_role;

comment on function private.is_space_audience(uuid) is
  'May the CURRENT caller be treated as part of this Space AUDIENCE (ADR-1021)? The Space''s staff ladder (space_members, via is_space_member) OR an ACTIVE paid membership (space_memberships). Deliberately SEPARATE from is_space_member, which 16 RLS policies use to gate the CRM, client notes, orders and disputes: a paying member belongs in a Circle, not in the operator''s pipeline. Used by exactly one arm of private.can_enter_circle.';

-- ── The one arm that changes ─────────────────────────────────────────────────────────────────
-- Byte-identical to 20270227000000 apart from the `space_members` arm, which now asks the
-- audience question. Restated in full because CREATE OR REPLACE needs the whole body, and the
-- unchanged arms are re-asserted so a future reader can diff the two files directly.
create or replace function private.can_enter_circle(
  p_circle_id uuid,
  p_access text,
  p_space_id uuid,
  p_host_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'private', 'pg_temp'
as $$
  select
    -- An open Circle is open. Anyone signed in may walk in, exactly as today.
    coalesce(p_access, 'open') = 'open'
    -- An active member of the Circle. This is how `tier`, `invite` and `circle_members` all
    -- resolve once someone is actually in: the tier purchase and the invite redemption both
    -- WRITE a memberships row (ADR-859, joinViaInviteLink), so entry is never a live re-check
    -- against Stripe -- it is a durable row, and this arm reads it.
    or p_circle_id = any(coalesce(private.get_my_circle_ids(), '{}'::uuid[]))
    -- The Host who runs it.
    or (p_host_id is not null and p_host_id = private.get_my_profile_id())
    -- 🔴 THE ARM THIS MIGRATION CHANGES (ADR-1021). Was `private.is_space_member(p_space_id)`,
    -- which is the staff ladder; now the AUDIENCE, which is staff OR an active paid membership.
    -- Still only for this mode -- Space membership is NOT a general key to a Space's Circles.
    or (coalesce(p_access, 'open') = 'space_members' and private.is_space_audience(p_space_id))
    -- A steward of the owning Space: owner, or an active editor/moderator/admin. Reuses the write
    -- predicate on purpose -- someone who can move or delete the Circle can read it. For a
    -- PERSONAL circle this resolves to the root-space arm, i.e. platform staff only, which is the
    -- correct answer and the reason this policy exists at all.
    or private.can_write_space_content(p_space_id)
    -- Break-glass for platform staff (moderation, support). NOT community_role: a `guide` rank
    -- moderates the community, it is not a key to somebody's private room.
    or private.get_my_web_role() in ('admin', 'janitor');
$$;

-- ── What this migration deliberately does NOT do ─────────────────────────────────────────────
--
-- It does not touch `space_follows`. A follow is free and one click; treating it as equivalent to
-- a paid membership would make the paid mode meaningless, and the owner ruled on paying members
-- plus staff specifically.
--
-- It does not touch `private.is_space_member`, `can_see_circle`, `can_write_space_content`, the
-- `circles_access_restrictive` policy, or any of the sixteen policies above. The blast radius is
-- one arm of one function.
--
-- 🔴 IT IS PURELY ADDITIVE. Every caller who could enter a `space_members` Circle before this
-- migration can still enter it, because the staff arm is preserved verbatim inside the new
-- predicate. Nothing that was open closes.
