-- Stripe billing identifiers were column-granted to anon on a publicly-readable table (ADR-964).
--
-- `spaces` carries COLUMN-level grants to anon on 33 columns, two of which are
-- `stripe_customer_id` and `stripe_subscription_id`. Its only SELECT policy, `spaces_read_active`,
-- applies to the PUBLIC role (which includes anon) with:
--     using (status = 'active' and (visibility is distinct from 'private' or private.is_space_member(id)))
-- so for every ACTIVE, NON-PRIVATE Space the anon key that ships in the browser bundle could
-- select both identifiers. RLS is ROW-level and cannot hide a column — that is the whole reason
-- `20270127000000_revoke_claim_token_from_anon.sql` exists, and this is the same class, on the
-- same table, missed when that column list was written.
--
-- LATENT, NOT LEAKING, and that is the reason to do it now rather than later: 19 active public
-- Spaces today, 0 with either column populated, because no Space has ever been charged. The first
-- subscription is what makes this live, so the fix belongs before billing fills the column, not
-- after. A billing identifier is not a credential, but it enumerates who is paying and is exactly
-- the kind of value that makes support impersonation easy.
--
-- Every reader of these two columns goes through createAdminClient() (lib/billing/*), so this is
-- behaviour-preserving. `authenticated` keeps nothing here either: same reasoning, and a signed-in
-- stranger is no more entitled to another Space's billing id than a signed-out one.
--
-- Verified after applying:
--   has_column_privilege('anon',          'public.spaces', 'stripe_customer_id',     'SELECT') = false
--   has_column_privilege('authenticated', 'public.spaces', 'stripe_subscription_id', 'SELECT') = false
--   has_column_privilege('service_role',  'public.spaces', 'stripe_customer_id',     'SELECT') = true
--   slug / name unchanged (still anon-readable, which is correct)

revoke select (stripe_customer_id, stripe_subscription_id)
  on table public.spaces from anon, authenticated;

comment on column public.spaces.stripe_customer_id is
  'Stripe customer id. NOT anon/authenticated readable: spaces_read_active admits PUBLIC to every active non-private row, and RLS cannot hide a column. Read it through createAdminClient() only (ADR-964).';
