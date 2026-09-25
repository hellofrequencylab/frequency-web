import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  RAIL_ONLY_BLOCK_IDS,
  blockEditsAllFieldsInRail,
  fieldsForBlock,
  sanitizeBlockContent,
  decodeLegacyEntities,
} from './block-content'

// EVERY FIELD A BLOCK DECLARES MUST BE REACHABLE BY SOMEBODY.
//
// A Space page splits block authoring in two: TEXT is edited on the page (inline slots on the canvas) and
// SETTINGS in the rail. The rail therefore drops text/textarea when the canvas is in play — correct, and
// exactly wrong for a block the canvas renders as a READ-ONLY PREVIEW, because that block has no slots to
// move the text to. It then belongs to neither half.
//
// That is what happened to `contactForm`. It was added to the canvas's structural-preview list (right: a form
// is not inline-authorable) and nothing added the matching rail exemption, so SEVEN of its nine fields —
// eyebrow, title, body, messageLabel, optInLabel, submitLabel, successMessage — could not be set from any
// surface in the app. The block shipped, the schema was complete, every existing test passed, and the only
// writer left was the AI re-seed button.
//
// Nothing pinned it, so nothing noticed. This file is that pin. It asserts the PROPERTY (no declared field is
// unreachable) rather than the membership of a list, so it keeps holding as blocks are added.

/** Read a source file with its COMMENT LINES STRIPPED. Every source-shape check below goes through this,
 *  because the first version of this file did not and one of its assertions passed against a mutant: the
 *  regex matched the identifier inside the explanatory comment above the code it was meant to be guarding.
 *  A guard that a comment can satisfy is not a guard. (Same idiom as lib/auth.viewer-read.test.ts.) */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

/** The rail's own filter, mirrored: `isStructuralField` in components/entity-blocks/block-edit-panel.tsx. */
const isStructuralField = (t: string) => t !== 'text' && t !== 'textarea'

/** What the rail actually shows for `id` while the page canvas is live, including the exemption. */
function railFields(id: string): string[] {
  const all = fieldsForBlock(id)
  const shown = blockEditsAllFieldsInRail(id) ? all : all.filter((f) => isStructuralField(f.type))
  return shown.map((f) => f.key)
}

describe('a rail-only block keeps every field in the rail', () => {
  it('has members, so the rule is not vacuously true', () => {
    expect(RAIL_ONLY_BLOCK_IDS.size).toBeGreaterThan(0)
    expect([...RAIL_ONLY_BLOCK_IDS]).toContain('contactForm')
  })

  it.each([...RAIL_ONLY_BLOCK_IDS])('%s can author all of its fields', (id) => {
    const declared = fieldsForBlock(id).map((f) => f.key)
    // The point of the whole file: declared === reachable. A block with no canvas slots must keep its copy.
    expect(railFields(id), `${id} has fields no surface can edit`).toEqual(declared)
  })

  it('leaves contactForm’s seven text fields reachable by name', () => {
    // Named explicitly because these seven are the ones that were lost, and a regression here is silent:
    // the block still renders, still saves, and simply cannot be written to.
    const shown = railFields('contactForm')
    for (const key of ['eyebrow', 'title', 'body', 'messageLabel', 'optInLabel', 'submitLabel', 'successMessage']) {
      expect(shown, `contactForm.${key} is unreachable again`).toContain(key)
    }
  })

  it('still moves text to the canvas for a block that HAS slots', () => {
    // The inverse, so the exemption cannot quietly become "every block keeps everything", which would put
    // the text in two places at once and undo the on-page authoring model.
    expect(blockEditsAllFieldsInRail('callout')).toBe(false)
    const all = fieldsForBlock('callout').map((f) => f.key)
    const rail = railFields('callout')
    expect(rail.length).toBeLessThan(all.length)
  })
})

describe('the canvas preview list and the rail exemption are ONE list', () => {
  it('space-canvas-block reads RAIL_ONLY_BLOCK_IDS rather than its own literal', () => {
    // The two halves drifting apart IS the defect. A second hand-written set in the canvas file would let
    // the next block repeat it exactly, so the shared import is the fix and this is its guard.
    const src = code('components/entity-blocks/space-canvas/space-canvas-block.tsx')
    expect(src).toMatch(/STRUCTURAL_PREVIEW_IDS[^=]*=\s*RAIL_ONLY_BLOCK_IDS/)
    expect(src).toMatch(/RAIL_ONLY_BLOCK_IDS,?\n/)
  })

  it('block-edit-panel exempts them from the structural filter', () => {
    const src = code('components/entity-blocks/block-edit-panel.tsx')
    expect(src).toMatch(/blockEditsAllFieldsInRail\(id\)/)
    expect(src).toMatch(/contentOnCanvas && !railOnly \? allFields\.filter\(isStructuralField\) : allFields/)
  })
})

describe('contactForm copy survives the round trip as characters, not entities', () => {
  // THE SECOND HALF OF THE SAME BUG, and it only became visible once the fields could be typed into.
  // `contactForm` is a CONTENT block, so sanitizeBlockContent runs its textareas through sanitizeInlineHtml,
  // which escapes `'` and `"`. Its fields are NOT in INLINE_HTML_FIELDS, so both render sites draw them as
  // PLAIN React text — and a plain render of an escaped string prints the entity verbatim.
  it('stores an apostrophe escaped, which is why the render must decode', () => {
    const out = sanitizeBlockContent('contactForm', { body: "We'd love to hear from you" })
    // Pinning the storage shape, not endorsing it: this is the fact that makes the decode load-bearing.
    expect(String(out?.body)).toContain('&#39;')
  })

  it('decodes back to the typed characters', () => {
    const out = sanitizeBlockContent('contactForm', { body: 'We’ll reply within a day, and we "mean" it' })
    const shown = decodeLegacyEntities(String(out?.body))
    expect(shown).not.toMatch(/&(?:quot|#39|amp|lt|gt);/)
    expect(shown).toContain('"mean"')
  })

  it('is a no-op on copy that carries no entities', () => {
    expect(decodeLegacyEntities('Get in touch')).toBe('Get in touch')
  })

  it('both render sites decode, so preview and live form agree', () => {
    // Matching the CALL, not the identifier. The first version of this assertion looked for the bare name
    // and passed against a mutant that had deleted the call and kept the import — an import is not a decode.
    const sites: ReadonlyArray<readonly [string, RegExp]> = [
      // The live mount: space-profile-modules.tsx hands the island its strings through one `str` helper.
      ['components/widgets/space-profile/space-profile-modules.tsx', /decodeLegacyEntities\(v\)/],
      // The preview mount: content-block-view.tsx draws the same component with slug={null}.
      ['components/entity-blocks/content-block-view.tsx', /decodeLegacyEntities\(s\(props, key\)\)/],
    ]
    for (const [file, call] of sites) {
      expect(code(file), `${file} renders contactForm copy without decoding it`).toMatch(call)
    }
  })
})
