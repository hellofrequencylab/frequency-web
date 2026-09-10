import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLATFORM_HANDLE, isPlatformAccount, showsOrganizerCredit } from './platform-credit'

describe('the house account is not a byline (ADR-1311)', () => {
  it('recognises the platform handle however it is cased or padded', () => {
    for (const h of ['frequency', 'Frequency', 'FREQUENCY', '  frequency  ']) {
      expect(isPlatformAccount(h)).toBe(true)
    }
  })

  it('leaves every real member alone — including names that merely contain it', () => {
    for (const h of ['danieltyack', 'frequencylab', 'thefrequency', 'freq', '']) {
      expect(isPlatformAccount(h)).toBe(false)
    }
    expect(isPlatformAccount(null)).toBe(false)
    expect(isPlatformAccount(undefined)).toBe(false)
  })

  it('matches on the HANDLE, never the display name', () => {
    // A member may legitimately call themselves "Frequency"; the handle is the identity.
    expect(showsOrganizerCredit({ handle: 'daniel', display_name: 'Frequency' } as never)).toBe(true)
    expect(showsOrganizerCredit({ handle: PLATFORM_HANDLE, display_name: 'Anything' } as never)).toBe(false)
  })

  it('prints no organizer credit for the house account or for no organizer at all', () => {
    expect(showsOrganizerCredit(null)).toBe(false)
    expect(showsOrganizerCredit(undefined)).toBe(false)
    expect(showsOrganizerCredit({ handle: 'frequency' })).toBe(false)
    expect(showsOrganizerCredit({ handle: 'royaltemple' })).toBe(true)
  })
})

// ── THE TWO READERS AGREE, AND NEITHER RE-DECIDES ────────────────────────────────────────────────
//
// The whole point of the module is that the identity line and the Host rail card give one answer.
// A source-shape guard rather than a render test: the failure being prevented is a future edit that
// re-inlines `host.display_name` beside the words "organized by" in one of the two places and lets
// them drift apart again — which is what they did before this existed.
describe('both credit surfaces consult the shared answer', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  // 🔴 STRIP THE COMMENTS FIRST. Both files EXPLAIN this rule in prose directly above the code that
  // obeys it, and the words "Organized by" inside that prose are not a credit — they are the note
  // saying why there isn't one. Matching raw source failed on its own documentation, which is the
  // shape-not-truth trap this repo names in four ADRs, arriving from the opposite direction.
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|\s)\/\/.*$/gm, '')

  it('the event page and the host rail card both gate on showsOrganizerCredit', () => {
    for (const f of ['app/(main)/events/[slug]/page.tsx', 'components/widgets/events/host-cohost-section.tsx']) {
      const src = code(read(f))
      expect(src).toContain('showsOrganizerCredit')
      // An "organized by" that renders without the gate above it is the drift this pins.
      const hits = [...src.matchAll(/organized by/gi)]
      expect(hits.length).toBeGreaterThan(0)
      for (const m of hits) {
        expect(src.slice(Math.max(0, m.index - 400), m.index)).toContain('showsOrganizerCredit')
      }
    }
  })

  it('the poster credit no longer resolves the @frequency brand row at all', () => {
    const page = read('app/(main)/events/[slug]/page.tsx')
    // The brand lookup and its fallback constant are gone, not merely unused: a resolved brand row
    // sitting in scope is how "Posted by Frequency" comes back by accident.
    expect(page).not.toContain('BRAND_CREDIT')
    expect(page).not.toContain('brandRow')
  })
})
