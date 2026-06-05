-- Editable profile / vCard with permissions (issue #221). A member-controlled
-- contact card config on profiles: which fields the profile QR shares (opt-in
-- email / phone / org / title / website / avatar). A dedicated column (not `meta`,
-- which gets overwritten at onboarding) so the config is never clobbered. The
-- public /people/<handle>/vcard endpoint builds a .vcf from this. ADDITIVE.

alter table public.profiles add column if not exists vcard jsonb not null default '{}'::jsonb;

comment on column public.profiles.vcard is
  'Member-controlled contact-card config (lib/vcard.ts): enabled + opt-in shared fields for the profile QR''s "Save contact" vCard. See issue #221.';
