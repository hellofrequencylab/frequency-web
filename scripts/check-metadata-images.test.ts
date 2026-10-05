import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ── DECLARING `images: undefined` OWNS THE KEY, AND OWNING IT SUPPRESSES THE SHARE CARD ──────────
//
// 🔴 THE DEFECT (LIVE-141). Next merges route metadata over the FILE CONVENTIONS
// (`opengraph-image.tsx` / `twitter-image.tsx`), and `mergeStaticMetadata` in
// node_modules/next/dist/lib/metadata/resolve-metadata.js applies the file-convention image only
// when the source does NOT `hasOwnProperty('images')`. A ternary written
//
//     images: cover ? [cover] : undefined
//
// declares the key on EVERY branch. So on the no-image branch the key exists, holds `undefined`,
// and the designed card is thrown away — the page falls back to the ROOT site card.
//
// Both sites found were bitterly ironic: each sits directly above a comment explaining that the
// block exists to stop shares reading "Frequency, the Community Collective" with the generic card.
// The `: undefined` reintroduced exactly that, for exactly the rows with no image of their own:
//   · app/spotlight/[handle]/page.tsx      — suppressed its OWN opengraph-image.tsx
//   · .../spaces/[slug]/podcasts/[showSlug]/page.tsx — suppressed the Space card it INHERITS from
//     an ancestor segment, which is easier to miss because the file convention is not in its folder.
//
// THE FIX IS THE SPREAD: `...(cover ? { images: [cover] } : {})` — the key is absent when there is
// no image, so the file convention survives. That idiom was already in use elsewhere in the repo
// (journeys, store, circles, practices); these two routes simply did not use it.
//
// ⚪ ONE NUANCE, kept so nobody "simplifies" it away: at resolve-metadata.js:627 postProcessMetadata
// uses `hasOwnProperty('images') && twitter.images`, so an explicitly-undefined `twitter.images`
// still INHERITS from `openGraph.images`. Only the twitter-image FILE convention is suppressed
// there. The openGraph half is the one that always mattered.

const ROOT = path.join(import.meta.dirname, '..')

/**
 * Every `.ts`/`.tsx` file under `abs`, depth-first.
 *
 * ⚪ `withFileTypes` is not a style preference: it is what makes this walk free of a check-then-use
 * window. Reading `statSync(full).isDirectory()` and THEN opening `full` asks the filesystem about
 * the path twice, and CodeQL flags the gap (js/file-system-race). One `readdirSync` carries the
 * entry type back with the name, so there is no second question to answer differently. Both walks
 * in this file now share this one, which is also why the corpus-floor test below can no longer
 * drift out of step with the detector it is meant to be the floor for.
 */
function tsFilesUnder(abs: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full)
    }
  }
  walk(abs)
  return out
}

/** Files under `dir` that declare a `generateMetadata`, with their source. */
function metadataRoutes(dir: string): Array<{ full: string; src: string }> {
  return tsFilesUnder(path.join(ROOT, dir))
    .map((full) => ({ full, src: readFileSync(full, 'utf8') }))
    .filter(({ src }) => src.includes('generateMetadata'))
}

/** Every `images:` ternary whose no-image branch declares the key anyway. */
export function suppressedImageKeys(dir: string): string[] {
  const hits: string[] = []
  for (const { full, src } of metadataRoutes(dir)) {
    for (const m of src.matchAll(/images:\s*[^\n]*\?[^\n]*:\s*(undefined|null)/g)) {
      hits.push(`${path.relative(ROOT, full)} :: ${m[0].trim()}`)
    }
  }
  return hits
}

