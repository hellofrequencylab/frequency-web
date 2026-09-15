import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ADR-1367: an account holder is admitted, and the induction stops being a wall.
//
// The defect this pins was invisible to every other gate in the repo. `app/(main)/layout.tsx`
// redirected any member who did not satisfy `hasEffectivelyOnboarded()` into /join, a SIGNUP
// funnel, on EVERY request. Measured against production on 2026-09-15 it was marching seven real
// members — created 26 June to 3 September, all with empty `meta` — plus the Vera janitor row.
// Nothing failed, nothing logged, and the people it affected simply stopped coming back: eight of
// the nine accounts ADR-1324 looked at had signed in exactly once.
//
// 🔴 THIS FILE MUST STRIP COMMENTS BEFORE IT ASSERTS. The prohibition is explained at length in
// the very file it governs, and AGENTS.md is explicit that a negative pin cannot live in the same
// text as the prohibition it enforces: a bare `includes()` over the raw source is satisfied by the
// comment that explains why the thing is gone, so it would pass forever whether or not the gate
// came back.

const RAW = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')

/** Source with block and line comments removed, so an assertion reads CODE and never prose. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the member shell admits an account holder (ADR-1367)', () => {
  const SRC = code(RAW)

  it('strips comments rather than reading them — the guard below is only honest if this holds', () => {
    // Positive control for the stripper itself. The raw file DOES name both symbols, in the
    // comment that explains the ruling; the stripped source must not. Without this control a
    // broken stripper would return the empty string and every assertion below would pass vacuously.
    expect(RAW).toContain('FUNNEL_INDUCTION_ACTIVE')
    expect(SRC).not.toContain('FUNNEL_INDUCTION_ACTIVE')
    expect(SRC.length).toBeGreaterThan(1000)
  })

  it('does not gate admission on the onboarding predicate', () => {
    // The two ways the wall could come back: the beta flag, or the predicate it guarded.
    expect(SRC).not.toContain('FUNNEL_INDUCTION_ACTIVE')
    expect(SRC).not.toContain('hasEffectivelyOnboarded')
  })

  it('still redirects a session with NO profile row — a different case with a different answer', () => {
    // Positive control for the change itself: admission was narrowed, not deleted. No profile row
    // means the creation trigger has not run, so there is no account to admit yet.
    expect(SRC).toMatch(/if\s*\(\s*!profile\s*\)/)
    expect(SRC).toContain("redirect('/onboarding')")
  })
})
