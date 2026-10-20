import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1011 (owner 2026-10-19, items 3, 15, 20, 21). The rail docks are the feet of two sticky rails, so
// where they come to rest is decided by the CSS, and these pins hold the four rulings in place.
const css = readFileSync(new URL('../../../../app/themes/frequency/members-shell.css', import.meta.url), 'utf8')
const shell = readFileSync(new URL('./members-shell.tsx', import.meta.url), 'utf8')
const P = '[data-design="frequency"] [data-kit="members"] '
const rule = (selector: string) => css.match(new RegExp(`${(P + selector).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1]

describe('the rail docks rest on the footer', () => {
  it('puts the page-end breathing room inside the centre column, so the rails run to the footer', () => {
    expect(rule('.fqm-body')).toMatch(/padding:24px 40px 0;/)
    expect(css).toContain(`${P}.fqm-center{padding-bottom:160px}`)
    expect(rule('.fqm-body[data-edge] .fqm-center')).toBe('padding-bottom:0')
  })

  it('pushes both docks up by the open footer\'s lift', () => {
    expect(rule('.fqm-rail')).toContain('height:calc(100vh - 132px - var(--fq-foot-lift, 0px))')
    expect(rule('.fqm-console-dock')).toContain('bottom:calc(20px + var(--fq-foot-lift, 0px))')
  })

  it('lifts an open dock panel above the sticky header instead of letting the header cut it', () => {
    expect(rule('.fqm-body:has(.fqm-rise[data-open])')).toBe('z-index:46')
  })

  it('makes only the left dock more solid; the right dock keeps its closed look', () => {
    expect(rule('.fqm-rail-l .fqm-rise-card')).toMatch(/97%/)
    expect(rule('.fqm-rail-l .fqm-tab')).toMatch(/97%/)
    expect(css).not.toContain(`${P}.fqm-rail-r .fqm-tab{`)
  })

  it('lists the critical doors before the site map in the You panel', () => {
    const foot = shell.slice(shell.indexOf('className="fqm-you-foot"'))
    const order = ['/feed', '/settings', '/notifications', '/help', '/site-map'].map((h) => foot.indexOf(`href="${h}"`))
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
