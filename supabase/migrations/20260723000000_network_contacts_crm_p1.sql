-- My Contacts CRM · Phase 1 (the free "keep-in-touch" foundation).
-- Strategy: docs/CRM-STRATEGY.md §3-§4, P1. Decision: ADR-361.
--
-- Adds the three genuinely new primitives the personal contact book needs to
-- become a lightweight relationship CRM, all ADDITIVE and idempotent so this can
-- merge ahead of, or alongside, the code (the reads degrade to empty/null until
-- it is applied):
--   • 'qr_scan' joins the network_contacts.source CHECK set (the in-person QR
--     capture lands here, §4).
--   • last_contacted_at — set by notes / reminders / a QR scan, powers the
--     "reach out today" list (free) and later reporting (paid).
--   • network_contact_reminders — owner-scoped follow-up reminders (the backbone
--     of the daily reach-out list). Mirrors the network_contacts owner RLS exactly
--     and reuses the shape of the crm_activities due-dated tasks rather than
--     inventing a new pattern.
--
-- After applying, regenerate types — until then the app talks to the new table
-- through the untyped admin handle (repo convention, cf. lib/connections/store.ts).

-- ── source: add 'qr_scan' ────────────────────────────────────────────────────
-- The original migration declares the source CHECK inline, so Postgres auto-named
-- it network_contacts_source_check. Drop-if-exists + recreate with the full set
-- keeps this idempotent and re-runnable.
alter table public.network_contacts drop constraint if exists network_contacts_source_check;
alter table public.network_contacts
  add constraint network_contacts_source_check
  check (source in ('manual', 'card_scan', 'poster', 'import', 'qr_scan'));

-- ── last_contacted_at ─────────────────────────────────────────────────────────
alter table public.network_contacts
  add column if not exists last_contacted_at timestamptz;

comment on column public.network_contacts.last_contacted_at is
  'When the owner last reached out to this contact (set by adding a note, completing a follow-up, or a QR scan). Powers the "reach out today" list and sorting. See docs/CRM-STRATEGY.md P1.';

-- ── network_contact_reminders ─────────────────────────────────────────────────
-- Owner-scoped follow-up reminders. due_at drives the reach-out list; done_at
-- closes one out. Inherits no parent state — it is its own owner-scoped row.
create table if not exists public.network_contact_reminders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  contact_id  uuid not null references public.network_contacts(id) on delete cascade,
  due_at      timestamptz not null,
  note        text,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
-- Open reminders by due date — the reach-out list's exact read path.
create index if not exists network_contact_reminders_owner_due_idx
  on public.network_contact_reminders (owner_id, due_at) where done_at is null;
create index if not exists network_contact_reminders_contact_idx
  on public.network_contact_reminders (contact_id);

-- ── RLS — mirrors the network_contacts owner policies exactly ─────────────────
alter table public.network_contact_reminders enable row level security;

drop policy if exists network_contact_reminders_select on public.network_contact_reminders;
create policy network_contact_reminders_select on public.network_contact_reminders for select using (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);
drop policy if exists network_contact_reminders_insert on public.network_contact_reminders;
create policy network_contact_reminders_insert on public.network_contact_reminders for insert with check (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);
drop policy if exists network_contact_reminders_update on public.network_contact_reminders;
create policy network_contact_reminders_update on public.network_contact_reminders for update using (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
) with check (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);
drop policy if exists network_contact_reminders_delete on public.network_contact_reminders;
create policy network_contact_reminders_delete on public.network_contact_reminders for delete using (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);

-- ── Docs ─────────────────────────────────────────────────────────────────────
comment on table public.network_contact_reminders is
  'Owner-scoped follow-up reminders on a network_contact (due_at, optional note, done_at). The backbone of the free "reach out today" list. Owner CRUD via RLS, mirroring network_contacts. See docs/CRM-STRATEGY.md P1, ADR-361.';

-- ── Rollback (additive, clean) ────────────────────────────────────────────────
--   drop table if exists public.network_contact_reminders cascade;
--   alter table public.network_contacts drop column if exists last_contacted_at;
--   alter table public.network_contacts drop constraint if exists network_contacts_source_check;
--   alter table public.network_contacts
--     add constraint network_contacts_source_check
--     check (source in ('manual', 'card_scan', 'poster', 'import'));
