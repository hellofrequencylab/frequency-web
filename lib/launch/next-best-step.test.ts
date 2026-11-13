import { describe, expect, it } from 'vitest'
import { nextBestStep } from './next-best-step'
import { inventorySections } from './inventory'
import type { InventorySection } from './overview'
import type { LaunchRows } from './done-checks'

const rows = (over: Partial<LaunchRows> = {}): LaunchRows => ({
  preferences: {}, tagline: null, about: null, eventCount: 0, circleCount: 0, journeyCount: 0, contactCount: 0, payoutsReady: false, ...over,
})
const sections = (over: Partial<LaunchRows> = {}, extended = false) =>
  inventorySections({ rows: rows(over), spaceName: 'Dune Yoga', coverImageUrl: null, logoUrl: null, extended, hrefs: { 'space.booking': '/spaces/dune/manage/booking' } })
const mark = (list: InventorySection[], ids: InventorySection['id'][], state: 'done' | 'todo'): InventorySection[] =>
  list.map((s) => (ids.includes(s.id) ? { ...s, items: s.items.map((i) => ({ ...i, state })) } : s))
const allDone = (): InventorySection[] => mark(sections(), ['spotlight', 'space', 'website', 'email', 'schedule', 'circle', 'journey', 'paid'], 'done')

describe('nextBestStep', () => {
  it('starts at the top of the wizard: publish the Spotlight', () => {
    const n = nextBestStep(sections())
    expect(n?.id).toBe('sp-live')
    expect(n?.href).toBe('/launch/step/spotlight')
    expect(n?.why.length).toBeGreaterThan(10)
  })

  it('moves on once a step is done, in the wizard order', () => {
    expect(nextBestStep(sections({ preferences: { spotlight: { published: true } } }))?.id).toBe('sp-words')
    expect(nextBestStep(mark(sections(), ['spotlight'], 'done'))?.id).toBe('sc-tag')
  })

  it('is null when everything is done', () => {
    expect(nextBestStep(allDone())).toBeNull()
  })

  it('never offers a skipped item, and moves past it', () => {
    const s = allDone().map((x) => (x.id === 'space' ? { ...x, items: x.items.map((i) => (i.id === 'sc-cover' ? { ...i, state: 'todo' as const, skipped: true } : i)) } : x))
    expect(nextBestStep(s)).toBeNull()
    expect(nextBestStep(mark(s, ['schedule'], 'todo'))?.id).toBe('c-first')
  })

  it('follows the niche order and hides Journey where the wizard does', () => {
    const base = mark(allDone(), ['circle', 'schedule', 'journey'], 'todo')
    expect(nextBestStep(base)?.id).toBe('c-first')
    expect(nextBestStep(base, { niche: 'coaches' })?.id).toBe('ci-first')
    const journeyOnly = mark(allDone(), ['journey'], 'todo')
    expect(nextBestStep(journeyOnly, { niche: 'venues' })).toBeNull()
    expect(nextBestStep(journeyOnly, { niche: 'venues', intents: ['programs'] })?.id).toBe('j-first')
  })

  it('reaches the Setup items after the launch steps, using the tool link', () => {
    const s = mark(sections({ extras: { bookingTimes: 0, membershipTiers: 0, donationAsks: 0, products: 0, campaigns: 0, campaignsSent: 0, captureLinks: 0, automations: 0, offerPages: 0 } }, true), ['spotlight', 'space', 'website', 'email', 'schedule', 'circle', 'journey', 'paid'], 'done')
    const n = nextBestStep(s)
    expect(n?.id).toBe('m-booking')
    expect(n?.href).toBe('/spaces/dune/manage/booking')
  })

  it('ignores the owner Personal section', () => {
    const s: InventorySection[] = [...allDone(), { id: 'personal', title: 'Personal', items: [{ id: 'f-x', label: 'X', state: 'todo' }] }]
    expect(nextBestStep(s)).toBeNull()
  })

  it('keeps the copy plain: no em dashes, no exclamation marks, no digits', () => {
    const extras = { bookingTimes: 0, membershipTiers: 0, donationAsks: 0, products: 0, campaigns: 0, campaignsSent: 0, captureLinks: 0, automations: 0, offerPages: 0 }
    for (const s of sections({ extras }, true)) {
      for (const i of s.items) {
        const t = nextBestStep([{ ...s, items: [{ ...i, state: 'todo' }] }])
        expect(`${t?.label} ${t?.why}`).not.toMatch(/[—–!\d]/)
      }
    }
  })
})
