import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1043, items 3 and 22 of the 2026-10-19 design list. The open Vera panel and the phone tab bar rest on
// the open mega footer like the two docks do, and the phone drawer's Your Circles draws each Circle's
// picture, the same mark as the left rail.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('docks follow the footer lift (LIVE-1043)', () => {
  const css = read('../../../../app/themes/frequency/members-shell.css')

  it('lifts the Vera panel box from md', () => {
    expect(read('../../../vera/vera-launcher.tsx')).toContain("'fqd-wrap fixed")
    expect(css).toMatch(/\.fqd-wrap\{bottom:calc\(24px \+ var\(--fq-foot-lift, 0px\)\)/)
  })

  it('lifts the phone tab bar', () => {
    expect(css).toContain('bottom:calc(10px + env(safe-area-inset-bottom) + var(--fq-foot-lift, 0px))')
  })
})

describe('phone drawer Circle pictures (LIVE-1043)', () => {
  it('passes the picture through and draws CircleMark', () => {
    expect(read('./members-shell.tsx')).toMatch(/notices: c\.notices, image: c\.image \}/)
    const header = read('./header.tsx')
    expect(header).toContain('<CircleMark label={c.label} image={c.image} />')
    expect(header).not.toContain("row(c.href, c.label, 'circle', c.notices)")
  })
})
