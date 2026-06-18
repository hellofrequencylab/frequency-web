-- Two images per page: a WIDE header/banner + a COMPACT social-share image (ADR-309).
--
-- page_settings.og_image_url already holds the compact link-preview / OG image. This adds the wide
-- header/banner image, edited from the same on-page SEO & meta panel and rendered as the page's
-- hero on index/dashboard pages (My Quest, Practices, …). Additive + nullable, so reads are
-- harmless before AND after it applies (loadPageSettings fail-safes to null on any miss).
ALTER TABLE public.page_settings
  ADD COLUMN IF NOT EXISTS header_image_url text;

COMMENT ON COLUMN public.page_settings.header_image_url IS
  'Wide page header/banner image (operator-set in the SEO & meta panel). og_image_url is the compact social-share/OG image.';
