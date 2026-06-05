-- Entry-point A/B testing (ADR-135, Entry Points Phase 3). Destination variants under
-- ONE entry point (one printed QR / slug): the /q resolver splits scan traffic by
-- weight, records the served variant per scan, and carries it to signup so conversions
-- attribute per variant. Additive; the new tables are service-role only.

create table if not exists public.entry_point_variants (
  id           uuid primary key default gen_random_uuid(),
  qr_code_id   uuid not null references public.qr_codes(id) on delete cascade,
  variant_key  text not null,
  label        text not null,
  target_url   text not null,
  weight       integer not null default 1 check (weight > 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (qr_code_id, variant_key)
);
create index if not exists entry_point_variants_code_idx on public.entry_point_variants (qr_code_id);
comment on table public.entry_point_variants is
  'ADR-135: destination variants for an entry-point A/B test (one printed slug, many targets). Service-role only.';

drop trigger if exists entry_point_variants_set_updated_at on public.entry_point_variants;
create trigger entry_point_variants_set_updated_at
  before update on public.entry_point_variants
  for each row execute function public.set_updated_at();

alter table public.entry_point_variants enable row level security;

-- Which variant a scan was served (null = no active test).
alter table public.qr_scans add column if not exists variant_key text;

-- A signup attributed to a specific variant of a specific entry point (one per person
-- per entry point) — the numerator for per-variant conversion rate.
create table if not exists public.entry_point_conversions (
  id           uuid primary key default gen_random_uuid(),
  qr_code_id   uuid not null references public.qr_codes(id) on delete cascade,
  variant_key  text not null,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (qr_code_id, profile_id)
);
create index if not exists entry_point_conversions_code_idx on public.entry_point_conversions (qr_code_id);
comment on table public.entry_point_conversions is
  'ADR-135: per-variant signup conversions for an entry-point A/B test. Service-role only.';

alter table public.entry_point_conversions enable row level security;

-- record_qr_scan v2: carry the served A/B variant onto the scan row (additive param,
-- default null — existing callers are unaffected).
create or replace function public.record_qr_scan(
  p_code_id uuid,
  p_profile uuid default null,
  p_country text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_medium text default 'qr',
  p_variant text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.qr_scans (qr_code_id, profile_id, country, city, lat, lng, medium, variant_key)
  values (
    p_code_id, p_profile, p_country, p_city, p_lat, p_lng,
    case when p_medium = 'nfc' then 'nfc' else 'qr' end,
    p_variant
  );
  update public.qr_codes set scan_count = scan_count + 1 where id = p_code_id;
end;
$function$;
