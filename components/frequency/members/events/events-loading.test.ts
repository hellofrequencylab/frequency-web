import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1010: the Events wait must open on the same header the page renders. When the page moved to the
// plain shared header (`ev-hero is-plain`) the skeleton kept the bare `ev-hero`, the retired photo band
// on the ink fill, so every cold open of /events flashed a black block where the header used to be.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const heroClass = (src: string) => src.match(/className="(ev-hero[^"]*)"/)?.[1]

describe('Events loading header', () => {
  it('uses the same header class as the Events page', () => {
    const page = heroClass(read('./events-body.tsx'))
    const wait = heroClass(read('./events-loading.tsx'))
    expect(page).toBe('ev-hero is-plain')
    expect(wait).toBe(page)
  })

  it('keeps the light skeleton bars inside the plain header', () => {
    const css = read('../../../../app/themes/frequency/members-events.css')
    expect(css).not.toMatch(/\[data-kit="members"\] \.ev-hero \.ev-skel-bar/)
    expect(css).toContain('.ev-hero:not(.is-plain) .ev-skel-bar')
  })
})
