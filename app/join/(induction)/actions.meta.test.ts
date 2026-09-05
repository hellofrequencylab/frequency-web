import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The two induction writers (writeInduction, mergeInduction) in this file (scan2 L6-09). Both used to
// put the identity columns AND a spread of the whole meta read into ONE profiles update, so a key
// written by any other writer between the read and the write was reverted. Now the columns go in
// their own checked update and the induction keys are merged server-side through mergeProfileMeta.
//
// Source-level, in the house archetype (app/(main)/walkthrough-actions.test.ts): writeInduction
// fans out to a dozen server modules (funnels, nurture, spaces, tags, welcome, email), so a
// behavioural harness here would be mostly mocks of things that are not under test. Comments are
// stripped before matching so the header that DESCRIBES the old shape cannot satisfy or trip it.

const raw = readFileSync('app/join/(induction)/actions.ts', 'utf8')
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** Every `.update({ ... })` payload on the profiles table, as the text between its braces. */
function profileUpdatePayloads(code: string): string[] {
  const out: string[] = []
  const re = /\.from\('profiles'\)\s*\.update\(\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') depth--
      i++
    }
    out.push(code.slice(m.index + m[0].length, i - 1))
  }
  return out
}

describe('the induction writers never send meta through a profiles update', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(raw.length).toBeGreaterThan(5000)
    expect(src).toContain('async function writeInduction')
    expect(src).toContain('async function mergeInduction')
  })

  it('no profiles .update({...}) payload carries a meta key', () => {
    const payloads = profileUpdatePayloads(src)
    expect(payloads.length).toBeGreaterThan(0)
    for (const p of payloads) expect(p).not.toMatch(/\bmeta\s*:/)
  })

  it('both writers merge through mergeProfileMeta, each stamping onboarding_completed as its own key', () => {
    expect(src).toContain("import { mergeProfileMeta } from '@/lib/profiles/meta'")
    const merges = src.match(/await mergeProfileMeta\(supabase,/g) ?? []
    expect(merges).toHaveLength(2)
    expect(src).toMatch(/mergeProfileMeta\(supabase, metaProfileId, \{\s*onboarding_completed: true,/)
    expect(src).toMatch(/const mergedMeta: Meta = \{\s*onboarding_completed: true,/)
    expect(src).toContain('mergeProfileMeta(supabase, profile.id as string, mergedMeta)')
  })

  it('neither writer spreads the read-back meta into what it sends', () => {
    // The old shape: `meta: { ...meta, onboarding_completed: true, ...}` and `{ ...meta, onboarding_completed`.
    expect(src).not.toMatch(/\.\.\.meta,\s*onboarding_completed/)
  })

  it('a failed merge is thrown, not swallowed', () => {
    expect((src.match(/if \(metaErr\) throw new Error\(metaErr\)/g) ?? []).length).toBe(2)
  })
})
