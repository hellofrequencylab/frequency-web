-- =============================================================================
-- Spotlight Guestbook (PROG-SPOT, ADR-1132) — visitors leave a note on a
-- member's Spotlight, MySpace-style.
--
-- Storage choice mirrors spotlight_top_friends: a guestbook entry references
-- ANOTHER profile by FK (the signer), so it lives in a real table — referential
-- integrity (a deleted signer or owner cascades their entries away) and clean
-- ordering, which the meta.spotlight JSON blob cannot give. The signer's
-- displayed identity (name/handle/avatar) is resolved at render time from their
-- own public profile fields, never stored here — only the note text itself is
-- member-supplied, and it is length-bounded at the schema and normalized in the
-- server action (lib/spotlight/guestbook.shared.ts) before write.
--
-- Anti-spam is structural, three layers:
--   1. unique (owner, signer): one note per person per guestbook. Re-signing
--      requires the signer to remove their own note first; a HIDDEN note keeps
--      occupying the slot, so hiding a nuisance signer also blocks a re-sign.
--   2. char_length bound (schema) + normalization (action).
--   3. A per-signer hourly cap enforced in the sign action (counted off the
--      signer index below, under the signer's own session — see select policy).
--
-- Moderation: `hidden_at` is the soft-hide seam. Only the OWNER (or staff) can
-- update rows (set/clear hidden_at); the render excludes hidden entries. The
-- signer can delete their own note but can never update it — otherwise a hidden
-- signer could null their own hidden_at and resurface.
--
-- RLS idiom (ADR-208): profile-id ownership compares to get_my_profile_id() —
-- NEVER auth.uid() (profiles.id != the auth user id). Staff via get_my_web_role().
-- Reads here are IDENTITY-GATED (verdict `authenticated` in table-grants.txt):
-- the public Spotlight page renders entries through the same admin-client reader
-- as the rest of the page (lib/spotlight/data.ts, anon has zero RLS), so no
-- anon-facing select policy is needed; owner/signer/staff read under session.
-- =============================================================================

create table if not exists public.spotlight_guestbook (
  id                uuid primary key default gen_random_uuid(),
  -- The Spotlight owner whose guestbook this note sits in (row owner for moderation).
  owner_profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- The signed-in member who left the note. Cascades away with their profile.
  signer_profile_id uuid not null references public.profiles(id) on delete cascade,
  -- The note itself — the ONLY member-supplied display text in the row.
  message           text not null,
  created_at        timestamptz not null default now(),
  -- Soft-hide (owner/staff moderation). Hidden entries never render and keep the
  -- unique slot occupied, so a hidden signer cannot re-sign.
  hidden_at         timestamptz,
  -- One note per person per guestbook.
  unique (owner_profile_id, signer_profile_id),
  -- You do not sign your own guestbook.
  constraint spotlight_guestbook_not_self check (owner_profile_id <> signer_profile_id),
  -- Schema-level backstop for the action's normalization (1..500 chars).
  constraint spotlight_guestbook_message_len check (char_length(message) between 1 and 500)
);

-- The hot read: one guestbook, newest first.
create index if not exists spotlight_guestbook_owner_idx
  on public.spotlight_guestbook (owner_profile_id, created_at desc);
-- The rate-limit count (this signer's recent notes) + cascade housekeeping.
create index if not exists spotlight_guestbook_signer_idx
  on public.spotlight_guestbook (signer_profile_id, created_at desc);

alter table public.spotlight_guestbook enable row level security;

-- Owner reads their whole guestbook (hidden included, for moderation); a signer
-- reads their own notes (also what the sign action's hourly count runs under);
-- staff read for support. The PUBLIC render bypasses RLS via the page's
-- admin-client reader, which filters hidden_at itself.
drop policy if exists spotlight_guestbook_read on public.spotlight_guestbook;
create policy spotlight_guestbook_read on public.spotlight_guestbook
  for select using (
    owner_profile_id = get_my_profile_id()
    or signer_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  );

-- Anyone signed in writes — as themselves, visible, never into their own book.
drop policy if exists spotlight_guestbook_insert on public.spotlight_guestbook;
create policy spotlight_guestbook_insert on public.spotlight_guestbook
  for insert with check (
    signer_profile_id = get_my_profile_id()
    and hidden_at is null
  );

-- Only the owner (or staff) updates — the moderation seam (set/clear hidden_at).
-- Deliberately NOT the signer: a signer who could update could un-hide themselves.
drop policy if exists spotlight_guestbook_update on public.spotlight_guestbook;
create policy spotlight_guestbook_update on public.spotlight_guestbook
  for update using (
    owner_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  ) with check (
    owner_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  );

-- The owner clears their guestbook; a signer takes back their own note; staff moderate.
drop policy if exists spotlight_guestbook_delete on public.spotlight_guestbook;
create policy spotlight_guestbook_delete on public.spotlight_guestbook
  for delete using (
    owner_profile_id = get_my_profile_id()
    or signer_profile_id = get_my_profile_id()
    or get_my_web_role() in ('admin','janitor')
  );

comment on table public.spotlight_guestbook is
  'Spotlight Guestbook: one note per signed-in member per Spotlight. Signer identity resolves from their own public profile at render; message is the only member-supplied text (bounded 1..500). hidden_at = owner/staff soft-hide; a hidden row keeps the unique (owner, signer) slot occupied so a hidden signer cannot re-sign. ADR-1132.';
