-- NFC parity: record the MEDIUM a dynamic-link scan arrived through. A printed QR
-- and a programmed NFC tag can encode the same /q/<slug>, so we can't infer the
-- channel from the code — the tag writes `?m=nfc` into its URL and the resolver
-- forwards it here. Defaults to 'qr' (the overwhelming case: a printed code), so
-- every existing row and every caller that omits the param stays correct. ADDITIVE.

alter table public.qr_scans add column if not exists medium text not null default 'qr';

alter table public.qr_scans drop constraint if exists qr_scans_medium_check;
alter table public.qr_scans add constraint qr_scans_medium_check check (medium in ('qr', 'nfc'));

-- Re-create the recorder with the new trailing param (defaulted, so the prior
-- 6-arg named callers keep working). Drop the old signature for one canonical fn.
drop function if exists public.record_qr_scan(uuid, uuid, text, text, double precision, double precision);

create or replace function public.record_qr_scan(
  p_code_id uuid,
  p_profile uuid default null,
  p_country text default null,
  p_city    text default null,
  p_lat     double precision default null,
  p_lng     double precision default null,
  p_medium  text default 'qr'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.qr_scans (qr_code_id, profile_id, country, city, lat, lng, medium)
  values (
    p_code_id, p_profile, p_country, p_city, p_lat, p_lng,
    case when p_medium = 'nfc' then 'nfc' else 'qr' end
  );
  update public.qr_codes set scan_count = scan_count + 1 where id = p_code_id;
end;
$$;

comment on column public.qr_scans.medium is 'How the scan arrived: ''qr'' (printed code, default) or ''nfc'' (tapped tag, via ?m=nfc). See ADR-096.';
