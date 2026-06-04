-- Member-editable contact fields on profiles (ADR: member contact card + CRM).
-- Email stays canonical in auth.users; these are the extra details a member can
-- view/edit about themselves, and that leaders see in the CRM. `website` already
-- exists. Additive + nullable; the existing "profiles: self update" RLS policy
-- (auth_user_id ownership) lets a member set these on their own row.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists city  text;

comment on column public.profiles.phone is 'Member-entered contact phone (private; visible to self + leaders in CRM).';
comment on column public.profiles.city  is 'Member-entered city (private; visible to self + leaders in CRM).';
