import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sourceWithoutComments, stripComments, stripImports } from './source-shape'

// The helper exists so a source-shape test cannot be satisfied by a comment (scan2 L8-04). Its own
// test therefore has to show two things: prose is gone, and code that merely LOOKS like prose is
// not. Every case below is a shape found in a file this repo actually pins.

describe('stripComments', () => {
  it('blanks line and block comments but keeps their length and line breaks', () => {
    const src = 'const a = 1 // trailing\n/* block\n spans */ const b = 2\n'
    const out = stripComments(src)
    expect(out.length).toBe(src.length)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    expect(out).not.toContain('trailing')
    expect(out).not.toContain('spans')
    expect(out).toContain('const a = 1')
    expect(out).toContain('const b = 2')
  })

  it('leaves a `//` inside a string alone', () => {
    const src = "const url = 'https://example.com/x' // real comment\n"
    const out = stripComments(src)
    expect(out).toContain("'https://example.com/x'")
    expect(out).not.toContain('real comment')
  })

  it('leaves a `/*` inside a regex literal alone', () => {
    const src = 'const re = /\\/\\*[^/]*\\*\\//g\nconst after = 1\n'
    expect(stripComments(src)).toContain('const after = 1')
    expect(stripComments(src)).toContain('/g')
  })

  it('treats a slash after an identifier, number or paren as division, so the comment behind it still goes', () => {
    const src = 'const r = a / b // divide\nconst s = (x) / 2 // again\n'
    const out = stripComments(src)
    expect(out).not.toContain('divide')
    expect(out).not.toContain('again')
    expect(out).toContain('a / b')
  })

  it('walks a template literal with nested ${} expressions and strips the comment after it', () => {
    const src = 'const t = `id, ${cols({ a: 1 })}, done` // note\nconst u = 1\n'
    const out = stripComments(src)
    expect(out).toContain('`id, ${cols({ a: 1 })}, done`')
    expect(out).not.toContain('note')
    expect(out).toContain('const u = 1')
  })

  it('keeps JSX self-closing and closing tags intact', () => {
    const src = '<p className="x" /><a>{v}</a> {/* jsx comment */}\n'
    const out = stripComments(src)
    expect(out).toContain('<p className="x" /><a>{v}</a>')
    expect(out).not.toContain('jsx comment')
  })

  it('is what makes the proven mutation visible: code gone, comment still there, needle no longer found', () => {
    // The shape of lib/platform-flags.test.ts:162 before this helper. The call is deleted; the
    // sentence that explains the call survives; a bare toContain still passes, the stripped one fails.
    const mutated = "// `eventsListingHorizonDays()` is the setting that replaced the literal\nconst horizon = 60\n"
    expect(mutated).toContain('eventsListingHorizonDays()')
    expect(stripComments(mutated)).not.toContain('eventsListingHorizonDays()')
  })
})

describe('stripImports', () => {
  it('blanks single-line, multi-line, type, side-effect and re-export declarations', () => {
    const src = [
      "import { a } from './a'",
      'import {',
      '  b,',
      '  c,',
      "} from '@/lib/c'",
      "import type { T } from './t'",
      "import 'server-only'",
      "export { d } from './d'",
      "export * from './e'",
      'const call = b(c)',
      '',
    ].join('\n')
    const out = stripImports(src)
    expect(out.length).toBe(src.length)
    expect(out).not.toContain('from')
    expect(out).not.toContain('server-only')
    expect(out).not.toContain('import')
    expect(out).toContain('const call = b(c)')
  })

  it('keeps a dynamic import() call, which is code', () => {
    const src = "const mod = await import('./heavy')\n"
    expect(stripImports(src)).toContain("await import('./heavy')")
  })
})

describe('sourceWithoutComments', () => {
  // A fresh private directory per run (mkdtemp), never a fixed name another process could pre-create.
  const dir = mkdtempSync(join(tmpdir(), 'source-shape-test-'))
  const file = join(dir, 'sample.ts')
  writeFileSync(
    file,
    [
      "import { thing } from './thing'",
      '// thing() is called below',
      'export function run() {',
      '  return thing()',
      '}',
      '',
    ].join('\n'),
  )

  it('strips comments by default and imports on request', () => {
    const noComments = sourceWithoutComments(file)
    expect(noComments).not.toContain('is called below')
    expect(noComments).toContain("from './thing'")
    expect(noComments).toContain('return thing()')

    const calls = sourceWithoutComments(file, { imports: true })
    expect(calls).not.toContain("from './thing'")
    expect(calls).toContain('return thing()')
  })

  it('resolves a relative path against the working directory', () => {
    const src = sourceWithoutComments('test/source-shape.ts')
    expect(src).toContain('export function sourceWithoutComments')
    expect(src).not.toContain('Source-shape tests pin CODE')
  })
})
