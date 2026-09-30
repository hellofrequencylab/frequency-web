import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readImageDimensions } from './ingest'
import { LIBRARY_PRIVATE_BUCKET } from './protect-move'

// ─────────────────────────────────────────────────────────────────────────────
// THE STORED PROOF (LIVE-580, ADR-1623; owner rulings 2026-09-29 "Width-capped proof, no watermark"
// and ~19:10Z "Store a small proof file").
//
// A protected image's proof is its OWN OBJECT in `library-private`, at a path derived from the
// master's: `proofs/<storage_path>`. A proof link is a signed URL for THAT object, so its token names
// the proof's path and nothing else; storage checks the token's path on every route, so no edit of a
// proof link reaches the master. (A transform-signed link of the master would not hold: storage's
// object route accepts the same token and ignores the transform, so the master was one path segment
// away. That is why the proof is stored, and why this amends HYG-017's "nothing writes derivative
// files" for protected images only.)
//
// 🔴 NO DECODE HERE. The resize is storage's image transform, the one `renditionUrl` already uses:
// the master is signed for one minute WITH a width cap, fetched server-side, and the bytes storage
// returns are uploaded as the proof. `sharp` stays out of this seam (check:og-trace fails a route
// that traces it without rasterising a card; docs/DEPLOY-SAFETY.md, lib/library/ingest.ts header).
//
// 🔴 THE CAP IS CHECKED ON THE BYTES. The proof's own header is parsed (readImageDimensions, byte
// parsing only) and anything wider than the cap, or whose width cannot be read, is refused and never
// stored: a proof file can never be the master under another name, whatever storage answered.
// ─────────────────────────────────────────────────────────────────────────────

/** A proof's width: the grid preset (RENDITION_PRESETS.grid, a browser gallery card). */
export const LIBRARY_PROOF_WIDTH = 480

/** Where a proof lives inside `library-private`, beside nothing a Loom row names (rows hold `<space>/<file>`). */
export const LIBRARY_PROOF_PREFIX = 'proofs/'

/** The deterministic proof path for a master's storage path. No column, so no migration: the path IS the link. */
export function libraryProofPath(storagePath: string): string {
  return `${LIBRARY_PROOF_PREFIX}${storagePath.replace(/^\/+/, '')}`
}

/** A proof larger than this is not a 480px image; refused rather than stored. */
const MAX_PROOF_BYTES = 2 * 1024 * 1024

/** How long the one-minute master signature used to make a proof lives. It never leaves the server. */
const MAKE_TTL_SECONDS = 60

/**
 * Write (or rewrite) the proof of one private master. True when a proof object now exists at
 * `libraryProofPath(storagePath)`. Never throws: a false leaves the asset without a proof, which
 * `proofLibraryAssetUrl` retries lazily and every surface renders as its no-image placeholder.
 */
export async function writeLibraryProof(storagePath: string): Promise<boolean> {
  if (!storagePath || storagePath.startsWith(LIBRARY_PROOF_PREFIX)) return false
  try {
    const bucket = createAdminClient().storage.from(LIBRARY_PRIVATE_BUCKET)
    const { data: signed } = await bucket.createSignedUrl(storagePath, MAKE_TTL_SECONDS, {
      transform: { width: LIBRARY_PROOF_WIDTH, resize: 'contain' },
    })
    if (!signed?.signedUrl) return false
    const res = await fetch(signed.signedUrl, { headers: { Accept: 'image/webp,image/png,image/jpeg' }, cache: 'no-store' })
    if (!res.ok) return false
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') return false
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PROOF_BYTES) return false
    const dims = readImageDimensions(bytes)
    if (!dims || dims.width > LIBRARY_PROOF_WIDTH) return false
    const { error } = await bucket.upload(libraryProofPath(storagePath), bytes, { contentType, upsert: true })
    return !error
  } catch {
    return false
  }
}

/** Remove the proof of one master (unprotect, delete). Removing a missing object is not an error. */
export async function removeLibraryProof(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return
  try {
    await createAdminClient().storage.from(LIBRARY_PRIVATE_BUCKET).remove([libraryProofPath(storagePath)])
  } catch {
    /* best-effort: a lingering proof is private and no row names it */
  }
}
