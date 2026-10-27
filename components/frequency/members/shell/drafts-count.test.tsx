// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { DraftsCount } from './drafts-count'
import { FQ_ACCOUNT_MENU, groupRows, type FqMenuViewer } from './nav'
const viewer = { navAccess: {}, host: false, operatesSpaces: false, signedIn: true } as FqMenuViewer
const rowsFor = (count: number, signedIn = true) => groupRows(FQ_ACCOUNT_MENU, { ...viewer, signedIn }, '/people/ada', { drafts: count }).flatMap(g => g.rows)
describe('the actual Frequency Drafts queue badge', () => {
  it.each([1, 4, 99, 100])('renders the existing proposal count %i through the active menu data', count => {
    const row = rowsFor(count).find(r => r.href === '/drafts')!
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(<a href={row.href}>{row.label}<DraftsCount {...row} /></a>), 'text/html')
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('/drafts')
    expect(doc.querySelector('b')?.textContent).toBe(count > 99 ? '99+' : String(count))
    expect(doc.querySelector('b')?.getAttribute('aria-label')).toBe(`${count} drafts waiting`)
  })
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])('hides unusable count %s', count => {
    expect(renderToStaticMarkup(<DraftsCount href="/drafts" count={count} />)).toBe('')
  })
  it('does not badge other destinations or leak the queue to visitor previews', () => {
    expect(renderToStaticMarkup(<DraftsCount href="/journal" count={9} />)).toBe('')
    expect(rowsFor(9, false).some(r => r.href === '/drafts')).toBe(false)
    expect(rowsFor(9).filter(r => r.href !== '/drafts').every(r => r.count === undefined)).toBe(true)
  })
  it('keeps real server count wiring and both actual account/drawer render consumers', () => {
    const shell = readFileSync('components/frequency/members/shell/members-shell.tsx', 'utf8')
    const header = readFileSync('components/frequency/members/shell/header.tsx', 'utf8')
    const check = (s: string, h: string) => s.includes('drafts: myFrequency?.drafts') && h.includes('<DraftsCount href={r.href} count={r.count}') && h.includes('row(r.href, r.label, r.icon, r.count)') && h.includes("href === '/drafts' ? <DraftsCount")
    expect(check(shell, header)).toBe(true)
    expect(check(shell.replaceAll('drafts: myFrequency?.drafts', 'drafts: undefined'), header)).toBe(false)
    expect(check(shell, header.replace('row(r.href, r.label, r.icon, r.count)', 'row(r.href, r.label, r.icon)'))).toBe(false)
  })
})
