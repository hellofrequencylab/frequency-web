import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
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
// WHAT IT DOES NOT COVER, said plainly rather than implied: the page BODY only. The shared header,
// footer and rails are not in the document, `/discover` is a coded route with no template, and the
// four app-shell surfaces are behind auth. Those still need a human to notice. This closes the
// template-served half, which is fifteen of the sixteen public baseline sets.

const FINGERPRINTS = join(process.cwd(), 'test/e2e/template-fingerprints.json')
const SNAPSHOT_DIR = join(process.cwd(), 'test/e2e/__screenshots__/visual.spec.ts')

interface Entry {
  fingerprint: string
  capturedIn: string
}
interface File {
  _comment: string[]
  surfaces: Record<string, Entry>
}

/** The render input a baseline depicts, folded to one stable string. */
export function fingerprint(doc: Data): string {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 16)
}

let file: File = JSON.parse(readFileSync(FINGERPRINTS, 'utf8'))

/** Every slug that owns a committed baseline set AND is served by a template. */
function baselinedSlugs(): string[] {
  const seen = new Set<string>()
  for (const name of readdirSync(SNAPSHOT_DIR)) {
    const slug = name.replace(/--.*$/, '')
    if (name.endsWith('.png') && getTemplate(slug)) seen.add(slug)
  }
  return [...seen].sort()
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
})
