-- Generic key -> TEXT platform settings: the string sibling of the boolean
-- platform_flags table. Reads + writes go through the service-role admin client in
-- operator-gated paths (lib/platform-flags getPlatformSetting / setPlatformSetting).
--
-- First use: personal_code_landing — where every member's personal QR code lands a
-- scanner (a same-site path; default '/', the splash). The /q resolver redirects the
-- scan there; an operator can retarget it from /admin/onboarding-controls with no
-- reprint (the printed image encodes /q/<slug>, not this path).

create table if not exists public.platform_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.platform_settings enable row level security;
-- No client policies on purpose: only the service-role admin client touches it.

insert into public.platform_settings (key, value)
values ('personal_code_landing', '/')
on conflict (key) do nothing;
