import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getTemplate } from '@/lib/page-editor/templates'
import type { Data } from '@/lib/page-editor/types'

// ── Are the committed @visual baselines still a picture of the current source? ────────────────
//
// LIVE-040 asked for this arm and named why the old one could not answer. The old check compared
// the TEMPLATE FILE's last-commit date against its PNGs' last-commit date, which fails twice over:
//
//   1. It needs git history, and `actions/checkout@v7` clones at depth 1, where every file's last
//      commit is HEAD. So it exited 79 (indeterminate) in every checkout it had ever run in, and
//      was first evaluated on 2026-09-06 only because an unrelated task ran `git fetch --unshallow`.
//   2. Worse, a file's commit date is a PROXY for its rendered output, and the two came apart.
//      #2348 changed BETA_CTA_LABEL in lib/site.ts ("Start a Circle" -> "Find your people"). That
//      is a visible button label on fifteen template-served pages, so it moved pixels on all of
//      them. It touched the-community.ts (a COMMENT), so the date check called that one stale --
//      for the wrong reason -- and called /the-lab CLEAN while /the-lab's own primary button had
//      changed words. A proxy that is right by accident is the shape-not-truth failure this repo
//      keeps naming.
//
// So this measures the CONSEQUENCE instead: a hash of the resolved document `getTemplate(slug)`
// returns. Every template is a static literal, so the constants it imports are already folded in
// -- a change three modules away lands in the hash exactly when it lands on the page, and a
// comment edit does not. It reads only files, so it is evaluable in a shallow clone, which means
// it runs on every PR rather than never.
//
// ── 🔴 AND A FINGERPRINT OF A TEMPLATE IS WORTHLESS WHERE THE TEMPLATE IS NOT WHAT RENDERS ────
// Found 2026-09-15 (LIVE-340, HYG-095). EVERY page this file covers resolves
// `isWellFormed(published) ? published : isWellFormed(template) ? template : EMPTY` -- the
// template is the FALLBACK on all fifteen, not the source. So "template-served" is not a property
// of the route at all; it is the property "no published document shadows this slug", and that is a
// row in the `pages` table rather than anything in this tree.
//
// For fourteen of the fifteen it is true and the fingerprint means what it says. For `home` it is
// FALSE and has been since OWN-043: `/` serves an owner-published document, so `getTemplate('home')`
// is a branch production never takes. The cost was measured rather than argued -- on 2026-09-15 a
// migration (LIVE-252) rewrote the published `home` document, 13 blocks to 14 with a new <h1>, and
// THIS FILE STAYED GREEN, because the template it hashes did not move. The gate whose whole job is
// "the body moved, so the baselines are stale" slept through the largest front-door change in the
// program, and `pr-compare`'s blocking public tier went red on every branch at once instead.
//
// So the shadowed slugs are EXCLUDED, and the exclusion is READ, never typed: `scripts/stored-links.json`
// is a committed census of the stored page documents in production, and it records the published
// store's document count plus a block map per published document carrying its `slug`. That file is
// itself guarded (`scripts/check-stored-links.mjs` recomputes its counts and requires `capturedAt`
// to be the date of its newest recapture entry), it is plain JSON, and reading it costs no database
// -- so this gate stays evaluable in a shallow clone on every PR, which was the whole point of it.
// Publishing a second page therefore drops that slug out of coverage automatically, and the count
// cross-check below fails if the census ever disagrees with itself about how many there are.
//
// WHAT IT DOES NOT COVER, said plainly rather than implied: the page BODY only, and only where a
// template is what renders it. The shared header, footer and rails are not in the document,
// `/discover` is a coded route with no template, the four app-shell surfaces are behind auth, and
// `/` is a DATABASE ROW that nothing in this tree can hash. Those still need a human to notice --
// for `/` the reader is `scripts/stored-links.json`, re-captured whenever the document moves.
// This closes the template-served half, which is fourteen of the sixteen public baseline sets.

const FINGERPRINTS = join(process.cwd(), 'test/e2e/template-fingerprints.json')
const SNAPSHOT_DIR = join(process.cwd(), 'test/e2e/__screenshots__/visual.spec.ts')
const STORED_LINKS = join(process.cwd(), 'scripts/stored-links.json')

