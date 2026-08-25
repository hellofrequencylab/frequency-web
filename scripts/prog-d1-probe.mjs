#!/usr/bin/env node
// PROG-D1 probe — "Loom D1: finish Studio ingest + search".
//
// Measures the CONSEQUENCE of the four ingest extras, never the row's own words. Each assertion is
// a thing that would be FALSE if the work were undone or regressed:
//
//   1. checksum dedupe — the write path reads (space_id, sha256) BEFORE storing, and the checksum
//      is taken after the strip, so it describes what is on disk.
//   2. EXIF strip      — the strip exists AND re-emits orientation. A version that dropped APP1
//      wholesale would pass a "does it strip" check and render every phone photo sideways.
//   3. dims/colours/blurhash — the columns are written, and the pixel work is in the BROWSER: the
//      server ingest module must not import a decoder, which is the budget property.
//   4. FTS-ranked search — the query reaches search_tsv, not only an ilike.
//
//   plus: the chokepoint really is one — neither of the two former bypass sites writes a raw
//   library_assets INSERT for an UPLOAD any more, and no rendition writer came back (HYG-017).
//
// Runs in-process (no test runner — LIVE-034). Exit 0 = done, 1 = not done, 79 = could not look.

import { readFileSync, existsSync } from 'node:fs'

const read = (p) => {
  if (!existsSync(p)) {
    console.error(`could not look: ${p} is missing`)
    process.exit(79)
  }
  return readFileSync(p, 'utf8')
}

const ingest = read('lib/library/ingest.ts')
const describe = read('lib/library/image-describe.ts')
const blurhash = read('lib/library/blurhash.ts')
const rank = read('lib/library/search-rank.ts')
const store = read('lib/library/store.ts')
const studioUpload = read('app/(main)/admin/library/actions.ts')
const picker = read('lib/loom/picker-actions.ts')
const editorUpload = read('lib/page-editor/loom-field-actions.ts')
const emailUpload = read('lib/email-studio/loom-actions.ts')
const recraft = read('app/(main)/admin/library/recraft-actions.ts')
const importer = read('lib/importer/materialize.ts')

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}

// ── 1. Checksum dedupe ──────────────────────────────────────────────────────────────────────────
need(/export function sha256Hex/.test(ingest), 'ingest.ts exports no sha256Hex')
need(
  /sha256:\s*sha256Hex\(bytes\)/.test(ingest),
  'ingest hashes something other than the post-strip bytes, so dedupe would not compare what is stored',
)
need(/export async function findLibraryAssetBySha256/.test(store), 'store.ts has no sha256 dedupe lookup')
need(
  /\.eq\('space_id'[\s\S]{0,200}\.eq\('sha256'/.test(store),
  'the dedupe lookup is not scoped to (space_id, sha256) — the pair library_assets_sha256_idx indexes',
)
for (const [name, src] of [
  ['the Loom picker', picker],
  ['the page editor', editorUpload],
  ['the email studio', emailUpload],
  ['the Loom Studio', studioUpload],
]) {
  need(/findLibraryAssetBySha256/.test(src), `${name} upload does not dedupe on checksum`)
  need(/ingestImageBytes/.test(src), `${name} upload does not run ingest`)
}

// ── 2. EXIF strip, orientation preserved ────────────────────────────────────────────────────────
need(/export function stripJpegMetadata/.test(ingest), 'ingest.ts has no JPEG metadata strip')
need(
  /export function buildOrientationApp1/.test(ingest) && /buildOrientationApp1\(orientation\)/.test(ingest),
  'the strip does not re-emit an orientation-only APP1 — every rotated phone photo would render sideways',
)
need(/0xed/.test(ingest), 'the strip ignores APP13 (Photoshop/IPTC)')
need(/ICC_PROFILE/.test(ingest), 'the strip does not name ICC_PROFILE, so it cannot be deliberately keeping it')

// ── 3. Dimensions, colours, blurhash — and where the pixels are decoded ─────────────────────────
need(/export function readImageDimensions/.test(ingest), 'ingest.ts reads no image dimensions')
need(/export function encodeBlurhash/.test(blurhash), 'no blurhash encoder')
need(/export function dominantColors/.test(describe), 'no dominant-colour extraction')
need(/export function readImageDescriptor/.test(describe), 'nothing validates the descriptor a browser posts')
need(/isValidBlurhash/.test(describe), 'the posted blurhash is written without structural validation')
need(
  /blurhash:\s*input\.blurhash/.test(store) && /colors:\s*\[\.\.\.input\.colors\]/.test(store),
  'store.ts does not write blurhash + colors',
)
need(/orig_width:\s*input\.origWidth/.test(store), 'store.ts does not write orig_width')
// THE BUDGET PROPERTY (docs/DEPLOY-SAFETY.md): the server half of ingest reaches the Loom picker,
// the page editor, the importer and the email studio. A decoder here multiplies across the route
// table, which is the 2026-08-11 ENOSPC shape. sharp must never appear in this seam.
for (const [name, src] of [
  ['lib/library/ingest.ts', ingest],
  ['lib/library/image-describe.ts', describe],
  ['lib/library/blurhash.ts', blurhash],
  ['lib/library/search-rank.ts', rank],
]) {
  need(!/from ['"]sharp['"]|require\(['"]sharp['"]\)|from ['"]next\/og['"]/.test(src), `${name} pulls in a rasteriser`)
}

// ── 4. FTS-ranked + trigram search ──────────────────────────────────────────────────────────────
need(/textSearch\('search_tsv'/.test(store), 'search never reaches the generated search_tsv column')
need(/websearch/.test(store), 'the FTS arm does not use websearch_to_tsquery parsing')
need(/rankLibraryMatches/.test(store), 'search results are not ranked')
need(/export function trigramSimilarity/.test(rank), 'ranking has no trigram similarity, so it cannot survive a typo')
need(
  !/FTS ranking \+ trigram is a follow-up/.test(store),
  "store.ts still claims FTS is 'a follow-up, D7' — the stale comment BUILD-LIST contradicted",
)

// ── The chokepoint, and the renditions ruling (HYG-017) ─────────────────────────────────────────
need(
  /insertSpaceLibraryImage\(/.test(studioUpload),
  'the Loom Studio upload still bypasses insertSpaceLibraryImage',
)
need(
  !/from\('library_assets'\)\s*\.insert/.test(studioUpload),
  'the Loom Studio upload still writes library_assets directly',
)
need(/sha256:\s*ingested\.sha256/.test(recraft), 'generated Recraft assets carry no checksum')
need(!/bytes:\s*0\b/.test(importer), "the importer still claims bytes: 0 rather than an honest NULL")
for (const [name, src] of [
  ['lib/library/ingest.ts', ingest],
  ['lib/library/store.ts', store],
]) {
  need(!/library_renditions/.test(src), `${name} references library_renditions, a table dropped in 20260925000000`)
}

if (bad.length) {
  console.error(bad.map((b) => `  ✗ ${b}`).join('\n'))
  process.exit(1)
}
process.exit(0)
