import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CIRCLE_HUB_SECTIONS, DEFAULT_CIRCLE_HUB_SECTION, asCircleHubSection } from './hub'

// The circle-side "add an already created event" door (the owner ask) + the hub's tab order.
//
// The trap the action tests lock in is ADR-883's: a placement write that hand-rolls its column
// set drifts from what the product reads (the bare scope pair, the typed arc column, the
// circle's Space), and a one-sided gate lets someone move an event they do not manage onto a
// circle they do (or the reverse). The source-shape idiom mirrors lib/events/placement.test.ts.

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')

describe('attachEventToCircleAction — both authorities, re-checked server-side (ADR-274)', () => {
  const src = read('events-actions.ts')

  it('gates on circle.editSettings for THIS circle, the same rule that approves a placement', () => {
    expect(src).toContain('getCircleCapabilities')
    expect(src).toContain("circleCaps.has('circle.editSettings')")
  })

  it('gates on event.editSettings for the event, the same rule the event-side editor uses', () => {
    expect(src).toContain('getEventCapabilities')
    expect(src).toContain("eventCaps.has('event.editSettings')")
  })

  it('refuses to double-place: an event already on the circle is recognized by the shared rule', () => {
    // belongsToCircle is the ONE membership predicate (creation scope OR live placement);
    // an inline scope_circle_id comparison would miss creation-scoped events.
    expect(src).toContain('belongsToCircle')
  })
})

describe('attachEventToCircleAction — the write routes through the ADR-883 seam', () => {
  const src = read('events-actions.ts')

  it('writes the tie through livePlacementPatch, never a hand-rolled column set', () => {
    expect(src).toContain('livePlacementPatch')
    // The old inline patch is what made a circle placement invisible (ADR-883).
    expect(src).not.toMatch(/update\(\s*\{\s*scope_circle_id:/)
    expect(src).not.toMatch(/scope_type:\s*'circle'/)
    expect(src).not.toMatch(/scope_id:\s*circleId/)
  })

  it("carries the circle's Space into the patch (ADR-857) via spaceIdForCircle", () => {
    expect(src).toContain('spaceIdForCircle')
    expect(src).toContain('circleSpaceId')
  })

  it('revalidates every surface the move touches: circle, hub, event, index, Channel, Space', () => {
    expect(src).toContain('revalidatePath(`/circles/${slug}`)')
    expect(src).toContain('revalidatePath(`/circles/${slug}/manage`)')
    expect(src).toContain('revalidatePath(`/events/${event.slug}`)')
    expect(src).toContain("revalidatePath('/events')")
    expect(src).toContain('revalidatePath(`/channels/${channelSlug}`)')
    expect(src).toContain('revalidatePath(`/spaces/${spaceSlug}`)')
  })
})

describe('the picker offers only what the gate admits (ADR-883 §3: one rule shapes offer + law)', () => {
  const src = read('events-section.tsx')

  it('confirms every candidate through getEventCapabilities → event.editSettings', () => {
    expect(src).toContain('getEventCapabilities')
    expect(src).toContain("caps.has('event.editSettings')")
  })

  it('offers only upcoming, published, not-cancelled events', () => {
    expect(src).toContain("gte('starts_at'")
    expect(src).toContain("eq('status', 'published')")
    expect(src).toContain('is_cancelled')
  })

  it('excludes events already on this circle via the shared membership rule', () => {
    expect(src).toContain('!belongsToCircle(e, circleId)')
  })

  it('posts to the server action that re-checks both authorities', () => {
    expect(src).toContain('attachEventToCircleAction.bind(null, circleId, slug)')
  })
})

describe('the hub tab order (owner directive: the message center leads Manage)', () => {
  it('Home is the FIRST tab and the default landing', () => {
    expect(CIRCLE_HUB_SECTIONS[0]?.key).toBe('home')
    expect(DEFAULT_CIRCLE_HUB_SECTION).toBe('home')
  })

  it('an absent or unknown ?section= lands on Home, so every entry link reaches the message center', () => {
    expect(asCircleHubSection(undefined)).toBe('home')
    expect(asCircleHubSection(null)).toBe('home')
    expect(asCircleHubSection('')).toBe('home')
    expect(asCircleHubSection('nonsense')).toBe('home')
  })

  it('the Home tab renders the message center (the circle.crm master-detail, ADR-827/828)', () => {
    const src = read('page.tsx')
    // The message center must sit inside the Home branch, not behind a deeper tab.
    const homeBranch = src.slice(src.indexOf("section === 'home'"), src.indexOf("section === 'events'"))
    expect(homeBranch).toContain('CircleMemberViewer')
  })

  it('events and settings stay shareable ?section= values', () => {
    expect(asCircleHubSection('events')).toBe('events')
    expect(asCircleHubSection('settings')).toBe('settings')
  })
})
