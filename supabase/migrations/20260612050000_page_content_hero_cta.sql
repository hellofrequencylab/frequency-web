-- =============================================================================
-- Page content: hero image + call-to-action (PX.1; extends ADR-180/182)
--
-- WHY: operators can already retitle a registered page in place (page_content,
-- 20260609040000), but the visual top of a page — a hero image and a single
-- call-to-action button — was still code-only. These three nullable columns let
-- an admin+ set them from the same Settings panel (PageContentModule). NULL (or
-- clearing the field in the editor) = the page's coded fallback, which for all
-- three is "render nothing extra" — so the change is purely additive and no page
-- looks different until an operator sets a value.
--
-- RENDERING IS SLOT-RESPECTING (PAGE-FRAMEWORK §3): a registered route shows the
-- CTA in its template's header `action` slot and the hero banner under the
-- header only where the template has a natural place for it; routes without a
-- natural slot simply ignore the fields. The CTA renders only when BOTH
-- cta_label and cta_href are set. Links are validated server-side to be
-- root-relative or http(s) (lib/page-content-actions.ts), never raw schemes.
--
-- RLS: unchanged — public read (it's page chrome shown to everyone); all writes
-- go through the service role from the admin-gated save action.
-- =============================================================================

ALTER TABLE public.page_content
  ADD COLUMN IF NOT EXISTS hero_image text,
  ADD COLUMN IF NOT EXISTS cta_label  text,
  ADD COLUMN IF NOT EXISTS cta_href   text;

COMMENT ON COLUMN public.page_content.hero_image IS
  'Optional hero image URL (root-relative or http(s)) rendered under the page header where the template has a hero slot. NULL = coded fallback (no hero).';
COMMENT ON COLUMN public.page_content.cta_label IS
  'Optional call-to-action button label, rendered in the page header action slot. The CTA shows only when cta_href is also set.';
COMMENT ON COLUMN public.page_content.cta_href IS
  'Call-to-action destination (root-relative path or http(s) URL, validated in the save action). The CTA shows only when cta_label is also set.';
