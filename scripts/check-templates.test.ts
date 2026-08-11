import { describe, it, expect } from 'vitest'
// @ts-expect-error — .mjs guard module, no type declarations (same shape as the other guard tests)
import { composesShell, ancestorComposes, rendersJsx, evaluate, pages, SHELLS, PIECES, BASELINE, MIN_PAGES } from './check-templates.mjs'

// The class this guards is the one whose number kept drifting in the plan docs, because it was the
// only design-debt class with no instrument. These tests pin the two distinctions that made the old
// hand counts wrong: a PIECE is not a shell, and an IMPORT is not a composition.

const io = (files: Record<string, string>) => ({
  read: (f: string) => files[f] ?? '',
  exists: (f: string) => f in files,
})

describe('what counts as composing a shell', () => {
  it('accepts a rendered shell', () => {
    expect(composesShell('export default function P() { return <AdminTemplate title="x" /> }')).toBe(true)
    expect(composesShell('return <DetailTemplate>{kids}</DetailTemplate>')).toBe(true)
  })

  it('REJECTS an import that is never rendered', () => {
    // The old measurement counted this as compliant. A shell you imported and did not use is a
    // shell you did not compose.
    expect(composesShell("import { AdminTemplate } from '@/components/templates'")).toBe(false)
  })

  it('REJECTS a piece, however prominently it is used', () => {
    // The exact hole: the barrel exports pieces too, so "imports from @/components/templates"
    // was never evidence of a layout.
    for (const piece of PIECES) {
      expect(composesShell(`return <${piece} title="x" />`), piece).toBe(false)
    }
  })

  it('ignores a shell named only in a comment', () => {
    expect(composesShell('// this page should use <AdminTemplate> one day\nreturn <div />')).toBe(false)
    expect(composesShell('{/* <DetailTemplate> was removed */}\nreturn <div />')).toBe(false)
  })

  it('every shell name is matched', () => {
    for (const s of SHELLS) expect(composesShell(`<${s} />`), s).toBe(true)
  })
})

describe('ancestor layouts count, which is why the Space profile tree is compliant', () => {
  const files = {
    'app/(main)/x/(group)/thing/page.tsx': 'return <div />',
    'app/(main)/x/(group)/layout.tsx': 'return <DetailTemplate>{children}</DetailTemplate>',
  }

  it('a page under a shell-composing layout is compliant', () => {
    expect(ancestorComposes('app/(main)/x/(group)/thing/page.tsx', io(files).read, io(files).exists)).toBe(true)
  })

  it('a page with no composing ancestor is not', () => {
    const bare = { 'app/(main)/y/page.tsx': 'return <div />', 'app/(main)/y/layout.tsx': 'return <>{children}</>' }
    expect(ancestorComposes('app/(main)/y/page.tsx', io(bare).read, io(bare).exists)).toBe(false)
  })

  it('terminates at app/ rather than walking to the filesystem root', () => {
    // A bug here is an infinite loop in CI, not a wrong number.
    const none = {}
    expect(ancestorComposes('app/page.tsx', io(none).read, io(none).exists)).toBe(false)
  })
})

describe('redirect stubs owe no shell', () => {
  it('a page that renders no JSX is not counted', () => {
    expect(rendersJsx("redirect('/somewhere')")).toBe(false)
    expect(rendersJsx('return <div />')).toBe(true)
  })

  it('evaluate skips them', () => {
    const files = {
      'a/page.tsx': "import { redirect } from 'next/navigation'\nredirect('/x')",
      'b/page.tsx': 'return <div />',
    }
    const r = evaluate({ ...io(files), pages: Object.keys(files) })
    expect(r.total).toBe(2)
    expect(r.considered).toBe(1)
    expect(r.bare).toEqual(['b/page.tsx'])
  })
})

describe('the ratchet and its floor', () => {
  it('the real tree sits exactly at the baseline', () => {
    // If this fails the class MOVED. Falling is good and the gate says so; rising is the failure.
    expect(evaluate().bare.length).toBe(BASELINE)
  })

  it('scans a real corpus, well past the floor', () => {
    expect(pages().length).toBeGreaterThanOrEqual(MIN_PAGES)
  })

  it('the scope excludes the systems that are not template-governed', () => {
    // PAGE-FRAMEWORK: templates govern "App routes behind auth (app/(main)/*)". Mirrors
    // check-headers' SKIP_DIRS so the two guards cannot disagree about what in-app means.
    const list: string[] = pages()
    expect(list.some((p) => p.includes('(marketing)'))).toBe(false)
    expect(list.some((p) => p.startsWith('app/discover'))).toBe(false)
    expect(list.some((p) => p.startsWith('app/(main)'))).toBe(true)
  })
})
