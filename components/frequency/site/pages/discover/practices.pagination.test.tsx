// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { practiceLibraryPage, pillarPracticePageHref } from '@/lib/practices/library-pages'
vi.mock('next/link', () => ({ default: ({ href, children, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
  void prefetch
  return <a href={href} {...props}>{children}</a>
} }))
vi.mock('next/image', () => ({ default: (props: ImgHTMLAttributes<HTMLImageElement>) => createElement('img', { ...props, alt: props.alt ?? '' }) }))
vi.mock('@/components/discover/share-button', () => ({ ShareButton: () => null }))
import { FrequencyPillarPractices } from './practices'
const pillar = { name: 'Mind', slug: 'mind' }
const rows = [{ id: '61', slug: 'second-page', title: 'A quiet moment', subcategory: null, summary: 'Notice what is around you.', description: null }]
function render(extra: { page?: number; pageCount?: number; total?: number } = {}) {
  const element = document.createElement('div')
  element.innerHTML = renderToStaticMarkup(<FrequencyPillarPractices pillar={pillar} description="Choose what supports you." pillars={[pillar]} rows={rows} image={null} {...extra} />)
  return element
}
describe('the actual public practice page controls', () => {
  it('links both directions on an interior page and reports the full result total', () => {
    const element = render({ page: 2, pageCount: 3, total: 121 })
    const nav = element.querySelector('nav[aria-label="Practice pages"]')!
    expect(nav.textContent).toContain('Page 2 of 3')
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/discover/practices/pillar/mind', '/discover/practices/pillar/mind?page=3'])
    expect(element.textContent).toContain('121 Practices')
    expect(element.querySelector('a[href="/discover/practices/second-page"]')).not.toBeNull()
  })
  it('has only Next on the first page and only Previous on the last', () => {
    expect(render({ page: 1, pageCount: 2 }).querySelector('nav[aria-label="Practice pages"]')?.textContent).not.toContain('Previous')
    expect(render({ page: 2, pageCount: 2 }).querySelector('nav[aria-label="Practice pages"]')?.textContent).not.toContain('Next')
  })
  it('keeps old callers compatible without a redundant one-page pager', () => {
    expect(render().querySelector('nav[aria-label="Practice pages"]')).toBeNull()
  })
  it('bounds numeric input and never makes an unsafe range from arrays or malformed numbers', () => {
    for (const value of [null, 2, '', '0', '-2', '1.2', '2e3', ' 2', '2 ', ['2'], {}, '9007199254740991']) expect(practiceLibraryPage(value)).toBe(1)
    expect(practiceLibraryPage('35791394')).toBe(35791394)
    expect(practiceLibraryPage('35791395')).toBe(1)
    expect(practiceLibraryPage('2')).toBe(2)
    expect(pillarPracticePageHref('mind', 1)).toBe('/discover/practices/pillar/mind')
    expect(pillarPracticePageHref('mind', 2)).toBe('/discover/practices/pillar/mind?page=2')
  })
})
