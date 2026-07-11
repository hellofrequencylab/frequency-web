-- SECURITY DATA-FIX: rewrite page-filed QR codes that were saved pointing at an ADMIN route.
--
-- Background: the on-page "QR & Share" designer (components/qr/page-qr-manager.tsx) minted a
-- managed code whose `target_url` (and folder `page_path`) came straight from the current
-- browser pathname. On an owner surface (e.g. `/events/<slug>/manage`, `/spaces/<slug>/settings`,
-- `/circles/<slug>/edit`) that meant the printed code resolved to the ADMIN page instead of the
-- entity's public page. The app fix (lib/qr/public-url.ts → publicUrlFor) maps every page-derived
-- code back to the public canonical page going forward; this migration repairs rows already stored.
--
-- Scope is deliberately narrow: only `destination_type = 'url'` codes that were FILED under a page
-- (`page_path IS NOT NULL` — i.e. minted by that designer, never operator-crafted Studio codes),
-- and only where the stored path ends in a known admin/owner segment. It strips exactly that
-- trailing segment (…/entity/<slug>/manage -> …/entity/<slug>), leaving every other code untouched.
-- Idempotent: re-running finds nothing left to rewrite. Any code whose target cannot be made safe
-- this way is left as-is (none should exist), and no row is ever deleted.
--
-- WRITE-ONLY per the change request: this file is committed but NOT applied here. Apply it through
-- the normal migration path after review (it touches data, not schema).

-- The admin/owner suffixes a page-filed URL code should never end in. Kept in sync with
-- FORBIDDEN_SEGMENTS / the entity collapse in lib/qr/public-url.ts.
-- Matches "…/manage", "…/settings", "…/edit", "…/edit-page", "…/crm" with an optional
-- trailing slash, query, or hash, in both target_url and page_path.

-- 1) target_url — strip the trailing admin segment from the absolute URL.
UPDATE public.qr_codes
SET target_url = regexp_replace(
      target_url,
      '/(manage|settings|edit|edit-page|crm)(/)?($|[?#].*$)',
      '\3'
    )
WHERE destination_type = 'url'
  AND page_path IS NOT NULL
  AND target_url ~ '/(manage|settings|edit|edit-page|crm)(/)?($|[?#])';

-- 2) page_path — re-file the code's Studio folder under the public page too, so its
-- folder key matches the corrected target.
UPDATE public.qr_codes
SET page_path = regexp_replace(
      page_path,
      '/(manage|settings|edit|edit-page|crm)(/)?$',
      ''
    )
WHERE page_path ~ '/(manage|settings|edit|edit-page|crm)(/)?$';