interface Entry {
  fingerprint: string
  capturedIn: string
}
interface File {
  _comment: string[]
  surfaces: Record<string, Entry>
}

/** Read a file the gate depends on, failing with the PATH rather than a bare ENOENT. */
function readOrFail(path: string): string {
  if (!existsSync(path)) throw new Error(`${path} is missing, so this gate cannot be evaluated`)
  return readFileSync(path, 'utf8')
}

/** The render input a baseline depicts, folded to one stable string. */
export function fingerprint(doc: Data): string {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 16)
}

// ── The census reader, split so the control below can drive it without touching the file ──────
type Census = Record<string, unknown>

/** Slugs the census records as carrying a PUBLISHED document, which therefore shadows a template. */
export function publishedSlugsIn(census: Census): string[] {
  return Object.values(census)
    .filter(
      (v): v is { slug: string } =>
        !!v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof (v as { slug?: unknown }).slug === 'string',
    )
    .map((m) => m.slug)
    .sort()
}

/** What the census's own `pages.published_data` row says the document count is. */
export function publishedCountIn(census: Census): number {
  const stores = census.stores
  if (!Array.isArray(stores)) throw new Error(`${STORED_LINKS} has no \`stores\` array; the census shape moved`)
  const store = stores.find(
    (s) => !!s && typeof s === 'object' && (s as { store?: unknown }).store === 'pages.published_data',
  ) as { documents?: unknown } | undefined
  if (!store) throw new Error(`${STORED_LINKS} has no pages.published_data store; the census shape moved`)
  if (typeof store.documents !== 'number')
    throw new Error(`${STORED_LINKS}'s pages.published_data store has no numeric \`documents\``)
  return store.documents
}

function census(): Census {
  return JSON.parse(readOrFail(STORED_LINKS)) as Census
}

let file: File = JSON.parse(readOrFail(FINGERPRINTS))

/**
 * Every slug that owns a committed baseline set AND is actually rendered from its template --
 * i.e. has one and is not shadowed by a published document (see the 🔴 block above).
 */
function baselinedSlugs(): string[] {
  const shadowed = new Set(publishedSlugsIn(census()))
  const seen = new Set<string>()
  for (const name of readdirSync(SNAPSHOT_DIR)) {
    const slug = name.replace(/--.*$/, '')
    if (name.endsWith('.png') && getTemplate(slug) && !shadowed.has(slug)) seen.add(slug)
  }
  return [...seen].sort()
}

/** Does this slug own any committed baseline PNG at all? */
function hasBaselines(slug: string): boolean {
  return readdirSync(SNAPSHOT_DIR).some((n) => n.startsWith(`${slug}--`) && n.endsWith('.png'))
}

// `pnpm gen:visual-fingerprints` -- re-stamps the file from the current source. It belongs in the
// SAME commit as a capture, and only when that capture photographed THIS source: the workflow
// captures against a `base_url`, so re-stamping after a run pointed at production while the branch
// carries template edits would record a fingerprint no PNG has ever shown.
if (process.env.UPDATE_TEMPLATE_FINGERPRINTS === '1') {
  const next: File = { _comment: file._comment, surfaces: {} }
  for (const slug of baselinedSlugs()) {
    next.surfaces[slug] = {
      fingerprint: fingerprint(getTemplate(slug) as Data),
      capturedIn: process.env.GITHUB_SHA?.slice(0, 9) ?? 'local',
    }
  }
  writeFileSync(FINGERPRINTS, JSON.stringify(next, null, 2) + '\n')
  // Compare against what was just written, so a regeneration EXITS 0 and the workflow step that
  // calls it does not read as a failed capture. The assertions below still run: they are what
  // proves the file it wrote is internally consistent, rather than merely written.
  file = next
}

const slugs = Object.keys(file.surfaces).sort()

describe('the committed visual baselines still depict the current templates', () => {
  it('covers every template-served surface that owns a baseline set', () => {
    expect(slugs).toEqual(baselinedSlugs())
  })

  it.each(slugs)('%s renders what its baselines were captured from', (slug) => {
    const doc = getTemplate(slug)
    expect(doc, `${slug} has a baseline set and a fingerprint but no template`).toBeTruthy()
    expect(
      fingerprint(doc as Data),
      `/${slug}: the template renders different words than its committed baselines show. ` +
        `Recapture them (e2e-manual.yml, update_baselines) and re-stamp this file with ` +
        `\`pnpm gen:visual-fingerprints\` in the same commit. Never edit the fingerprint alone.`,
    ).toBe(file.surfaces[slug].fingerprint)
  })
})

