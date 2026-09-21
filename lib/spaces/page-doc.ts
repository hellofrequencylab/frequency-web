import 'server-only'

import type { Data } from '@/lib/page-editor/types'
import { refreshAssetRefUrls } from '@/lib/library/resolve-refs'
import { resolveSpacePageDoc } from './profile-pages'
import { resolveSpaceAuthoredContent, type SpaceAuthoredContent } from './authored-content'

// ─────────────────────────────────────────────────────────────────────────────
// THE SPACE-DOCUMENT LOAD SEAM (PROG-D2, ADR-1130 remainder).
//
// A Space profile page body is a Puck document stored on `spaces.preferences`
// (pageDocs[slug], or the legacy `preferences.puck` for Home). Its image values
// carry the SAME `string | AssetRef` shape the `pages` table carries, because the
// operator picks them with the same page-editor fields (imgField, loomImageField,
// the gallery field, lib/page-editor/*). So the Space side needs the same server
// half the `pages` side already has.
//
// 🔴 WHY THIS MODULE EXISTS AT ALL. `getPublishedData` (lib/page-editor/data.ts)
// refreshes every ref cache before a published `pages` document renders, so a
// re-pointed asset reaches the page without re-saving it. The Space side had no
// equivalent: `resolveSpacePageDoc` is PURE by contract (no Supabase, no Next —
// see the header of ./profile-pages.ts), so the refresh cannot live inside it and
// had nowhere else to hang. That is the gap, and it is not theoretical: THREE
// SHIPPED ACTIONS re-point `library_assets.url` on a live row while keeping its
// id — `replaceLibraryAssetFile` (admin/library/replace-actions.ts), `rollbackToVersion`
// (lib/library/versions.ts) and the Recraft edits (admin/library/recraft-actions.ts).
// Every one of them promises in its own header that references "follow the new file
// automatically". That promise was true for `pages` and false for Space profiles.
//
// This is the load function the refresh hangs on: resolve (pure, fail-safe to the
// universal default) THEN refresh (fail-open to each ref's cached url). Server-only,
// because the refresh reaches the database.
//
// COST, stated because the render path is budgeted (docs/DEPLOY-SAFETY.md): a
// document with no refs — every legacy Space, every default page — costs ZERO
// queries and returns the SAME object, because `collectAssetRefIds` finds nothing
// and `refreshAssetRefUrls` returns early. A document with refs costs ONE batched
// `select id, url`. No pixels, no sharp, no next/og.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Puck doc for a Space profile page, with every AssetRef cache re-pointed at
 * its asset's CURRENT url. The Space-side twin of `getPublishedData`.
 *
 * FAIL-SAFE then FAIL-OPEN, in that order: a missing / malformed / stale-block doc
 * still resolves to the universal default page (so the page never goes blank), and
 * a refresh that cannot reach the database leaves every cached url standing (so the
 * page still renders the image it rendered yesterday).
 */
export async function loadSpacePageDoc(
  preferences: unknown,
  name: string,
  slug: string,
): Promise<Data> {
  return refreshAssetRefUrls(resolveSpacePageDoc(preferences, name, slug))
}

/**
 * The operator's authored content blocks for a Space's Home page, with every
 * AssetRef cache refreshed. The module-engine render path (SpaceProfileModules,
 * the owner layout preview) reads authored images through this bag rather than
 * through the whole document, so it gets its own refresh rather than a stale one.
 *
 * The extraction stays pure and total (an all-empty bag on any malformed shape);
 * only the refresh is added here.
 */
export async function loadSpaceAuthoredContent(
  preferences: unknown,
  name: string,
): Promise<SpaceAuthoredContent> {
  return refreshAssetRefUrls(resolveSpaceAuthoredContent(preferences, name))
}
