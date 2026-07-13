-- Airwaves P2 — widen the polymorphic listing_comments spine to Recordings (ADR-608, proposed).
--
-- listing_comments (20261143000000) is already polymorphic on (target_kind, target_id) and today walls
-- target_kind to the three marketplace surfaces (market_listing | listing | product). Airwaves P2 gives a
-- Recording a discussion thread by REUSING that spine — one CHECK widening plus a union-type addition
-- (lib/listings-shared/detail-view.ts) plus the delete-owner branch (lib/marketplace/listing-qna-actions.ts).
-- No new table, no new reader/writer: getListingComments('recording', id) + postListingComment work
-- unchanged. The recording delete-moderation branch resolves the Recording's owning Space owner.
--
-- ADDITIVE + IDEMPOTENT, safe to re-run. WRITTEN, NOT APPLIED. This is a data migration; nothing here is
-- member-visible. No em or en dashes in any surfaced copy.

alter table public.listing_comments
  drop constraint if exists listing_comments_target_kind_check;

alter table public.listing_comments
  add constraint listing_comments_target_kind_check
    check (target_kind in ('market_listing', 'listing', 'product', 'recording'));

comment on constraint listing_comments_target_kind_check on public.listing_comments is
  'Polymorphic comment target. Original: market_listing|listing|product (20261143000000). Widened by '
  '20261155000000 with recording (Airwaves P2 / ADR-608): a Recording reuses the same Q&A / discussion '
  'spine. See docs/MEDIA-PLATFORM-PLAN.md §7d.';

-- ROLLBACK (manual — only safe once any recording rows are removed):
--   delete from public.listing_comments where target_kind = 'recording';
--   alter table public.listing_comments drop constraint if exists listing_comments_target_kind_check;
--   alter table public.listing_comments add constraint listing_comments_target_kind_check
--     check (target_kind in ('market_listing','listing','product'));
