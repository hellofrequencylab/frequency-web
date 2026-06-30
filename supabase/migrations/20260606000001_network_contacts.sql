-- Network Profiles · "Profile Creator" intake (ADR-098, docs/NETWORK-CRM.md).
--
-- A NEW entity, deliberately distinct from `profiles` (real members, PUBLIC read)
-- and `contacts` (the marketing list, service-role). It captures the people a
-- steward meets — from a scanned business card / poster, or manual entry with Vera
-- assist — into an OWNER-SCOPED, private-by-default record with routing/sorting,
-- a connection note, and tags.
--
-- Gating doctrine (why this is its own table): personal captures must NOT bleed
-- into public data. `owner_id` is the privacy primitive; `visibility` gates
-- promotion (private → shared → network). Photos & original scans live in a
-- PRIVATE storage bucket (signed URLs only), never the public avatars/posts
-- buckets. RLS: owner CRUD on own rows; only visibility='network' rows are
-- readable beyond the owner; notes/tags inherit the parent's ownership.
--
-- Additive. After applying, regenerate types — until then the app talks to these
-- tables through the untyped admin handle (repo convention, cf. lib/studio/contacts.ts).

-- ── Core record ──────────────────────────────────────────────────────────────
create table if not exists public.network_contacts (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  visibility        text not null default 'private' check (visibility in ('private', 'shared', 'network')),
  source            text not null default 'manual'  check (source in ('manual', 'card_scan', 'poster', 'import')),
  status            text not null default 'new'      check (status in ('new', 'active', 'archived')),
  display_name      text,
  email             text,
  phone             text,
  title             text,
  company           text,
  city              text,
  website           text,
  socials           jsonb not null default '{}'::jsonb,        -- { instagram, linkedin, x, ... }
  avatar_path       text,                                       -- key in the PRIVATE network-contacts bucket (NOT a URL)
  extraction        jsonb not null default '{}'::jsonb,         -- raw harvest from the scan/assist (audit + re-derive)
  linked_profile_id uuid references public.profiles(id) on delete set null,  -- if they become / are a member
  linked_contact_id uuid references public.contacts(id) on delete set null,  -- if promoted to a marketing contact
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists network_contacts_owner_idx      on public.network_contacts (owner_id);
create index if not exists network_contacts_owner_status_idx on public.network_contacts (owner_id, status);
create index if not exists network_contacts_network_idx     on public.network_contacts (visibility) where visibility = 'network';
create index if not exists network_contacts_email_idx       on public.network_contacts (lower(email));

create trigger network_contacts_set_updated_at
  before update on public.network_contacts
  for each row execute function public.set_updated_at();

-- ── Notes — the "space for notes" + the AI connection note ───────────────────
create table if not exists public.network_contact_notes (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.network_contacts(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  kind        text not null default 'note' check (kind in ('note', 'connection', 'ai')),
  created_at  timestamptz not null default now()
);
create index if not exists network_contact_notes_contact_idx
  on public.network_contact_notes (contact_id, created_at desc);

-- ── Tags — freeform, owner-scoped (separate from the governed member_tags) ────
create table if not exists public.network_contact_tags (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.network_contacts(id) on delete cascade,
  tag         text not null,
  source      text not null default 'manual' check (source in ('manual', 'ai')),
  created_at  timestamptz not null default now(),
  unique (contact_id, tag)
);
create index if not exists network_contact_tags_contact_idx on public.network_contact_tags (contact_id);
create index if not exists network_contact_tags_tag_idx     on public.network_contact_tags (lower(tag));

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.network_contacts      enable row level security;
alter table public.network_contact_notes enable row level security;
alter table public.network_contact_tags  enable row level security;

-- Core: owner reads/writes own; network-visible rows are readable by any signed-in
-- viewer (the page itself is host+/staff-gated). Writes are owner-only.
drop policy if exists network_contacts_select on public.network_contacts;
create policy network_contacts_select on public.network_contacts for select using (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
  or visibility = 'network'
);
drop policy if exists network_contacts_insert on public.network_contacts;
create policy network_contacts_insert on public.network_contacts for insert with check (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);
drop policy if exists network_contacts_update on public.network_contacts;
create policy network_contacts_update on public.network_contacts for update using (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
) with check (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);
drop policy if exists network_contacts_delete on public.network_contacts;
create policy network_contacts_delete on public.network_contacts for delete using (
  owner_id in (select id from public.profiles where auth_user_id = auth.uid())
);

-- Notes & tags inherit the parent's ownership (personal — not shared on promotion).
drop policy if exists network_contact_notes_all on public.network_contact_notes;
create policy network_contact_notes_all on public.network_contact_notes for all using (
  contact_id in (
    select id from public.network_contacts
    where owner_id in (select id from public.profiles where auth_user_id = auth.uid())
  )
) with check (
  contact_id in (
    select id from public.network_contacts
    where owner_id in (select id from public.profiles where auth_user_id = auth.uid())
  )
);
drop policy if exists network_contact_tags_all on public.network_contact_tags;
create policy network_contact_tags_all on public.network_contact_tags for all using (
  contact_id in (
    select id from public.network_contacts
    where owner_id in (select id from public.profiles where auth_user_id = auth.uid())
  )
) with check (
  contact_id in (
    select id from public.network_contacts
    where owner_id in (select id from public.profiles where auth_user_id = auth.uid())
  )
);

-- ── Private storage bucket for cropped photos + original scans ────────────────
-- public = FALSE: these are personal captures, served only via short-lived signed
-- URLs minted server-side. Path convention: {auth_user_id}/{contact_id}/{file}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'network-contacts',
  'network-contacts',
  false,
  10485760,  -- 10 MB (card/poster photos run larger than avatars)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "network-contacts: owner read"   on storage.objects;
drop policy if exists "network-contacts: owner insert" on storage.objects;
drop policy if exists "network-contacts: owner update" on storage.objects;
drop policy if exists "network-contacts: owner delete" on storage.objects;

create policy "network-contacts: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'network-contacts' and split_part(name, '/', 1) = auth.uid()::text);
create policy "network-contacts: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'network-contacts' and split_part(name, '/', 1) = auth.uid()::text);
create policy "network-contacts: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'network-contacts' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'network-contacts' and split_part(name, '/', 1) = auth.uid()::text);
create policy "network-contacts: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'network-contacts' and split_part(name, '/', 1) = auth.uid()::text);

-- ── Docs ─────────────────────────────────────────────────────────────────────
comment on table public.network_contacts is
  'Owner-scoped "Profile Creator" intake (card scan / poster / manual+Vera). Private by default; visibility gates promotion. Distinct from profiles (members) and contacts (marketing). See docs/NETWORK-CRM.md, ADR-098.';
comment on column public.network_contacts.avatar_path is
  'Key in the PRIVATE network-contacts storage bucket. Render via a server-minted signed URL — never a public URL.';
comment on column public.network_contacts.visibility is
  'private (owner only) | shared (future: owner team) | network (readable by signed-in stewards). Promotion is a deliberate act so personal captures do not bleed into public data.';
comment on table public.network_contact_notes is
  'Notes on a network_contact: free-text notes + the AI-drafted connection note (kind=connection|ai). Inherits parent ownership.';
comment on table public.network_contact_tags is
  'Freeform owner-scoped tags on a network_contact (source manual|ai). Separate from the governed member_tags registry.';
