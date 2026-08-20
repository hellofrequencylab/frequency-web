import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Space CONTENT write actions. The Space Communities wall actions (member posts, reactions, comments,
// pin/remove) were deleted in C3.4 (ADR-1091, LIVE-059) along with their unit tests; what remains here
// are the source-shape tests for the brand-content actions that STAY (the FAQ editor wiring + the
// createSpaceFaq positioning rules). These read the source rather than driving mocks, so they need no
// IO seams.

// ─────────────────────────────────────────────────────────────────────────────
// THE WIRING TEST.
//
// createSpaceFaq / updateSpaceFaq / deleteSpaceFaq were complete, gated, tenancy-scoped
// and CALLERLESS. Unit tests on the actions were never the missing piece — the caller was.
// 62 FAQ rows across 14 Spaces were publicly rendered (and emitted as FAQPage JSON-LD) with
// no way for an operator to add, edit or remove a single one.
//
// So this asserts the seam a unit test cannot: that a real UI reaches all three, and that
// the page mounts it. A source-shape assertion, following the precedent in
// lib/spaces/claim-token-privacy.test.ts. If someone deletes the editor, this fails rather
// than the capability quietly reverting to unreachable.
// ─────────────────────────────────────────────────────────────────────────────
describe('the Space FAQ actions have a real caller', () => {
  const editor = readFileSync('components/spaces/space-faq-editor.tsx', 'utf8')

  it('the editor calls all three write actions', () => {
    for (const fn of ['createSpaceFaq', 'updateSpaceFaq', 'deleteSpaceFaq']) {
      expect(editor).toContain(fn)
    }
  })

  it('the basics settings page mounts the editor', () => {
    const page = readFileSync('app/(main)/spaces/[slug]/settings/basics/page.tsx', 'utf8')
    expect(page).toContain('SpaceFaqEditor')
    expect(page).toContain('getSpaceFaqs')
  })

  it('the editor honours the read-only gate the sibling forms use', () => {
    // staffViewing || !canUseProfile — a staff member viewing another operator's Space, or an
    // operator whose `profile` function is off, must see the FAQ but not be able to write it.
    expect(editor).toContain('readOnly')
  })
})

// A create must APPEND. `Number.isFinite(undefined)` is false, so the original defaulted every
// operator-created FAQ to position 0 — tied with the first importer-seeded row, and on a tie the
// public list could reorder itself between requests.
describe('createSpaceFaq positions a new question last', () => {
  it('reads the current max position rather than defaulting to zero', () => {
    const src = readFileSync('lib/spaces/content-actions.ts', 'utf8')
    const create = src.slice(src.indexOf('export async function createSpaceFaq'))
    expect(create).toContain("order('position', { ascending: false })")
    expect(create).toMatch(/position = last \? Number\(/)
  })

  it('requires an answer, not just a question', () => {
    const src = readFileSync('lib/spaces/content-actions.ts', 'utf8')
    const create = src.slice(src.indexOf('export async function createSpaceFaq'))
    expect(create).toContain("if (!answer) return fail(")
  })
})
