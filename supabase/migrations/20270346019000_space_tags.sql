-- Space check-in tags: NFC stickers the CyberUnicorn console writes for a Space (LIVE-1182).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md "Check-in tags" for the program; this file
-- explains the schema, it does not track the work.
--
-- Staff pick a Space in the CyberUnicorn console (admin menu, Admin and Janitor) and write that Space's
-- signed door check-in link (/n/<node>?s=<code>, lib/qr/node-code.ts) onto an NTAG sticker. A member taps
-- it with their phone at the Space and lands on the same check-in the door QR code runs. This table is
-- the inventory: which chip was written for which Space, where it went, and who wrote it. It does not
-- take part in the check-in itself, so a tag works whether or not its row exists.
--   • uid: the chip's serial, upper-case hex. A location sticker is public, so it is kept in the clear
--     to tell tags apart on the list (member cards keep an HMAC instead).
--   • removed_at: staff took it off the list. The link on the sticker keeps working.
--
-- Service role only, like member_cards (lib/devices does the tenancy). No money moves. No existing
-- table changes.
--
-- Additive and idempotent. ROLLBACK:
--   drop table if exists public.space_tags;

begin;

create table if not exists public.space_tags (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  node_id uuid references public.nodes(id) on delete set null,
  uid text,
  chip_type text,
  label text not null default '',
  written_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index if not exists space_tags_space_idx on public.space_tags(space_id, created_at desc);
create index if not exists space_tags_node_idx on public.space_tags(node_id) where node_id is not null;
create index if not exists space_tags_written_by_idx on public.space_tags(written_by) where written_by is not null;
alter table public.space_tags enable row level security;
revoke all on table public.space_tags from public, anon, authenticated;
grant all on public.space_tags to service_role;
comment on table public.space_tags is 'LIVE-1182: an NFC check-in tag the CyberUnicorn console wrote for a Space (the Space''s signed door link on a sticker). Inventory only; the check-in runs through the node. Service role only.';

commit;
