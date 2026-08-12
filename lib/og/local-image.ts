import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CoverPlaceholderPath } from '@/lib/spaces/cover-placeholder'

// ── The build-time images an OG card draws. READ FROM DISK WITH LITERAL PATHS. ────────────────
//
// Satori cannot resolve a relative URL, so a card that shows a site asset has to be handed the
// BYTES as a data: URI. Four modules used to do that through a private helper of their own — the
// two entity cards, the shared claim card, and the event claim card:
//
//     async function localImage(relPath: string) {
//       const data = await readFile(join(process.cwd(), 'public', relPath))   // 🔴
//       ...
//     }
//
// 🔴 THAT ONE PARAMETER COST 651 MB OF DEPLOY DISK. @vercel/nft cannot resolve a path assembled
// from a variable, so it falls back to globbing the deepest prefix it CAN resolve — here the whole
// of `public/` — into every function whose graph reaches the module. Measured off the real `.next`
// trace before this file existed: **62 functions each carrying all 69 files of `public/`, 12.25 MB
// apiece, 759.5 MB.** Every settings page under `/spaces/[slug]` shipped the maplibre browser
// bundle, the PWA icon set and 43 stock photographs, because the segment's share card sits above
// it and metadata is inherited downward. Same failure as ADR-1006/1007 one layer down
// (`lib/og/load-nunito.ts`, 333 MB of fonts) and ADR-1004 one layer up
// (`join(process.cwd(), ...rubricPath)`, which swept the repo ROOT into ~300 functions).
//
// It is worth being precise about why the CALLERS could not fix this. Three of the four passed a
// string literal at least once, and it changed nothing: nft reads the emitted chunk, not the call
// sites, so a `readFile` whose argument is a parameter is unresolvable however that parameter is
// filled. The READ itself has to be literal, which means one named reader per file and no helper
// standing in front of them. Fixing three of the four would also have bought nothing — the fourth
// module's glob covers the same `public/` prefix, so the directory would have shipped anyway.
//
// ⚠️ WHAT NOT TO TRY, recorded in ADR-1008 after somebody spent the afternoon: `turbopackIgnore`
// does nothing (nft reads the specifier out of the chunk regardless); splitting the string is
// constant-folded back by the minifier; a broad tracing glob panics Turbopack in Rust. No config
// substitutes for a literal read.
//
// ⚠️ REINTRODUCING A `read(name)` HELPER — or hoisting 'public/images/site' into a shared const and
// building the path from it — SILENTLY RESTORES THE GLOB. Nothing fails, no test goes red on its
// own, the deploy just gets ~650 MB heavier. `scripts/build-fanout.test.ts` is the thing that
// notices, which is the only reason this stays visible (DEPLOY-SAFETY rule 6).
//
// The set is CLOSED, and the compiler holds it closed: `COVER_READERS` is keyed by
// `CoverPlaceholderPath`, the union of `lib/spaces/cover-placeholder.ts`'s own array. Adding a
// placeholder there without adding its reader here is a type error rather than a 500 on a share
// card, which is the whole reason these two files are allowed to know about each other.

/** Base64 a JPEG for Satori.
 *
 *  Deliberately NOT memoised, unlike `loadNunito`. The helper this replaces was not either, so the
 *  change moves the trace and nothing else — and a warm lambda would otherwise pin ~2.4 MB of
 *  base64 for photos a given card renders once. The fonts are cached because every card needs the
 *  same two faces; a cover is one entity's, drawn once. */
const jpegDataUrl = (data: Buffer) => `data:image/jpeg;base64,${data.toString('base64')}`

// ── ONE LITERAL READ PER FILE, AND IT HAS TO STAY THAT WAY ───────────────────────────────────
const readOutdoorGroup = () =>
  readFile(join(process.cwd(), 'public/images/site', 'outdoor-group.jpg'))
const readSunset = () => readFile(join(process.cwd(), 'public/images/site', 'sunset.jpg'))
const readLabLounge = () => readFile(join(process.cwd(), 'public/images/site', 'lab-lounge.jpg'))
const readNatureViewingSunset = () =>
  readFile(join(process.cwd(), 'public/images/site', 'nature-viewing-sunset.jpg'))
const readCommunityDinner = () =>
  readFile(join(process.cwd(), 'public/images/site', 'community-dinner.jpg'))
const readMeditationCircleOutdoor = () =>
  readFile(join(process.cwd(), 'public/images/site', 'meditation-circle-outdoor.jpg'))
const readSiteMark = () =>
  readFile(join(process.cwd(), 'public/images', 'Frequency-Logo-Round-Icon-white.png'))

/** Every path `coverPlaceholderFor` can return, and nothing else. A missing key is a type error;
 *  so is a key that is not a placeholder. */
const COVER_READERS: Record<CoverPlaceholderPath, () => Promise<Buffer>> = {
  '/images/site/outdoor-group.jpg': readOutdoorGroup,
  '/images/site/sunset.jpg': readSunset,
  '/images/site/lab-lounge.jpg': readLabLounge,
  '/images/site/nature-viewing-sunset.jpg': readNatureViewingSunset,
  '/images/site/community-dinner.jpg': readCommunityDinner,
  '/images/site/meditation-circle-outdoor.jpg': readMeditationCircleOutdoor,
}

/**
 * The deterministic site cover a card falls back to when the entity uploaded none, inlined for
 * Satori. Pass the value `coverPlaceholderFor()` returned: it is the SAME photo the on-page hero
 * shows, so a shared link previews the page it points at.
 *
 * ⚠️ This CAN reject, exactly as the `readFile` it replaces did. An OG route that throws returns a
 * 500 and the previewer falls back to a text card, which is recoverable and honest. Swallowing the
 * error would hand Satori a broken `src` and produce a card with a blank background — a worse
 * outcome that nothing would ever report.
 */
export async function coverPlaceholderDataUrl(path: CoverPlaceholderPath): Promise<string> {
  return jpegDataUrl(await COVER_READERS[path]())
}

/** The Frequency mark drawn top-right on every entity card, inlined for Satori. */
export async function siteMarkDataUrl(): Promise<string> {
  const data = await readSiteMark()
  return `data:image/png;base64,${data.toString('base64')}`
}
