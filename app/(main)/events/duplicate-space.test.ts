import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Duplicating an event keeps its Space ───────────────────────────────────────────────────
//
// THE BUG. The Space Calendar console's Duplicate button links to `/events/new?duplicate=<id>`
// with NO `?space=`. `buildDuplicateInitial` did not read `space_id` either, so the copy had
// nothing to resolve a scope from and was created as a ROOT-ATTRIBUTED PERSONAL event. The
// operator duplicates one of their business's events and silently gets a personal one.
//
// The file's own comment on `defaultGroupId` already names this failure — "a silent drop is how a
// Business Space's event ended up root-attributed + personal", the Royal Temple bug — which was
// fixed for the `?space=` deep link and left open on this entry point.
//
// Source-text, because the failure is silent: the copy is created successfully, looks right in the
// form, and lands in the wrong place. Nothing throws.

const src = readFileSync('app/(main)/events/new/page.tsx', 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the duplicate reader carries the source Space', () => {
  it('selects space_id from the source event', () => {
    const fn = code.slice(code.indexOf('async function buildDuplicateInitial'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('space_id')
  })

  it('returns it BESIDE the form prefill, not inside it', () => {
    // It feeds `defaultGroupId` (the scope selector's default), not a form field. Putting it in
    // EventFormInitial would imply the form renders it, and the next person would wire an input.
    expect(code).toContain('interface DuplicatePrefill')
    expect(code).toMatch(/initial:\s*Partial<EventFormInitial>/)
    expect(code).toMatch(/spaceId\?:\s*string/)
  })
})

describe('the Space is re-checked before it is used', () => {
  it('only applies when the caller actually runs that Space', () => {
    // 🔴 Without this, duplicating someone else's event would place the copy in THEIR Space. The
    // `spaces` array is "spaces you run", the same gate `?space=` passes through.
    expect(code).toContain('spaces.some((sp) => sp.id === duplicateInitial!.spaceId)')
  })

  it('ranks below an explicit ?space= and above ?circle=', () => {
    // Most-specific-wins, matching the existing order: an operator who deep-linked from a console
    // meant that Space; a duplicate only expresses where the SOURCE lived.
    const gid = code.slice(code.indexOf('const defaultGroupId ='))
    const decl = gid.slice(0, gid.indexOf('\n\n'))
    const spaceParamAt = decl.indexOf('spaceParam')
    const dupAt = decl.indexOf('duplicateSpaceId')
    const circleAt = decl.indexOf('circleParam')
    expect(spaceParamAt).toBeGreaterThan(-1)
    expect(dupAt).toBeGreaterThan(spaceParamAt)
    expect(circleAt).toBeGreaterThan(dupAt)
  })

  it('the duplicate is resolved BEFORE the scope default that reads it', () => {
    // Ordering bug caught while writing this: defaultGroupId originally sat above the
    // buildDuplicateInitial await, so it read an undefined variable. TypeScript caught it, but the
    // ordering is load-bearing and nothing else pins it.
    expect(code.indexOf('await buildDuplicateInitial')).toBeLessThan(code.indexOf('const defaultGroupId ='))
  })
})
