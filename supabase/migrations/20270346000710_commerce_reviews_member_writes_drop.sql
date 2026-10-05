-- =============================================================================
-- Drop the member-facing WRITE policies on commerce_reviews and commerce_disputes (SCAN-709).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- 20261112000000_commerce_reviews.sql created four write policies for `authenticated`:
--   commerce_reviews_member_insert   insert where reviewer_profile_id = me
--   commerce_reviews_author_update   update where reviewer_profile_id = me
--   commerce_disputes_buyer_insert   insert where opened_by = me
--   commerce_disputes_buyer_update   update where opened_by = me
-- Each checks ONLY identity. None constrains verified_purchase, status, resolution_note,
-- resolved_by or whether the reviewer owns the product. So a seller could insert a five-star
-- verified review of their own listing straight through PostgREST with their own JWT, a reviewer
-- whose review an operator hid could patch status back, and a buyer could patch their dispute
-- to resolved_refund with the note "Approved and refunded".
--
-- Every legitimate writer already uses the service-role client (lib/commerce/reviews.ts,
-- lib/commerce/disputes.ts, app/(main)/orders/dispute-actions.ts), which is where the
-- verified-purchase, not-the-seller and hidden-review gates live. The four policies served no
-- caller in the app; they served only a caller who skipped the app. The public-read, party-read
-- and author-delete policies stay. 20261112000000 is not edited (ADR: migrations are append-only).
-- =============================================================================

drop policy if exists commerce_reviews_member_insert on public.commerce_reviews;
drop policy if exists commerce_reviews_author_update on public.commerce_reviews;
drop policy if exists commerce_disputes_buyer_insert on public.commerce_disputes;
drop policy if exists commerce_disputes_buyer_update on public.commerce_disputes;
