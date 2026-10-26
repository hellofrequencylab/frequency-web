import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MidnightBar, midnightBarLinks } from './midnight-bar'

describe('the Midnight top bar', () => {
  it('keeps only the small pages, at most four', () => {
    const links = ['Offerings', 'Gift cards', 'The letter', 'About', 'Contact', 'About us'].map((label) => ({ label, href: `/${label}` }))
    expect(midnightBarLinks(links).map((l) => l.label)).toEqual(['Gift cards', 'The letter', 'About', 'Contact'])
  })
  it('names the moon and the next gathering, and drops the gathering when there is none', () => {
    const now = new Date(Date.UTC(2026, 9, 26))
    const withNext = renderToStaticMarkup(<MidnightBar now={now} next={{ title: 'Circle night', startsAt: '2026-11-18T19:00:00Z' }} links={[]} />)
    expect(withNext).toContain('mn-bar-moon')
    expect(withNext).toContain('Circle night')
    expect(renderToStaticMarkup(<MidnightBar now={now} next={null} links={[]} />)).not.toContain('mn-bar-next')
  })
})