describe('a route never owns `images` on the branch that has no image', () => {
  it('no generateMetadata under app/ falls back to undefined or null', () => {
    expect(suppressedImageKeys('app')).toEqual([])
  })

  it('the detector actually fires (positive control)', () => {
    // A guard nobody has watched fail is a guard nobody has tested. Rebuild the exact shape the two
    // real sites had and confirm the regex catches BOTH the array and the object forms — the first
    // version of LIVE-141's probe used `[^,}]`, which could not match the object form and would
    // have closed the row with its primary site untouched.
    const re = /images:\s*[^\n]*\?[^\n]*:\s*(undefined|null)/g
    expect('      images: coverUrl ? [coverUrl] : undefined,'.match(re)).toHaveLength(1)
    expect('      images: coverUrl ? [{ url: coverUrl }] : undefined,'.match(re)).toHaveLength(1)
    expect('      images: x ? [x] : null,'.match(re)).toHaveLength(1)
    // The spread form is what correctness looks like, and must NOT match.
    expect('      ...(coverUrl ? { images: [coverUrl] } : {}),'.match(re)).toBeNull()
  })

  it('walks a real corpus, so an empty glob cannot pass as compliance', () => {
    // The floor: app/ holds many generateMetadata routes. If this drops to a handful, the walk
    // broke and the green above means nothing.
    expect(metadataRoutes('app').length).toBeGreaterThan(40)
  })
})

// ── A PUBLIC PAGE WITH NO SEGMENT CARD MUST CARRY THE ROOT IMAGE ITSELF (SCAN-798) ────────────────
//
// The mirror defect. `app/opengraph-image.jpg` attaches only to the ROOT layout, and mergeMetadata
// replaces a child segment's `openGraph` wholesale. So a page below app/ that declares openGraph
// WITHOUT `images`, in a folder chain with no opengraph-image file of its own, ships no og:image and
// shares as a bare text link. Those pages spread ROOT_OG_IMAGES (lib/site.ts). Pages that have or
// inherit a segment card must NOT (that is the LIVE-141 half above), so the two tests are one rule
// read from both sides: own `images` exactly when no file convention would supply them.

const OG_CARD = /^opengraph-image\./

/** The `openGraph: {` object literals in `src`, by brace matching. */
function openGraphBlocks(src: string): string[] {
  const blocks: string[] = []
  for (const m of src.matchAll(/openGraph\s*:\s*\{/g)) {
    const start = src.indexOf('{', m.index)
    let depth = 0
    for (let k = start; k < src.length; k++) {
      if (src[k] === '{') depth++
      else if (src[k] === '}' && --depth === 0) {
        blocks.push(src.slice(start, k + 1))
        break
      }
    }
  }
  return blocks
}

/** Whether a segment card sits in `file`'s own folder or any ancestor folder under app/ (the root
 *  app/ folder included: a file directly in app/ shares the root card's segment). */
function hasSegmentCard(file: string): boolean {
  const appRoot = path.join(ROOT, 'app')
  const own = path.dirname(file)
  for (let d = own; d.startsWith(appRoot); d = path.dirname(d)) {
    // The root card counts only for the root segment's own files, never for a child segment.
    if (d === appRoot && own !== appRoot) break
    if (readdirSync(d).some((e) => OG_CARD.test(e))) return true
    if (d === appRoot) break
  }
  return false
}

/** Pages and layouts under `dir` whose openGraph literal has no `images` and no segment card. */
export function cardlessOpenGraph(dir: string): string[] {
  const hits: string[] = []
  for (const full of tsFilesUnder(path.join(ROOT, dir))) {
    if (!/[\\/](page|layout)\.tsx?$/.test(full) || hasSegmentCard(full)) continue
    const src = readFileSync(full, 'utf8')
    for (const block of openGraphBlocks(src)) {
      if (!/\bimages\s*:/.test(block)) hits.push(path.relative(ROOT, full))
    }
  }
  return hits
}

describe('a page with no segment card carries the root share image itself', () => {
  it('no openGraph literal under app/ lacks images where no opengraph-image file would supply them', () => {
    expect(cardlessOpenGraph('app')).toEqual([])
  })

  it('the brace matcher reads a real block (positive control)', () => {
    const src = "openGraph: {\n  ...OG_SITE,\n  title: t,\n  nested: { a: 1 },\n},\ntwitter: { card: 'summary' }"
    expect(openGraphBlocks(src)).toHaveLength(1)
    expect(openGraphBlocks(src)[0]).toContain('nested: { a: 1 }')
    expect(/\bimages\s*:/.test(openGraphBlocks(src)[0])).toBe(false)
  })

  it('the root card is recognised as a segment card for files directly in app/', () => {
    expect(hasSegmentCard(path.join(ROOT, 'app', 'page.tsx'))).toBe(true)
    expect(hasSegmentCard(path.join(ROOT, 'app', 'terms', 'page.tsx'))).toBe(false)
  })
})
