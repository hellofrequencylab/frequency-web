import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
// @ts-expect-error — .mjs guard module, no type declarations (same shape as the other guard tests)
import { composesShell, ancestorComposes, rendersJsx, evaluate, pages, SHELLS, PIECES, loadBaseline, BASELINE_FILE, MIN_PAGES } from './check-templates.mjs'

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
  it('every bare page in the real tree is named on the baseline SET', () => {
    // A SET, not a count (2026-08-12). The old assertion was `bare.length === BASELINE`, which
    // passed for a tree where one page adopted a template and one new bare page arrived — the two
    // net to zero. Comparing membership makes that swap visible, and names the newcomer.
    const baseline = loadBaseline()
    const added = evaluate().bare.filter((p) => !baseline.has(p))
    expect(added, `\n  NEW bare page(s):\n    ${added.join('\n    ')}\n`).toEqual([])
  })

  it('the baseline names real page files, so it cannot rot into fiction', () => {
    // A stale entry whose page now composes a shell is not a failure — the gate reports it as
    // shrinkable. An entry naming a file that does not EXIST is different: it means the list was
    // hand-edited rather than regenerated, and a ratchet nobody can reproduce is not a ratchet.
    // (`app/page.tsx` is a legitimate entry, which is why this checks existence, not path depth.)
    const baseline = [...loadBaseline()]
    expect(baseline.length).toBeGreaterThan(0)
    const missing = baseline.filter((p) => !existsSync(p))
    expect(missing, `\n  ${BASELINE_FILE} names file(s) that do not exist:\n    ${missing.join('\n    ')}\n`).toEqual([])
  })

  it('scans a real corpus, well past the floor', () => {
    expect(pages().length).toBeGreaterThanOrEqual(MIN_PAGES)
  })

  it('the scope excludes the systems that are not template-governed', () => {
    // PAGE-FRAMEWORK: templates govern "App routes behind auth (app/(main)/*)".
    const list: string[] = pages()
    expect(list.some((p) => p.includes('(marketing)'))).toBe(false)
    expect(list.some((p) => p.startsWith('app/discover'))).toBe(false)
    expect(list.some((p) => p.startsWith('app/(main)'))).toBe(true)
  })

  it('SKIP_DIRS applies at the TOP LEVEL only, so a nested namesake stays governed', () => {
    // This is where this guard's scope genuinely differs from check:headers', which drops a
    // skipped name at any depth. Pinned as a test because the difference used to be described
    // wrongly in a comment, and a comment cannot fail.
    const list: string[] = pages()
    expect(list).not.toContain('app/spotlight/[handle]/page.tsx')
    expect(list).toContain('app/(main)/settings/profile/spotlight/page.tsx')
  })
})
