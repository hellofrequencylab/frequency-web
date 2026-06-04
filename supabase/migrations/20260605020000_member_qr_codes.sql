-- QR platform, Phase 3: per-member codes + referral attribution (ADR-091).
--
-- Members get persistent personal codes (owned via qr_codes.owner_profile_id):
--   • connect  — destination_type='url'  → their public profile
--   • referral — destination_type='action', purpose='referral' (credits the owner
--                when a new member signs up after scanning)
--   • gift_zap — destination_type='action', purpose='gift_zap' (a scanner gives the
--                owner a zap from a confirm page)
--
-- `purpose` disambiguates a member's codes (a unique index guarantees one per
-- purpose, so provisioning is idempotent). `destination_type` gains 'action' for the
-- in-app member actions. `profiles.referred_by_profile_id` records who referred a
-- member (one-time attribution, set at onboarding from the fq_ref cookie). ADDITIVE.
-- After applying, regenerate types.

alter table public.qr_codes drop constraint if exists qr_codes_destination_type_check;
alter table public.qr_codes add constraint qr_codes_destination_type_check
  check (destination_type in ('url', 'node', 'action'));

alter table public.qr_codes add column if not exists purpose text
  check (purpose in ('connect', 'referral', 'gift_zap'));

-- One persistent code per (member, purpose) — makes lazy provisioning idempotent.
create unique index if not exists qr_codes_owner_purpose_uniq
  on public.qr_codes (owner_profile_id, purpose)
  where owner_profile_id is not null and purpose is not null;

alter table public.profiles add column if not exists referred_by_profile_id uuid
  references public.profiles(id) on delete set null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by_profile_id);

comment on column public.qr_codes.purpose is
  'For per-member codes: connect | referral | gift_zap. Unique per owner. See ADR-091.';
comment on column public.profiles.referred_by_profile_id is
  'The member who referred this one (set once at onboarding from a scanned referral code). ADR-091.';
