import { describe, expect, it } from 'vitest'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { SETUP_ITEM_MODULES, setupSections } from './setup-items'

// Every Space tool either has a Setup item or says why it does not. A new tool in the module catalog fails this test
// until someone decides which (LIVE-1916), so the Get Started list cannot quietly fall behind the product.

// Covered by the launch's own steps (lib/launch/inventory.ts): Space page, Spotlight, website, people, schedule, Circle, Journey, payouts.
const LAUNCH_COVERED: Record<string, string> = {
  'space.basics': 'Space section: name, tagline, About, cover, logo',
  'space.calendar': 'Schedule: first event',
  'space.circles': 'Circle: open a Circle',
  'space.journeys': 'Journey: first Journey',
  'space.crm': 'Email: people to write to',
  'space.payments': 'Get paid: payouts ready',
  'space.layout': 'Website: a website for your Space',
}

const EXEMPT: Record<string, string> = {
  'space.conversations': 'an inbox that fills itself; nothing to set up first',
  'space.coach': 'a preference, not a setup step',
  'space.reviews': 'fills as members review; nothing to do first',
  'space.leads': 'a view of what capture links collect',
  'space.shared': 'a view of what the team shares',
  'space.collaborators': 'optional, invited by the Space when wanted',
  'space.offerings': 'the Money box itself; its tools have their own items',
  'space.content': 'the Gather box itself; its tools have their own items',
  'space.practices': 'optional content, part of Journeys',
  'space.program': 'an operating model choice, not a setup step',
  'space.leadership': 'a yearly view for leaders',
  'space.scanners': 'check-in, used at an event',
  'space.airwaves': 'optional media',
  'space.loom': 'a library, filled by photo items',
  'space.reach': 'the Reach box itself; its tools have their own items',
  'space.reachreceipt': 'a report of what the network sent',
  'space.listings': 'answers an invitation from a Collective',
  'space.marketing': 'the email designer, reached through the campaign item',
  'space.emailstyle': 'brand colours, reached through the campaign item',
  'space.billing': 'the plan page; the upgrade moments cover it',
  'space.chapters': 'Network Spaces only',
  'space.danger': 'never a setup step',
  'space.people': 'the team page; invites happen when a team exists',
}

describe('Setup item coverage of the Space tool catalog', () => {
  const covered = new Set<string>([...Object.values(SETUP_ITEM_MODULES), ...Object.keys(LAUNCH_COVERED)])
  const exempt = new Set(Object.keys(EXEMPT))

  it('every Space tool has a Setup item or a stated reason it does not', () => {
    const missing = SPACE_MODULES.map((m) => m.id).filter((id) => !covered.has(id) && !exempt.has(id))
    expect(missing, `decide a Setup item or an exemption for: ${missing.join(', ')}`).toEqual([])
  })
  it('names no tool that does not exist, and never both covers and exempts one', () => {
    const ids = new Set(SPACE_MODULES.map((m) => m.id))
    expect([...covered, ...exempt].filter((id) => !ids.has(id))).toEqual([])
    expect([...exempt].filter((id) => covered.has(id))).toEqual([])
  })
  it('every Setup item opens a tool that has a link', () => {
    const linked = new Set(SPACE_MODULES.filter((m) => m.deepLink).map((m) => m.id))
    for (const id of Object.values(SETUP_ITEM_MODULES)) expect(linked.has(id)).toBe(true)
  })
})

describe('setupSections', () => {
  const none = { bookingTimes: 0, membershipTiers: 0, donationAsks: 0, products: 0, campaigns: 0, campaignsSent: 0, captureLinks: 0, automations: 0 }
  const hrefs = { 'space.booking': '/spaces/a/settings/offerings#booking', 'space.comms': '/spaces/a/settings/email' }
  it('ticks only what a record says and opens the tool', () => {
    const s = setupSections({ ...none, bookingTimes: 3, campaigns: 1 }, hrefs)
    const by = Object.fromEntries(s.flatMap((x) => x.items).map((i) => [i.id, i]))
    expect(by['m-booking']).toMatchObject({ state: 'done', found: '3 times set', href: '/spaces/a/settings/offerings#booking' })
    expect(by['r-campaign']).toMatchObject({ state: 'done', found: '1 drafted' })
    expect(by['r-sent']).toMatchObject({ state: 'todo', href: '/spaces/a/settings/email' })
    expect(s.map((x) => x.id)).toEqual(['money', 'reach'])
  })
})
