import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// NO RAW CONTROL BYTES IN SOURCE.
//
// Two files carried literal control characters — a NUL, 0x1f, 0x7f, 0x08, 0x0b — sitting raw in the
// bytes rather than written as `\x00` escapes:
//
//   lib/ai/vera/execute.ts   inside regex classes like /[<NUL>-<0x1f><0x7f>]/g
//   lib/apps/for-scope.ts    as a template-literal map-key delimiter
//
// Both were FUNCTIONALLY correct: a raw control char in a regex class matches itself, and a raw NUL
// is a perfectly good delimiter. The damage was to auditability. A NUL makes a file "binary" to
// ripgrep, git diff, and most code search, so both files were silently skipped by every grep-based
// sweep over this repo — including the ones looking for exactly the kind of bug that hides in an
// input-sanitizing regex. A file nothing can search is a file nothing can review.
//
// Escapes are byte-identical to the regex engine and to the string, so this costs nothing and the
// file stays greppable.

const ROOTS = ['app', 'lib', 'components', 'scripts', 'test', 'types']
const EXT = /\.(ts|tsx|mts|mjs|js|jsx)$/
// Everything unprintable except the three that legitimately appear in source: \t (0x09),
// \n (0x0a), \r (0x0d).
const RAW_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}

describe('source files stay greppable', () => {
  const files = ROOTS.flatMap(walk)

  it('no source file contains a raw control byte', () => {
    const offenders = files
      .filter((f) => RAW_CONTROL.test(readFileSync(f, 'latin1')))
      .map((f) => `${f} (write it as an \\xNN escape instead)`)
    expect(offenders).toEqual([])
  })

  it('scanned a real number of files (guards against an empty walk)', () => {
    expect(files.length).toBeGreaterThan(500)
  })

  it('the detector actually discriminates', () => {
    expect(RAW_CONTROL.test('const a = 1\n\tconst b = 2\r\n')).toBe(false)
    expect(RAW_CONTROL.test('literal backslash-x-zero-zero: \\x00')).toBe(false)
    expect(RAW_CONTROL.test('raw nul: ' + String.fromCharCode(0))).toBe(true)
    expect(RAW_CONTROL.test('raw del: ' + String.fromCharCode(127))).toBe(true)
  })
})
