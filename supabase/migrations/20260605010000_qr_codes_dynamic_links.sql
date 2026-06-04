-- QR platform, Phase 1: dynamic links + scan analytics.
-- (docs/ENGAGEMENT-ARCHITECTURE.md authoring section, ADR-088/089.)
--
-- `qr_codes` is the managed, retargetable code the QR Studio edits. A code either
-- redirects to any URL ('url') or runs the in-app earn pipeline by pointing at a
-- physical node ('node') — so one code entity covers both worlds (the "Both"
-- model). The printed image only ever encodes a stable short link (/q/<slug>), so
-- the destination, reward, schedule, and styling are all editable with no reprint.
--
-- `qr_scans` is the append-only analytics log; `scan_count` is a denormalized
-- counter kept in step by the record_qr_scan RPC for cheap list rendering.
--
-- Server-mediated like `nodes`: RLS denies all client access; the /q route + admin
-- studio use the service role. The `style` jsonb is reserved for the Phase 2 visual
-- editor (no re-migration needed). ADDITIVE. After applying, regenerate types:
--   npx supabase gen types typescript --linked > lib/database.types.ts

create table if not exists public.qr_codes (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,                       -- the short link: /q/<slug>
  title            text not null,
  destination_type text not null default 'url'
                     check (destination_type in ('url', 'node')),
  target_url       text,                                       -- when destination_type='url'
  node_id          uuid references public.nodes(id) on delete set null,  -- when 'node'
  owner_profile_id uuid references public.profiles(id) on delete set null, -- per-member codes (later phases)
  partner_id       uuid references public.partners(id) on delete set null,
  style            jsonb not null default '{}'::jsonb,         -- reserved: Phase 2 visual editor
  active           boolean not null default true,
  valid_from       timestamptz,
  valid_until      timestamptz,
  scan_count       integer not null default 0,                 -- denormalized (see record_qr_scan)
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists qr_codes_slug_idx on public.qr_codes (slug);
create index if not exists qr_codes_owner_idx on public.qr_codes (owner_profile_id);
create index if not exists qr_codes_partner_idx on public.qr_codes (partner_id);

create table if not exists public.qr_scans (
  id          uuid primary key default gen_random_uuid(),
  qr_code_id  uuid not null references public.qr_codes(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,  -- null = anonymous scan
  scanned_at  timestamptz not null default now()
);
create index if not exists qr_scans_code_idx on public.qr_scans (qr_code_id, scanned_at desc);
create index if not exists qr_scans_profile_idx on public.qr_scans (profile_id);

-- keep updated_at fresh via the shared trigger fn
create trigger qr_codes_set_updated_at
  before update on public.qr_codes
  for each row execute function public.set_updated_at();

alter table public.qr_codes enable row level security;
alter table public.qr_scans enable row level security;
-- No client policies on purpose: codes (incl. partner/owner links + targets) and the
-- raw scan log are managed server-side via the service role, mirroring `nodes`.

-- Atomic scan record: append the analytics row AND bump the cached counter. Called
-- by the /q/<slug> resolver (server) on every resolve; SECURITY DEFINER so it runs
-- under the locked-down RLS and is callable by web + mobile alike.
create or replace function public.record_qr_scan(
  p_code_id uuid,
  p_profile uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.qr_scans (qr_code_id, profile_id) values (p_code_id, p_profile);
  update public.qr_codes set scan_count = scan_count + 1 where id = p_code_id;
end;
$$;

comment on table public.qr_codes is
  'Managed dynamic QR codes: a short link (/q/<slug>) that redirects to a URL or an in-app node. Server-mediated (RLS denies client access). Styling in `style` jsonb (Phase 2). See docs/ENGAGEMENT-ARCHITECTURE.md.';
comment on table public.qr_scans is
  'Append-only scan log for QR analytics. Read service-role only; scan_count on qr_codes is the cached aggregate.';
