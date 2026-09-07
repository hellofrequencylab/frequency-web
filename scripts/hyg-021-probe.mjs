#!/usr/bin/env node
// HYG-021 probe — "Server-generated Loom assets carry no blurhash, and only a decode can fix it".
//
// Measures the CONSEQUENCE, never the row's words. The row was closed by OPTION (b) of its own
// list (ADR-1254): the two generation paths that HAVE a client describe the image one round-trip
// after the generation returns, in the same browser that is already looking at it. So the things
// that would be false if that were undone:
//
//   1. THE SHARED PATH EXISTS AND IS ONE. `describeImageUrl` (decode a stored object) and
//      `describeGeneratedAsset` (decode it, post it) — the two surfaces must not grow their own.
//   2. THE WRITE ONLY EVER FILLS A HOLE. The backfill carries an `.is(<column>, null)` guard per
//      column, and the action re-validates what the client posted through `readImageDescriptor`.
//   3. BOTH GENERATION PATHS REACH IT. The Loom Studio (Recraft) hands its client the asset ids it
//      just wrote and describes them; the Spark's cover offer describes the cover it just applied.
//   4. 🔴 THE BUDGET PROPERTY. No module in this seam imports a rasteriser. A server-side decode
//      means `sharp`, and this seam fans out across the route table — the 2026-08-11 ENOSPC shape
//      (docs/DEPLOY-SAFETY.md). The whole reason the work is in the browser is this line.
//
// Runs in-process, no test runner (LIVE-034). Exit 0 = done, 1 = not done, 79 = could not look.

import { readFileSync, existsSync } from 'node:fs'

const read = (p) => {
  if (!existsSync(p)) {
    console.error(`could not look: ${p} is missing`)
    process.exit(79)
  }
  return readFileSync(p, 'utf8')
}

const describe = read('lib/library/image-describe.ts')
const shared = read('lib/library/describe-generated.ts')
const action = read('lib/library/describe-actions.ts')
const store = read('lib/library/store.ts')
const recraftActions = read('app/(main)/admin/library/recraft-actions.ts')
const recraftClient = read('app/(main)/admin/library/create-studio.tsx')
const coverActions = read('lib/loom/cover-actions.ts')
const coverClient = read('components/studio/spark/use-spark-offers.ts')

const bad = []
const need = (cond, message) => {
  if (!cond) bad.push(message)
}

// ── 1. One shared client path ───────────────────────────────────────────────────────────────────
need(/export async function describeImageUrl/.test(describe), 'nothing can describe a STORED image by url')
need(
  /describeImage\(new File\(/.test(describe),
  'describeImageUrl does not reuse describeImage, so a generated asset would be described by a second decoder',
)
need(/export async function describeGeneratedAsset/.test(shared), 'no shared describe-a-generated-asset path')
need(
  /describeImageUrl\(/.test(shared) && /describeLibraryAssetAction\(/.test(shared),
  'the shared path does not decode-then-post, so it cannot be what the surfaces call',
)

// ── 2. The write fills a hole and nothing else ─────────────────────────────────────────────────
need(
  /export async function backfillLibraryAssetDescriptor/.test(store),
  'store.ts has no guarded descriptor backfill',
)
need(
  /update\(\{ blurhash: descriptor\.blurhash \}\)[\s\S]{0,120}\.is\('blurhash', null\)/.test(store),
  'the blurhash backfill is not guarded by .is(blurhash, null) — a client could repaint a described asset',
)
need(
  /update\(\{ colors: \[\.\.\.descriptor\.colors\] \}\)[\s\S]{0,120}\.is\('colors', null\)/.test(store),
  'the colors backfill is not guarded by .is(colors, null)',
)
need(/export async function describeLibraryAssetAction/.test(action), 'no server action accepts a descriptor')
need(
  /readImageDescriptor\(formData\)/.test(action),
  'the action stores what a client posted without re-validating it through readImageDescriptor',
)
need(
  /backfillLibraryAssetDescriptor\(/.test(action) && !/from\('library_assets'\)/.test(action),
  'the action writes library_assets itself instead of going through the guarded backfill',
)
need(
  /getCallerProfile\(\)/.test(action) && /canEditProfile/.test(action) && /isJanitor\(/.test(action),
  'the action is not authorized the way the surrounding Loom writes are',
)

// ── 3. Both generation paths with a client reach it ────────────────────────────────────────────
need(
  /assets: GeneratedAsset\[\]/.test(recraftActions) && /assets\.push\(\{ id: String\(id\), url: stored\.url \}\)/.test(recraftActions),
  'the Recraft generation does not hand its client the assets it wrote, so nothing can describe them',
)
need(
  /describeGeneratedAssets\(res\.assets\)/.test(recraftClient),
  'the Loom Studio does not describe what it just generated',
)
need(
  /assetId/.test(coverActions) && /describeGeneratedAsset\(res\.data\.assetId, res\.data\.url\)/.test(coverClient),
  'the Spark cover offer does not describe the cover it just applied',
)

// ── 4. The budget property: no rasteriser anywhere in this seam ────────────────────────────────
const RASTERISER = /from ['"]sharp['"]|require\(['"]sharp['"]\)|from ['"]next\/og['"]/
for (const [name, src] of [
  ['lib/library/image-describe.ts', describe],
  ['lib/library/describe-generated.ts', shared],
  ['lib/library/describe-actions.ts', action],
  ['lib/library/store.ts', store],
  ['app/(main)/admin/library/recraft-actions.ts', recraftActions],
  ['lib/loom/cover-actions.ts', coverActions],
]) {
  need(!RASTERISER.test(src), `${name} pulls in a rasteriser — the fan-out this row exists to avoid`)
}

if (bad.length) {
  console.error(bad.map((b) => `  ✗ ${b}`).join('\n'))
  process.exit(1)
}
process.exit(0)
