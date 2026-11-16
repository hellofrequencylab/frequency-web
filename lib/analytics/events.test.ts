import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ANALYTICS_EVENTS, isTrackedEvent, isClientEvent } from './events'
import { sanitizeProps } from './track'
import { pixelAllowsEvent } from './sanitize'

describe('analytics taxonomy', () => {
  it('has unique, namespaced event names', () => {
    const names = ANALYTICS_EVENTS.map((e) => e.name)
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n).toMatch(/^[a-z]+\.[a-z_]+$/)
  })

  it('isTrackedEvent recognizes registered events only', () => {
    expect(isTrackedEvent('nav.page_view')).toBe(true)
    expect(isTrackedEvent('totally.madeup')).toBe(false)
  })

  // 2026-09-05 (scan2 L4-03). The referral-activation moment is emitted by lib/qr/referral.ts and
  // was silently dropped by track() because the name was never registered. Server-only: a client
  // POST must not be able to mint a referral credit event.
  it('registers qr.referral_activated as a server-only lifecycle event', () => {
    expect(isTrackedEvent('qr.referral_activated')).toBe(true)
    expect(isClientEvent('qr.referral_activated')).toBe(false)
  })

  it('isClientEvent blocks server-authoritative events from client emit', () => {
    expect(isClientEvent('nav.page_view')).toBe(true)
    expect(isClientEvent('feature.used')).toBe(true)
    expect(isClientEvent('practice.adopted')).toBe(false) // server-authoritative
    expect(isClientEvent('circle.joined')).toBe(false)
    expect(isClientEvent('unknown.event')).toBe(false)
  })

  // LIVE-348. track() silently drops an unregistered name. Purchase is server-only so a
  // client POST cannot mint a conversion; the buy click is the one client-emittable step.
  it('registers commerce.purchase as server-only and checkout_started as client-emittable', () => {
    expect(isTrackedEvent('commerce.purchase')).toBe(true)
    expect(isClientEvent('commerce.purchase')).toBe(false)
    expect(isTrackedEvent('commerce.checkout_started')).toBe(true)
    expect(isClientEvent('commerce.checkout_started')).toBe(true)
    expect(isTrackedEvent('shop.order_completed')).toBe(true)
    expect(isClientEvent('shop.order_completed')).toBe(false)
  })

  it('the buy click emits commerce.checkout_started on BuyButton and ticket controls', () => {
    const files = [
      'app/(main)/marketplace/buy-button.tsx',
      'app/(main)/events/[slug]/ticket-button.tsx',
      'components/events/rsvp-payment-flow.tsx',
      'components/events/guest-ticket-form.tsx',
    ]
    const missing = files.filter((f) => !readFileSync(f, 'utf8').includes("trackClient('commerce.checkout_started'"))
    expect(missing).toEqual([])
  })
})

describe('first-party-only events (PROG-E8B)', () => {
  it('registers accept and dismiss for the questions Vera asks as client-emittable feature events', () => {
    for (const name of ['editor.vera_question_accepted', 'editor.vera_question_dismissed']) {
      expect(isTrackedEvent(name)).toBe(true)
      expect(isClientEvent(name)).toBe(true)
      expect(ANALYTICS_EVENTS.find((e) => e.name === name)?.category).toBe('feature')
    }
  })

  it('keeps every registered editor event off the pixels, and leaves ordinary events alone', () => {
    const editor = ANALYTICS_EVENTS.filter((e) => e.name.startsWith('editor.'))
    expect(editor.length).toBeGreaterThanOrEqual(2)
    for (const e of editor) expect(pixelAllowsEvent(e.name)).toBe(false)
    expect(pixelAllowsEvent('feature.used')).toBe(true)
    expect(pixelAllowsEvent('nav.page_view')).toBe(true)
  })
})

describe('sanitizeProps', () => {
  it('keeps primitives, drops objects/functions, truncates strings', () => {
    const out = sanitizeProps({ a: 1, b: true, c: 'x'.repeat(1000), d: { nested: 1 }, e: null })
    expect(out.a).toBe(1)
    expect(out.b).toBe(true)
    expect((out.c as string).length).toBe(500)
    expect('d' in out).toBe(false)
    expect('e' in out).toBe(false)
  })

  it('caps the number of keys', () => {
    const big = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))
    expect(Object.keys(sanitizeProps(big)).length).toBe(20)
  })

  it('returns empty for non-objects', () => {
    expect(sanitizeProps(null)).toEqual({})
    expect(sanitizeProps('nope')).toEqual({})
  })
})
