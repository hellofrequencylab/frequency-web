import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// SCAN-762 — a second tap on "List housing" while the geocode and governed write run posted the
// same listing twice. Pinned by reading the source, the same way the sign-in door is (LIVE-043):
// the form is a client component whose only interesting behaviour is which button it submits
// through, and the assertions name the DEFECT (a bare <button type="submit">, a leaf that does
// not read useFormStatus) so they fail on the mistake returning.

const read = (p: string) => readFileSync(p, 'utf8')
const FORM = 'app/(main)/housing/new/housing-form.tsx'
const SUBMIT = 'app/(main)/housing/new/submit.tsx'

describe('a second tap cannot post the housing listing twice', () => {
  it('the form submits through the pending-aware button, not a bare <button>', () => {
    const form = read(FORM)
    expect(form, 'a hand-rolled submit button is back on the housing form').not.toMatch(
      /<button\s+[^>]*type=["']submit["']/,
    )
    // One form, one pending-aware submit, inside it so useFormStatus can see the form.
    expect((form.match(/<form\b/g) ?? []).length).toBe(1)
    expect((form.match(/<HousingSubmit\b/g) ?? []).length).toBe(1)
    expect(form.indexOf('<HousingSubmit')).toBeGreaterThan(form.indexOf('<form'))
    expect(form.indexOf('<HousingSubmit')).toBeLessThan(form.indexOf('</form>'))
  })

  it('the button reports pending from the form it is inside', () => {
    const submit = read(SUBMIT)
    expect(submit).toMatch(/^'use client'/)
    // Matched on comment- and import-free source: the name also sits in a comment and in the
    // import line, so a bare toContain would stay green with the call deleted.
    expect(sourceWithoutComments(SUBMIT, { imports: true })).toContain('useFormStatus()')
    // Button's `loading` disables the control and marks it aria-busy (the re-entrancy guard).
    expect(submit).toMatch(/loading=\{pending\}/)
  })
})
