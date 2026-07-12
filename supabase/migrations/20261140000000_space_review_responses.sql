-- Space-admin responses on member reviews (Reviews redesign). Additive + idempotent, safe to re-run.
--
-- A Space operator (owner / admin / editor) may now publish ONE public reply under each member
-- review, the way Google Business, Yelp, and app-store listings let a business respond. The reply
-- rides three new nullable columns on the EXISTING public.space_reviews row (no new table, so the
-- one-review-per-member upsert + the visible/hidden moderation are untouched):
--   - response_body            text        — the operator's reply, or null when there is none.
--   - response_author_profile_id uuid      — who replied (an operator profile), or null.
--   - response_at              timestamptz — when the reply was published / last edited, or null.
-- Clearing a reply nulls all three (the operator "Remove reply" path). All three null = no reply.
--
-- space_reviews already carries RLS (created in 20260918000200); this ONLY adds nullable columns to
-- an existing, already-policied table, so no new RLS policy or allowlist entry is needed. Writes go
-- through the gated admin action respondToSpaceReview (content-actions.ts), which re-checks the
-- operator capability server-side and scopes the write to (space_id, id). lib/database.types.ts is
-- regenerated separately (ADR-246); the read/write seams reach these columns with untyped casts
-- until then. No em or en dashes.

alter table public.space_reviews
  add column if not exists response_body text,
  add column if not exists response_author_profile_id uuid references public.profiles(id),
  add column if not exists response_at timestamptz;

comment on column public.space_reviews.response_body is
  'Space-admin reply to this member review (Reviews redesign). Null when there is no reply. Written only by the gated operator action respondToSpaceReview.';
comment on column public.space_reviews.response_author_profile_id is
  'The operator profile who published the reply (references public.profiles). Null when there is no reply.';
comment on column public.space_reviews.response_at is
  'When the reply was published or last edited. Null when there is no reply.';

-- ROLLBACK:
--   alter table public.space_reviews
--     drop column if exists response_body,
--     drop column if exists response_author_profile_id,
--     drop column if exists response_at;
