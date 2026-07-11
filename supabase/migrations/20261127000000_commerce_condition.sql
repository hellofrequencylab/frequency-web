-- Phase 0 (Etsy-Grade Market): New / Used condition on a commerce listing.
--
-- A listing's condition is New or Used. Nullable = unset, which is correct for a
-- listing where condition does not apply (a service, a booking, a ticket). No
-- backfill: existing rows stay null until edited.
--
-- Role gate (enforced in app code, R3): an individual maker (owner_kind='profile')
-- may list Used only; a Business Space Shop (owner_kind='space') and the Frequency
-- Store (owner_kind='platform') may list New or Used. The column itself only
-- constrains the vocabulary; the who-can-set-'new' rule lives in the create paths.

alter table public.commerce_products
  add column if not exists condition text
  check (condition is null or condition in ('new', 'used'));
