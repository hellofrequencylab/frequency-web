-- QR scan geolocation for the stats locator map. Coarse, IP-derived (city centroid
-- from the edge's geo headers) — never a precise GPS fix. Nullable, so scans without
-- geo (local/dev, or no header) just don't plot. The record_qr_scan RPC gains the geo
-- params; we drop the old 2-arg signature so there's one canonical function (existing
-- callers pass named args and the new params default to null). ADDITIVE.

alter table public.qr_scans add column if not exists country text;
alter table public.qr_scans add column if not exists city    text;
alter table public.qr_scans add column if not exists lat     double precision;
alter table public.qr_scans add column if not exists lng     double precision;

drop function if exists public.record_qr_scan(uuid, uuid);

create or replace function public.record_qr_scan(
  p_code_id uuid,
  p_profile uuid default null,
  p_country text default null,
  p_city    text default null,
  p_lat     double precision default null,
  p_lng     double precision default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.qr_scans (qr_code_id, profile_id, country, city, lat, lng)
  values (p_code_id, p_profile, p_country, p_city, p_lat, p_lng);
  update public.qr_codes set scan_count = scan_count + 1 where id = p_code_id;
end;
$$;

comment on column public.qr_scans.city is 'Coarse IP-derived city at scan time (locator map). Not GPS. See ADR-090/094.';
