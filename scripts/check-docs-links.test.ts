import { describe, it, expect } from 'vitest'
import { runCheck, mdFiles, floorViolation, MIN_FILES, MIN_LINKS } from './check-docs-links.mjs'

// This guard's failure mode was not a wrong answer, it was a vacuous one: `runCheck` reported
// `broken: []` on a corpus of zero and main() printed "every link resolves". These tests pin both
// halves of the fix — the live corpus is real and well clear of the floors, and the floor logic
// actually fires when the corpus is not.

/** The io seam, same shape as check-templates.test.ts's: a virtual docs tree. */
const io = (files: Record<string, string>, targets: string[] = []) => ({
  files: Object.keys(files),
  read: (f: string) => files[f] ?? '',
  // `runCheck` probes ABSOLUTE paths, so match on suffix rather than replicating path.resolve.
  exists: (abs: string) => targets.some((t) => abs.endsWith(t)),
})

describe('the live corpus is real', () => {
  it('walks well past the file floor', () => {
    // Measured 273 on 2026-08-11. If this fails, the walk broke or docs/ moved — not that the
    // repo lost half its documentation.
    expect(mdFiles().length).toBeGreaterThanOrEqual(MIN_FILES)
  })

  it('resolves well past the link floor', () => {
    // Measured 1523 on 2026-08-11. This is the floor the file count cannot stand in for: the
    // walk can be perfectly healthy while the LINK regex matches nothing.
    expect(runCheck().links).toBeGreaterThanOrEqual(MIN_LINKS)
  })

  it('clears the floor and reports no broken link', () => {
    const r = runCheck()
    expect(floorViolation(r)).toBeNull()
    expect(r.broken).toEqual([])
  })
})

describe('the floor fires on a corpus that is not', () => {
  it('an empty walk is a FAILURE, not a clean run', () => {
    const r = runCheck(io({}))
    expect(r.files).toBe(0)
    expect(r.links).toBe(0)
    expect(r.broken).toEqual([]) // ← exactly the vacuous "pass" the floor exists to catch
    expect(floorViolation(r)).toMatch(/walked only 0 markdown file/)
  })

  it('a healthy walk that parses NO links fails too', () => {
    // The sneaky one: the file count is satisfied and every file is read, but the link parser
    // matched nothing. Without MIN_LINKS this passes.
    const prose: Record<string, string> = {}
    for (let i = 0; i < MIN_FILES + 5; i++) prose[`docs/d${i}.md`] = 'No links here, just prose.\n'
    const r = runCheck(io(prose))
    expect(r.files).toBeGreaterThanOrEqual(MIN_FILES)
    expect(r.links).toBe(0)
    expect(floorViolation(r)).toMatch(/resolved only 0 relative \.md link/)
  })

  it('says the silence means nothing, rather than reporting health', () => {
    expect(floorViolation({ files: 0, links: 0 })).toMatch(/means nothing/)
    expect(floorViolation({ files: MIN_FILES, links: 0 })).toMatch(/means nothing/)
  })

  it('a corpus at the floors passes it', () => {
    expect(floorViolation({ files: MIN_FILES, links: MIN_LINKS })).toBeNull()
  })
})

describe('the check itself still detects a broken link', () => {
  // A floor that fires is only useful if the gate underneath it works. Two links, one target.
  const files = {
    'docs/A.md': 'see [B](./B.md) and [gone](./GONE.md)',
    'docs/B.md': '# B',
  }

  it('names the file and the missing target', () => {
    const r = runCheck(io(files, ['docs/B.md']))
    expect(r.files).toBe(2)
    expect(r.links).toBe(2)
    expect(r.broken).toEqual([{ file: 'docs/A.md', target: './GONE.md' }])
  })

  it('counts an external link as out of scope rather than as a link resolved', () => {
    // The regex only matches `.md` targets, so an `https://…/README.md` is the one external form
    // that reaches the scheme guard. It must not inflate the link count the floor is measured on.
    const r = runCheck(io({ 'docs/A.md': '[x](https://example.com/README.md)' }))
    expect(r.links).toBe(0)
    expect(r.broken).toEqual([])
  })
})
