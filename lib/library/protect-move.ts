// THE PROTECT MOVE, PLANNED (LIVE-577, ADR-1595 under ADR-1562).
//
// Protected used to be a word on a row: every Loom object lived in the public `library-media`
// bucket. Protecting an asset now MOVES its file into the private `library-private` bucket
// (20270345009550), and switching Protected off moves it back. This module is the pure half: given
// the row and its versions it decides whether anything moves, which objects, and exactly what the
// row and each version row become. `protectLibraryAsset` (app/(main)/admin/library/actions.ts) is
// the IO half: copy, write the rows, remove the old objects, and undo every step it took when a
// later one fails.
//
// THE RULES this file holds, each one a consequence:
//   • The flag follows the BUCKET, not the stored flag. A row LIVE-576 marked Protected while its file
//     sat in library-media is still public, so asking for Protected on it moves the file.
//   • `url` is NULL exactly when the file is in library-private. A signed URL expires, so a stored one
//     is a stored expiry (lib/events/series-seo.ts); a bare path in a url column is read as a relative
//     image by every reader that paints `url`. Null is the value every pick reader already drops
//     (`url.length > 0`) and every AssetRef refresh already skips, so a protected master cannot be
//     offered for placement and cannot re-point a live page's cache.
//   • Every VERSION's file moves with the asset. Replace and Recraft edits keep the prior file for
//     rollback, so moving only the current file would leave the ORIGINAL one public URL away, which is
//     the defect this row closes. The version rows are rewritten to the new bucket so a rollback of a
//     protected asset restores a private file, not a removed public one.
//   • Audio and video refuse: recordings-media has no private twin yet. A code-drawn element refuses:
//     there is no file to move. A file in any other bucket refuses: it is not the Loom's to move.
//   • Only an object this asset ALONE owns moves. A seed or an import row was filed from an object the
//     importer stored and the seeded Space may paint by address, so it refuses here; a file another
//     Loom row or another asset's version also points at refuses in the action (it reads the rows).

export const LIBRARY_PUBLIC_BUCKET = 'library-media'
export const LIBRARY_PRIVATE_BUCKET = 'library-private'

/** The asset row fields the plan reads. */
export type ProtectAssetRow = {
  id: string
  kind: string
  storage_bucket: string | null
  storage_path: string | null
  is_protected: boolean
  /** Provenance (library_assets_source_check). A seed or an import was FILED from an object the
   *  importer stored, and the seeded Space may paint that object by its address (a cover url). */
  source?: string | null
}

/** One `library_versions` row: its own bucket and path, plus the snapshot a rollback restores. */
export type ProtectVersionRow = {
  id: string
  storage_bucket: string | null
  storage_path: string | null
  recipe: Record<string, unknown> | null
}

export type VersionRewrite = {
  id: string
  before: { storage_bucket: string | null; recipe: Record<string, unknown> | null }
  after: { storage_bucket: string; recipe: Record<string, unknown> | null }
}

export type ProtectPlan =
  | { ok: false; error: string }
  /** Nothing to move: the file already sits where the flag says. Only the flag may change. */
  | { ok: true; move: false; isProtected: boolean }
  | {
      ok: true
      move: true
      isProtected: boolean
      from: string
      to: string
      /** Every distinct object to copy then remove: the current file first, then each version's. */
      paths: string[]
      /** What the asset row becomes (and `before`, what it goes back to on a failed later step). */
      asset: { storage_bucket: string; url: string | null; is_protected: boolean }
      assetBefore: { storage_bucket: string; url: string | null; is_protected: boolean }
      versions: VersionRewrite[]
    }

export const PROTECT_REFUSAL = {
  av: 'Audio and video cannot be protected yet. Their files live in a bucket with no private side.',
  noFile: 'Only an uploaded file can be protected. This one is drawn from code, so there is no file to lock away.',
  foreign: 'This file lives outside the Loom library buckets, so Protected cannot move it.',
  filed: 'This image came in with a Space import, and that Space may show it by its address. Upload your own copy to protect it.',
  shared: 'Another Loom asset uses this same file, so moving it would pull that one off the web too.',
} as const

/** Step one, before anything is written: may this asset be protected at all? Null when it may. */
export function protectRefusal(row: ProtectAssetRow, on: boolean): string | null {
  if (!on) return null
  if (row.kind === 'audio' || row.kind === 'video' || row.storage_bucket === 'recordings-media') return PROTECT_REFUSAL.av
  if (!row.storage_bucket || !row.storage_path) return PROTECT_REFUSAL.noFile
  if (row.storage_bucket !== LIBRARY_PUBLIC_BUCKET && row.storage_bucket !== LIBRARY_PRIVATE_BUCKET) {
    return PROTECT_REFUSAL.foreign
  }
  if (row.storage_bucket === LIBRARY_PUBLIC_BUCKET && (row.source === 'seed' || row.source === 'import')) {
    return PROTECT_REFUSAL.filed
  }
  return null
}

/** Plan the move for `on`. `publicUrlFor` is the storage client's getPublicUrl for library-media,
 *  passed in so this stays pure. `currentUrl` is the row's url today, kept for the undo. */
export function planProtectMove(
  row: ProtectAssetRow & { url: string | null },
  versions: ProtectVersionRow[],
  on: boolean,
  publicUrlFor: (path: string) => string,
): ProtectPlan {
  const refusal = protectRefusal(row, on)
  if (refusal) return { ok: false, error: refusal }

  const inPrivate = row.storage_bucket === LIBRARY_PRIVATE_BUCKET
  // Switching off a file that is not in the private bucket moves nothing (audio, an element, a file
  // LIVE-576 flagged but never moved). Switching on a file already private moves nothing either.
  if (on === inPrivate || !row.storage_bucket || !row.storage_path) return { ok: true, move: false, isProtected: on }

  const from = row.storage_bucket
  const to = on ? LIBRARY_PRIVATE_BUCKET : LIBRARY_PUBLIC_BUCKET
  const urlFor = (path: string) => (to === LIBRARY_PRIVATE_BUCKET ? null : publicUrlFor(path))

  const moving = versions.filter((v) => v.storage_bucket === from && !!v.storage_path)
  const paths = [...new Set([row.storage_path, ...moving.map((v) => v.storage_path as string)])]

  return {
    ok: true,
    move: true,
    isProtected: on,
    from,
    to,
    paths,
    asset: { storage_bucket: to, url: urlFor(row.storage_path), is_protected: on },
    assetBefore: { storage_bucket: from, url: row.url, is_protected: row.is_protected },
    versions: moving.map((v) => ({
      id: v.id,
      before: { storage_bucket: v.storage_bucket, recipe: v.recipe },
      after: {
        storage_bucket: to,
        recipe: v.recipe ? { ...v.recipe, storage_bucket: to, url: urlFor(v.storage_path as string) } : v.recipe,
      },
    })),
  }
}
