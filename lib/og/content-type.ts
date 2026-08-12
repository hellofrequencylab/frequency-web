// ─────────────────────────────────────────────────────────────────────────────
// THE ONE CONSTANT EVERY PAGE IN THE APP IMPORTS — kept in a leaf module ON PURPOSE (ADR-1002).
//
// This is a one-line module because of where the line is imported FROM, not because of what it
// says. `app/opengraph-image.tsx` is the ROOT metadata image, so Next inherits it into every
// page's metadata module: whatever that file imports, all ~400 serverless functions carry.
//
// It used to declare `export const contentType = OG_CONTENT_TYPE` with `OG_CONTENT_TYPE` imported
// from `lib/og/deliver.ts`. Bundling is per MODULE, not per export, so that single constant pulled
// all of deliver.ts into every page's chunk — including `deliverCard`, including its `sharp` load,
// and so `libvips-cpp.so` (17.7MB) landed in 403 functions for the sake of the string "image/jpeg".
// 6.9GB of the deploy. It is what pushed `Deploying outputs` into ENOSPC on 2026-08-11 and kept
// the Studio wizards off production.
//
// ⚠️ KEEP THIS MODULE FREE OF IMPORTS. Anything imported here is imported by the entire app. A
// route that needs the ENCODER wants `deliverCard`/`cardResponse` from ./deliver; a route that
// only needs to DECLARE what it serves wants this. `pnpm check:og-trace` fails the build if sharp
// finds its way back into a function that does not rasterise a card.
// ─────────────────────────────────────────────────────────────────────────────

/** The MIME every claim/entity card declares AND serves. Exported so a route's `contentType` and
 *  the bytes it actually returns cannot drift apart — a mismatch makes `og:image:type` a lie. */
export const OG_CONTENT_TYPE = 'image/jpeg'
