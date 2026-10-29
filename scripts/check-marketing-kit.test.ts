import { describe, expect, it } from 'vitest'
import { posix } from 'node:path'
import { inspectMarketingPage } from './check-marketing-kit.mjs'

function fixture(files: Record<string, string>, entry: string) {
  const readSource = (file: string) => files[file] ?? null
  const resolveLocalImport = (from: string, specifier: string) => {
    if (specifier.startsWith('@/')) return `${specifier.slice(2)}.tsx`
    if (!specifier.startsWith('.')) return null
    const base = posix.normalize(posix.join(posix.dirname(from), specifier))
    const file = `${base}.tsx`
    return files[file] ? file : null
  }
  return inspectMarketingPage(entry, { readSource, resolveLocalImport })
}

describe('check:marketing-kit route and imported-section contract', () => {
  it('rejects expression-based layout classes by refusing route-owned HTML', () => {
    const problems = fixture({
      'app/(marketing)/sample/page.tsx': `export default function Page() { const layout = 'p-4'; return <div className={layout}><p>Text</p></div> }`,
    }, 'app/(marketing)/sample/page.tsx')

    expect(problems).toContain('app/(marketing)/sample/page.tsx: route markup owns <div>; compose a Frequency page/section component')
  })

  it('rejects a hand-built route section even when it has no layout classes', () => {
    const problems = fixture({
      'app/(marketing)/sample/page.tsx': `export default function Page() { return <section><h1>Raw route section</h1></section> }`,
    }, 'app/(marketing)/sample/page.tsx')

    expect(problems).toContain('app/(marketing)/sample/page.tsx: route markup owns <section>; compose a Frequency page/section component')
  })

  it('rejects a section moved into a directly imported non-kit component', () => {
    const problems = fixture({
      'app/(marketing)/sample/page.tsx': `import { Sample } from './sample-section'; export default function Page() { return <Sample /> }`,
      'app/(marketing)/sample/sample-section.tsx': `export function Sample() { return <section className={classes.hero}><h1>Hand-built</h1></section> }`,
    }, 'app/(marketing)/sample/page.tsx')

    expect(problems).toContain('app/(marketing)/sample/sample-section.tsx: imported page section is outside the Frequency site page/shell kit')
  })

  it('follows nested imports and catches semantic sections outside the kit', () => {
    const problems = fixture({
      'app/(marketing)/sample/page.tsx': `import { Sample } from '@/components/frequency/site/pages/sample'; export default function Page() { return <Sample /> }`,
      'components/frequency/site/pages/sample.tsx': `import { Nested } from '@/components/marketing/nested-section'; export function Sample() { return <Nested /> }`,
      'components/marketing/nested-section.tsx': `export function Nested() { return <section data-screen-label="Hero"><h1>Hand-built</h1></section> }`,
    }, 'app/(marketing)/sample/page.tsx')

    expect(problems).toContain('components/marketing/nested-section.tsx: imported page section is outside the Frequency site page/shell kit')
  })

  it('allows a section implemented under the canonical site page kit', () => {
    const problems = fixture({
      'app/(marketing)/sample/page.tsx': `import { Sample } from '@/components/frequency/site/pages/sample'; export default function Page() { return <Sample /> }`,
      'components/frequency/site/pages/sample.tsx': `export function Sample() { return <section className="sec"><h1>Kit section</h1></section> }`,
    }, 'app/(marketing)/sample/page.tsx')

    expect(problems).toEqual([])
  })

  it('keeps legal article markup inside the verified shared LegalPage slot', () => {
    const problems = fixture({
      'app/privacy/page.tsx': `import { LegalPage } from '@/components/legal/legal-page'; export default function Page() { return <LegalPage title="Privacy" updated="Today"><section><h2>Policy</h2><p>Text</p></section></LegalPage> }`,
      'components/legal/legal-page.tsx': `export function LegalPage({ children }) { return <div>{children}</div> }`,
    }, 'app/privacy/page.tsx')

    expect(problems).toEqual([])
  })

  it('rejects legal markup outside the shared reading component', () => {
    const problems = fixture({
      'app/privacy/page.tsx': `import { LegalPage } from '@/components/legal/legal-page'; export default function Page() { return <><LegalPage title="Privacy" updated="Today"><p>Policy</p></LegalPage><section><h2>Outside</h2></section></> }`,
      'components/legal/legal-page.tsx': `export function LegalPage({ children }) { return <div>{children}</div> }`,
    }, 'app/privacy/page.tsx')

    expect(problems).toContain('app/privacy/page.tsx: legal page markup must stay inside its shared LegalPage content slot')
  })

  it('does not treat editor-rendered published content as application-owned page composition', () => {
    const problems = fixture({
      'app/(marketing)/sample/page.tsx': `import { BlockRender } from '@/lib/page-editor/block-render'; export default function Page() { return <BlockRender /> }`,
      'lib/page-editor/block-render.tsx': `export function BlockRender() { return <section className="published-block"><h1>Editor content</h1></section> }`,
    }, 'app/(marketing)/sample/page.tsx')

    expect(problems).toEqual([])
  })
})
