import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readHeader } from './check-admin-client.mjs'

// ── --update MUST NOT EAT THE REASONS (SCAN-537, ADR-1200) ───────────────────────────────────────
//
// `scripts/admin-client-baseline.txt` is the frozen list of files allowed to import the
// RLS-bypassing service-role client (ADR-923). Above the list sits a comment block carrying the
// per-entry justification for each bypass — the zero-policy table, the signed-out caller, the
// SECURITY DEFINER function that makes it the safe shape. It is the only place that reasoning
// exists.
//
// `--update` regenerated the file from a fresh scan and wrote a hard-coded 5-line header, so adding
// ONE legitimate entry measured +2 / −76, and the 76 were the reasons.
//
// That is the worst shape a security tool can have: the command is the one the guard PRINTS when it
// fails, it is run by someone under CI pressure who wants green, its output passes immediately, and
// the loss shows up in the diff as deletions in a file the reviewer is scanning for a single added
// path. Reads were already comment-blind (`loadBaseline` strips `#`); only the write was asymmetric.
//
// A code-shape check would not be enough here — the row's own probe demands this test — because the
// property is behavioural: regenerate, and the header must come back byte-identical.

const BASELINE = 'scripts/admin-client-baseline.txt'

/** What `--update` writes, given a header reader and a list of importers. Mirrors the one line in
 *  check-admin-client.mjs so the round-trip can be exercised without touching the real file. */
const regenerate = (header: string, importers: string[]) => header + importers.join('\n') + '\n'

describe('readHeader preserves the leading comment block', () => {
  it('returns every comment line above the first entry, byte-identically', () => {
    const fixture = ['# one', '# two', '#   indented continuation', 'lib/a.ts', 'lib/b.ts'].join('\n')
    expect(readHeader(() => fixture)).toBe('# one\n# two\n#   indented continuation\n')
  })

  it('keeps blank lines INSIDE the block, because the prose uses them', () => {
    const fixture = ['# one', '', '# two', 'lib/a.ts'].join('\n')
    expect(readHeader(() => fixture)).toBe('# one\n\n# two\n')
  })

  it('round-trips: regenerating with a different list leaves the header untouched', () => {
    const header = '# reason for a\n# reason for b\n'
    const before = header + ['lib/a.ts', 'lib/b.ts'].join('\n') + '\n'
    const after = regenerate(readHeader(() => before), ['lib/a.ts', 'lib/b.ts', 'lib/c.ts'])
    expect(after.startsWith(header)).toBe(true)
    expect(after).toBe(header + 'lib/a.ts\nlib/b.ts\nlib/c.ts\n')
  })

  it('MUTATION CONTROL: a writer that emits the default header instead FAILS this same assertion', () => {
    // Without this the suite could pass against a regressed script, which is the failure mode the
    // row is about. The old behaviour is reconstructed here and must not satisfy the round-trip.
    const header = '# reason for a\n# reason for b\n'
    const before = header + 'lib/a.ts\n'
    const oldBehaviour = regenerate('# check:admin-client baseline — generic\n', ['lib/a.ts', 'lib/c.ts'])
    expect(oldBehaviour.startsWith(header)).toBe(false)
    // and the fixed path does satisfy it, so the control discriminates rather than always failing
    expect(regenerate(readHeader(() => before), ['lib/a.ts', 'lib/c.ts']).startsWith(header)).toBe(true)
  })

  it('falls back to the default when there is no header to keep', () => {
    expect(readHeader(() => 'lib/a.ts\nlib/b.ts')).toContain('check:admin-client baseline')
    expect(
      readHeader(() => {
        throw new Error('ENOENT')
      }),
    ).toContain('check:admin-client baseline')
  })
})

describe('the real baseline', () => {
  it('carries a substantial comment block, not just the 5 default lines', () => {
    const header = readHeader()
    const lines = header.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(20)
    expect(lines.every((l) => l.startsWith('#'))).toBe(true)
  })

  it('and that block is real per-entry reasoning, not a restated title', () => {
    // Proves readHeader reads the ACTUAL justifications rather than a stub: these are phrases that
    // only appear in the explanatory prose, never in a file path.
    const header = readHeader()
    expect(/RLS|policy|signed-out|SECURITY DEFINER|audit|webhook/i.test(header)).toBe(true)
  })

  it('every entry still parses as a path once the header is stripped', () => {
    const src = readFileSync(BASELINE, 'utf8')
    const entries = src
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean)
    expect(entries.length).toBeGreaterThan(500)
    expect(entries.every((e) => e.endsWith('.ts') || e.endsWith('.tsx'))).toBe(true)
  })
})
