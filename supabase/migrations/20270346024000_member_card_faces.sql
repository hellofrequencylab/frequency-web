-- MEMBER CARDS (LIVE-1282, ADR-1874). See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md
-- "Member cards" for the program; this file explains the schema, it does not track the work.
--
-- A member card (an NTAG215 card the CyberUnicorn console writes) always holds the same /c/<token>
-- link. What a phone tap opens is decided on the server from the card's FACE, which its owner sets on
-- the website, so a card never needs rewriting:
--   • card_faces: one row per face owner, a member (profile_id) or a Space (space_id). mode 'page'
--     opens the owner's own page (the member's profile, or the Space's page) and is the default when
--     no row exists; 'card' opens the virtual card (photo, title, the fields switched on, Save contact,
--     Swap contacts); 'link' opens one https link the owner set. paused stops every tap and check-in.
--     cardholder_perk is a Space's one-line perk for Frequency cardholders (any plan, owner ruling
--     2026-10-22).
--   • member_cards gains card_number (a Frequency-wide number from member_card_number_seq, never
--     reissued; 1 to 100 is the Founders edition) and face_space_id (a card registered to a Space: its
--     taps open the Space's face, and profile_id stays the person holding it).
--   • card_taps: one row per phone tap and per action taken on the face (open, save, swap), for the
--     owner's numbers. The tapper is recorded only when signed in.
--   • network_contacts.source gains 'nfc_card' for a contact made by tapping a member card.
--
-- Service role only on the new tables (lib/member-cards is the tenancy wall). No money moves.
--
-- Additive and idempotent. ROLLBACK:
--   drop table if exists public.card_taps;
--   drop table if exists public.card_faces;
--   alter table public.member_cards drop column if exists card_number, drop column if exists face_space_id;
--   drop sequence if exists public.member_card_number_seq;
--   (network_contacts_source_check: re-add without 'nfc_card' once no row uses it)

begin;

create table if not exists public.card_faces (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  mode text not null default 'page' check (mode in ('page', 'card', 'link')),
  link_url text check (link_url is null or (char_length(link_url) between 9 and 500 and link_url ~* '^https://')),
  show_phone boolean not null default false,
  show_email boolean not null default false,
  show_links boolean not null default true,
  swap_back boolean not null default true,
  paused boolean not null default false,
  cardholder_perk text check (cardholder_perk is null or char_length(btrim(cardholder_perk)) between 1 and 120),
  updated_at timestamptz not null default now(),
  constraint card_faces_one_owner check ((profile_id is null) <> (space_id is null)),
  constraint card_faces_link_needs_url check (mode <> 'link' or link_url is not null)
);
create unique index if not exists card_faces_profile_idx on public.card_faces(profile_id) where profile_id is not null;
create unique index if not exists card_faces_space_idx on public.card_faces(space_id) where space_id is not null;
alter table public.card_faces enable row level security;
revoke all on table public.card_faces from public, anon, authenticated;
grant all on public.card_faces to service_role;
comment on table public.card_faces is 'LIVE-1282 member cards: what a tap on a member card opens, set by its owner (a member or a Space). No row = mode page. Service role only; lib/member-cards gates every read and write.';

create sequence if not exists public.member_card_number_seq start 1;
revoke all on sequence public.member_card_number_seq from public, anon, authenticated;
grant usage, select on sequence public.member_card_number_seq to service_role;

alter table public.member_cards add column if not exists card_number integer;
alter table public.member_cards add column if not exists face_space_id uuid references public.spaces(id) on delete set null;
create unique index if not exists member_cards_number_idx on public.member_cards(card_number) where card_number is not null;
create index if not exists member_cards_face_space_idx on public.member_cards(face_space_id) where face_space_id is not null;
comment on column public.member_cards.card_number is 'LIVE-1282: the Frequency-wide card number printed on the card (member_card_number_seq), never reissued. 1 to 100 is the Founders edition.';
comment on column public.member_cards.face_space_id is 'LIVE-1282: set when the card is registered to a Space; a tap opens that Space''s card face.';

-- The one numbering writer, so two console writes can never print the same number.
create or replace function public.next_member_card_number()
returns integer
language sql
security definer
set search_path = public
as $$ select nextval('public.member_card_number_seq')::integer $$;
revoke all on function public.next_member_card_number() from public, anon, authenticated;
grant execute on function public.next_member_card_number() to service_role;

create table if not exists public.card_taps (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.member_cards(id) on delete set null,
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  owner_space_id uuid references public.spaces(id) on delete cascade,
  kind text not null check (kind in ('open', 'save', 'swap')),
  tapper_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint card_taps_one_owner check ((owner_profile_id is null) <> (owner_space_id is null))
);
create index if not exists card_taps_owner_profile_idx on public.card_taps(owner_profile_id, kind) where owner_profile_id is not null;
create index if not exists card_taps_owner_space_idx on public.card_taps(owner_space_id, kind) where owner_space_id is not null;
create index if not exists card_taps_card_idx on public.card_taps(card_id) where card_id is not null;
create index if not exists card_taps_tapper_idx on public.card_taps(tapper_profile_id) where tapper_profile_id is not null;
alter table public.card_taps enable row level security;
revoke all on table public.card_taps from public, anon, authenticated;
grant all on public.card_taps to service_role;
comment on table public.card_taps is 'LIVE-1282 member cards: one row per phone tap (open) and per Save contact / Swap contacts on a card face, for the owner''s numbers. Service role only.';

alter table public.network_contacts drop constraint if exists network_contacts_source_check;
alter table public.network_contacts
  add constraint network_contacts_source_check
  check (source in ('manual', 'card_scan', 'poster', 'import', 'qr_scan', 'event', 'nfc_card'));

commit;