describe('a slug whose body is a database row is not fingerprinted', () => {
  it('reads the shadowed set from the census, and the census agrees with itself', () => {
    const c = census()
    expect(
      publishedSlugsIn(c).length,
      `scripts/stored-links.json records ${publishedCountIn(c)} published document(s) in ` +
        `pages.published_data but carries ${publishedSlugsIn(c).length} block map(s) with a slug. ` +
        `Re-capture it (its own howToRecapture) so the two halves agree; until they do, this gate ` +
        `cannot say which slugs a template still renders.`,
    ).toBe(publishedCountIn(c))
  })

  it('excludes /, and the exclusion is a real one rather than a no-op', () => {
    // All three have to hold, or "home is excluded" is true for an uninteresting reason and this
    // gate would go on passing after the mechanism stopped working.
    expect(publishedSlugsIn(census())).toContain('home')
    expect(getTemplate('home'), 'home has no template, so there is nothing a fingerprint would hash').toBeTruthy()
    expect(hasBaselines('home'), 'home owns no baseline PNGs, so it was never in scope to exclude').toBe(true)
    expect(
      slugs,
      'home is shadowed by a published document, so a fingerprint of its template is a hash of a ' +
        'branch production never takes -- exactly the state that let LIVE-252 move the front door ' +
        'with this gate green.',
    ).not.toContain('home')
  })
})

describe('the detector itself', () => {
  // The control this file exists to have. LIVE-040's predecessor passed on the string 'Accordion'
  // appearing in a template, which an Accordion with zero items also satisfies -- a probe that
  // cannot fail is the thing being fixed here, so this one carries proof that it can.
  it('notices a one-word change three modules away', () => {
    const doc = getTemplate('the-lab') as Data
    const moved = JSON.parse(JSON.stringify(doc)) as Data
    const cta = moved.content.find((b) => 'ctaPrimaryLabel' in (b.props as object))
    expect(cta, 'the-lab no longer carries a primary CTA label to mutate').toBeTruthy()
    ;(cta!.props as Record<string, unknown>).ctaPrimaryLabel = 'Start a Circle'
    expect(fingerprint(moved)).not.toBe(fingerprint(doc))
  })

  it('is stable across runs, so a green gate is not luck', () => {
    const doc = getTemplate('the-quest') as Data
    expect(fingerprint(doc)).toBe(fingerprint(doc))
  })

  // ── The controls for the exclusion, driven on synthetic censuses so they cannot pass by ───────
  // accident of today's production state. Publishing a second page is the realistic way this
  // mechanism goes wrong, and it must go wrong LOUDLY rather than by quietly dropping coverage.
  it('sees a second published page, instead of only ever knowing about home', () => {
    const c = { ...census() } as Census
    ;(c as Record<string, unknown>).pricing = { slug: 'pricing', publishedAt: '2026-09-16' }
    expect(publishedSlugsIn(c)).toEqual(['home', 'pricing'])
  })

  it('fails when the census carries a published map its own store count does not admit', () => {
    const c = { ...census() } as Census
    ;(c as Record<string, unknown>).pricing = { slug: 'pricing', publishedAt: '2026-09-16' }
    // The store still says 1 document, so the two halves now disagree and the reader must not
    // silently prefer either one.
    expect(publishedSlugsIn(c).length).not.toBe(publishedCountIn(c))
  })

  it('refuses a census whose shape moved, rather than reading zero shadowed slugs', () => {
    // The dangerous failure is the VACUOUS one: a census this reader cannot parse must not come
    // back as "nothing is shadowed", because that silently restores the dead home fingerprint.
    expect(() => publishedCountIn({} as Census)).toThrow(/stores/)
    expect(() => publishedCountIn({ stores: [{ store: 'pages.data', documents: 4 }] } as Census)).toThrow(
      /pages\.published_data/,
    )
    expect(() => publishedCountIn({ stores: [{ store: 'pages.published_data' }] } as Census)).toThrow(/documents/)
  })
})
