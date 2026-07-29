import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { layoutRendersSame, layoutRenderKey } from './layout-equal'
import { resolveRows, starterRows } from './layout'

// ── "Unpublished changes" must mean a visitor would see something different ────────────────
//
// 🔴 THE BUG. The Space draft/publish split decided there were unpublished changes from the mere
// PRESENCE of `preferences.profileLayoutDraft`, plus a byte comparison of the two stored nodes.
// Autosave writes the draft on every edit and only Publish ever deleted it, so an owner who dragged
// one block and hit Undo kept a draft forever — and the flag arms a beforeunload prompt AND a
// window.confirm on every admin-rail dismissal. One rejected experiment left them confirming a
// dialog on their own Space with no exit but publishing a change they had already decided against.
//
// Every case below is a pair that RENDERS THE SAME and used to compare unequal.

describe('two encodings of one arrangement compare equal', () => {
  it('an absent published node equals a draft holding the starter it would have drawn', () => {
    // The commonest shape by far: a Space that never published a layout has NO `profileLayout` key,
    // so the published side is literally null while the draft is a full rows object. Both draw the
    // basic starter. Byte comparison called this "unpublished" forever.
    const draft = { rows: starterRows('space', 'basic') }
    expect(layoutRendersSame(draft, null, 'space')).toBe(true)
    expect(layoutRendersSame(draft, undefined, 'space')).toBe(true)
  })

  it('a hidden block left in the cells equals the same layout with it stripped', () => {
    // rows-ops keeps a hidden id in BOTH `rows.cells` and `hidden`; the seed path strips it from the
    // cells. Two spellings of one page that could never match as bytes.
    const rows = starterRows('space', 'basic')
    const victim = rows.flatMap((r) => r.cells.flat())[0]
    expect(victim).toBeTruthy()

    const stripped = rows.map((r) => ({ ...r, cells: r.cells.map((c) => c.filter((id) => id !== victim)) }))
    const kept = { rows, hidden: [victim] }
    expect(layoutRendersSame(kept, { rows: stripped, hidden: [victim] }, 'space')).toBe(true)
  })

  it('key ORDER in the stored jsonb does not count as a change', () => {
    // Postgres jsonb does not preserve insertion order, so the same node read back can serialise
    // differently. A raw JSON.stringify made that a permanent "unpublished" state on its own.
    const a = { rows: starterRows('space', 'basic'), style: { about: { pad: 'md', align: 'center' } } }
    const b = { style: { about: { align: 'center', pad: 'md' } }, rows: starterRows('space', 'basic') }
    expect(layoutRendersSame(a, b, 'space')).toBe(true)
  })

  it('garbage on either side resolves to the starter rather than throwing', () => {
    // The node is untyped jsonb (ADR-246). Every reader here has to be total.
    for (const junk of [42, 'nope', [], { rows: 'no' }, { rows: [] }]) {
      expect(() => layoutRenderKey(junk, 'space')).not.toThrow()
      expect(layoutRendersSame(junk, null, 'space')).toBe(true)
    }
  })
})

describe('but a real difference is still a difference', () => {
  it('a different arrangement does not compare equal', () => {
    expect(layoutRendersSame({ rows: starterRows('space', 'basic') }, { rows: starterRows('space', 'showcase') }, 'space')).toBe(
      false,
    )
  })

  it('authored content counts, because a visitor reads it', () => {
    const rows = starterRows('space', 'basic')
    expect(layoutRendersSame({ rows, content: { about: { title: 'New' } } }, { rows }, 'space')).toBe(false)
  })

  it('per-block style counts too', () => {
    // A REAL BlockStyle field. Garbage keys are stripped by the sanitiser, so an invented one would
    // normalise to nothing on both sides and this test would pass for the wrong reason.
    const rows = starterRows('space', 'basic')
    expect(layoutRendersSame({ rows, style: { about: { background: false } } }, { rows }, 'space')).toBe(false)
  })

  it('hiding a block that WAS rendered is a real change', () => {
    const rows = starterRows('space', 'basic')
    const victim = rows.flatMap((r) => r.cells.flat())[0]
    expect(layoutRendersSame({ rows, hidden: [victim] }, { rows }, 'space')).toBe(false)
  })

  it('the key really is the resolved render, not the stored bytes', () => {
    // Guards the whole approach: if someone swaps this back to comparing raw nodes, the two
    // encodings above start diverging again and nothing else here would notice.
    const rows = starterRows('space', 'basic')
    expect(layoutRenderKey({ rows }, 'space')).toContain(JSON.stringify(resolveRows({ rows }, 'space')[0].id))
  })
})

describe('the draft self-clears server-side, and there is a way out by hand', () => {
  const actions = readFileSync('app/(main)/spaces/[slug]/settings/profile/actions.ts', 'utf8')

  it('an autosave that matches the published page deletes the draft key', () => {
    // 🔴 Without this the flag is ONE-WAY: nothing but Publish ever removed the key.
    expect(actions).toContain("target === 'profileLayoutDraft' && layoutRendersSame(node, current.profileLayout ?? null, 'space')")
    expect(actions).toContain('delete current.profileLayoutDraft')
  })

  it('the auto-clear never second-guesses a write to the PUBLISHED node', () => {
    // Publishing is the owner's explicit act. Only the draft target is normalised.
    expect(actions).toMatch(/if \(target === 'profileLayoutDraft' &&/)
  })

  it('Discard exists, is owner-gated, and cannot touch the live page', () => {
    expect(actions).toContain('export async function discardSpaceProfileDraft')
    const fn = actions.slice(actions.indexOf('export async function discardSpaceProfileDraft'))
    expect(fn).toContain('resolveSpaceManageAccess')
    expect(fn).toContain("if (!canManage) return { error: 'You do not have permission to edit this space.' }")
    // It deletes the DRAFT and nothing else — never `delete current.profileLayout`.
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('delete current.profileLayoutDraft')
    expect(body).not.toMatch(/delete current\.profileLayout\b(?!Draft)/)
  })

  it('and the bar offers it only when there is something to throw away', () => {
    const fab = readFileSync('components/entity-blocks/space-publish-fab.tsx', 'utf8')
    expect(fab).toContain('discardSpaceProfileDraft(slug)')
    expect(fab).toContain('{hasUnpublishedChanges && (')
    // Destructive and irreversible, so it asks first.
    expect(fab).toMatch(/onDiscard[\s\S]{0,300}window\.confirm\(/)
  })
})
