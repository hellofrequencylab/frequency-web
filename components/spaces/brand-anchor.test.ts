import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  readLogoBackdrop,
  nextLogoBackdropPreferences,
} from '@/app/(main)/spaces/[slug]/manage/layout/preferences'

// ── THE LOGO BACKDROP ────────────────────────────────────────────────────────────────────────────
// The brand chip draws the operator's logo on a white plate inside a ring with a shadow. That plate is
// what keeps a DARK logo visible on a DARK cover, and it is also wrong for a mark exported with a
// transparent background — which gets a white card it never asked for.
//
// The owner's ask (2026-09-02) was to make the bare version POSSIBLE, and the ruling was an explicit
// operator toggle rather than sniffing the file extension. This file pins both halves of that: the
// reader's default-safety, and the fact that the three pieces of the plate are removed TOGETHER.

const SOURCE = readFileSync(new URL('./brand-anchor.tsx', import.meta.url), 'utf8')

describe('the reader is default-safe, so an untouched Space renders exactly as before', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', [] as unknown],
    ['a string', 'none' as unknown],
    ['an empty blob', {}],
    ['an unknown value', { logoBackdrop: 'transparent' }],
    ['a non-string value', { logoBackdrop: 1 }],
  ])('falls back to plate for %s', (_label, input) => {
    expect(readLogoBackdrop(input)).toBe('plate')
  })

  it('reads the one value that turns the plate off', () => {
    expect(readLogoBackdrop({ logoBackdrop: 'none' })).toBe('none')
  })
})

describe('the write is non-destructive and stays sparse', () => {
  it('preserves every other preference', () => {
    const next = nextLogoBackdropPreferences({ theme: 'editorial', coverScrim: 'blend' }, 'none')
    expect(next).toEqual({ theme: 'editorial', coverScrim: 'blend', logoBackdrop: 'none' })
  })

  // The default DROPS the key rather than writing 'plate', matching coverFocus. A Space that toggles
  // off and back on must end up byte-identical to one that never touched the control.
  it('drops the key when the default is chosen', () => {
    const next = nextLogoBackdropPreferences({ theme: 'bold', logoBackdrop: 'none' }, 'plate')
    expect(next).toEqual({ theme: 'bold' })
    expect('logoBackdrop' in next).toBe(false)
  })

  it('round-trips through the reader', () => {
    for (const v of ['plate', 'none'] as const) {
      expect(readLogoBackdrop(nextLogoBackdropPreferences({}, v))).toBe(v)
    }
  })
})

describe('the plate is one decision, not three', () => {
  // 🔴 Dropping only `bg-surface` would leave a 4px `border-surface` ring drawing a white square
  // around a logo that asked for no square — the reported defect with an extra step. The three
  // pieces live in ONE string so they cannot be separated by a later edit.
  it('removes background, ring and shadow together', () => {
    const plate = SOURCE.match(/const plate = bare \? '' : '([^']+)'/)?.[1]
    expect(plate, 'the plate string must be one literal, not assembled per-piece').toBeTruthy()
    for (const piece of ['border-4', 'border-surface', 'bg-surface', 'lift-1']) {
      expect(plate).toContain(piece)
    }
  })

  it('keeps the contrast halo when the plate is gone', () => {
    // With no plate the halo is the ONLY edge between the image and the cover photo, so it must
    // apply to every format — including the opaque-photo path that never needed it before.
    expect(SOURCE).toContain('(bare || !isOpaquePhoto) && halo')
  })

  it('leaves the initials fallback plated at both settings', () => {
    // There is no artwork to show bare; the plate IS the chip and carries the letters' contrast.
    const fallback = SOURCE.slice(SOURCE.lastIndexOf('return ('))
    expect(fallback).toContain('bg-surface-elevated')
    expect(fallback).not.toContain('plate')
  })
})

describe('every surface that draws the chip passes the viewer the same answer', () => {
  // The chip is shared so the live hero and the public claim page cannot drift. A call site that
  // forgets the prop silently renders the default, which reads as "the toggle did nothing".
  it.each([
    ['the profile hero + header', '../../app/(main)/spaces/[slug]/(profile)/layout.tsx'],
    ['the public claim page', '../../app/spaces/claim/[token]/page.tsx'],
  ])('%s reads the preference and passes it', (_label, path) => {
    const src = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(src).toContain('readLogoBackdrop(space.preferences)')
    for (const tag of src.match(/<BrandAnchor[^>]*>/g) ?? []) {
      expect(tag).toContain('backdrop={logoBackdrop}')
    }
  })
})

describe('the directory card draws the SAME chip, not a copy of it', () => {
  // 🔴 What this pins, from the reading that prompted it: the card used to hand-roll the chip with
  // `object-contain` on an always-on `bg-surface` plate. A photo avatar therefore rendered letterboxed
  // between white bars, and a Space that had turned the plate OFF still got a white square around its
  // transparent mark on every card in the directory — the first place a visitor meets it. Composing
  // BrandAnchor is the fix; re-authoring the treatment locally is the regression.
  const CARD = readFileSync(new URL('./space-card.tsx', import.meta.url), 'utf8')

  it('composes BrandAnchor at the card size', () => {
    expect(CARD).toContain("import { BrandAnchor }")
    expect(CARD).toContain('size="card"')
  })

  it('passes the operator\'s backdrop choice through, so the toggle reaches the card too', () => {
    expect(CARD).toContain('backdrop={space.logoBackdrop}')
    // The card is a pure presenter; the READ that answers it lives in the directory query.
    const discovery = readFileSync(new URL('../../lib/spaces/discovery.ts', import.meta.url), 'utf8')
    expect(discovery).toContain('logoBackdrop: readLogoBackdrop(r.preferences)')
  })

  it('does not re-author the fit / plate treatment locally', () => {
    // The exact strings that used to stand in the card's own SpaceLogo. Naming them is what stops a
    // well-meaning "just style the little logo here" from reintroducing both defects at once.
    expect(CARD).not.toMatch(/function SpaceLogo\b/)
    // The retired chip, named so a "restore the little logo" edit cannot quietly bring it back.
    expect(CARD).not.toContain('rounded-control border border-border bg-surface')
    // Exactly ONE raw <img> is left in the card — the cover. The logo's is BrandAnchor's now.
    expect(CARD.match(/no-img-element/g) ?? []).toHaveLength(1)
  })

  it('scales only the box between the two sizes', () => {
    // Fit, halo, plate and radius are decided once for both; a size that also changed one of those
    // would be the old drift with a nicer name.
    const sizes = SOURCE.slice(SOURCE.indexOf('const SIZES'), SOURCE.indexOf('export function BrandAnchor'))
    for (const banned of ['object-', 'bg-surface', 'border-', 'rounded-']) {
      expect(sizes, `the size map must not carry ${banned}`).not.toContain(banned)
    }
  })
})
