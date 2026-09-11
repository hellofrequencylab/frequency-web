import { describe, it, expect } from 'vitest'
import {
  sectionForModule,
  isSettingsModule,
  asHubSection,
  hubSearchItems,
  SPACE_HUB_SECTIONS,
  SPACE_HUB_SECTION_LABEL,
} from './space-hub'
import { SPACE_MODULES, spaceModuleById, type SpaceHubSection, type SpaceModule } from './space-modules'

// ADR-785: the four-category Manage hub + the header-level Profile & Settings surface. Every module maps to
// exactly one section OR is explicitly excluded — nothing is orphaned.
//
// ADR-1313: the section is DECLARED on the catalog row (`SpaceModule.hub`), never inferred. `sectionForModule`
// used to be four hard-coded id lists with a `return 'offerings'` catch-all, and the test below used to assert
// that every module "maps to a section or is explicitly excluded" — which the catch-all made unfailable. It
// asserts something a catch-all cannot satisfy now: which rows are excluded, EXACTLY, and that nobody has
// declared the one tab that renders no cards.

describe('sectionForModule (the hub IA)', () => {
  it('excludes EXACTLY the three rows the hub deliberately has no card for', () => {
    // Page editing lives on the admin rail. The Content BOX and the Offerings and money BOX are the Content &
    // Programs and Offerings & Money TABS themselves (ADR-846, ADR-1313), so a card for either would link
    // back to the tab you are standing on. SET EQUALITY, not a per-row lookup: a fourth row quietly falling
    // out of the hub fails here, which the old "excluded rows are null" shape could not catch.
    const excluded = SPACE_MODULES.filter((m) => sectionForModule(m) === null).map((m) => m.id).sort()
    expect(excluded).toEqual(['space.content', 'space.layout', 'space.offerings'].sort())
  })

  it('lands every other module on one of the five card-bearing tabs', () => {
    const KNOWN = new Set(['resonance', 'marketing', 'offerings', 'programs', 'settings'])
    for (const m of SPACE_MODULES) {
      const section = sectionForModule(m)
      if (section === null) continue
      expect(KNOWN.has(section), `${m.id} landed in unknown section ${section}`).toBe(true)
    }
  })

  it('lets no row declare the Home tab, which renders an embed and never a card grid', () => {
    // `hub: 'dashboard'` is TYPEABLE — ADR-1313 specifies the field as the hub's own tab union, verbatim —
    // but the Home tab renders `SpaceManageDashboard` and never the card grid (console.tsx CARD_SECTIONS),
    // so a row declaring it would render NOWHERE. This is the runtime half of that guard.
    const onHome = SPACE_MODULES.filter((m) => m.hub === 'dashboard').map((m) => m.id)
    expect(onHome, 'a row on the Home tab renders no card anywhere').toEqual([])
  })

  it('routes the CRM relationship + conversations cluster to Resonance', () => {
    // space.conversations is the ticketed inbox (the retired space.inbox's successor). Automation joined
    // it in ADR-1313: it is owned by the CRM box and used to be hard-coded into Marketing.
    // space.messages (Message center) was the third of that cluster and is RETIRED (LIVE-293): its
    // audience picker moved to Email, its DM and Dispatch lanes were dropped, and its Dispatch
    // publishing moved to the post box (LIVE-295).
    for (const id of [
      'space.crm',
      'space.conversations',
      'space.automation',
      'space.leads',
      'space.doors',
      'space.shared',
    ]) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('resonance')
    }
  })

  it('routes the outbound reach surfaces to Marketing (the email trio + QR codes)', () => {
    // Automation LEFT this set in ADR-1313: it is drip over your own contacts, owned by the CRM box, and
    // being listed here while its parent sat in Resonance is the orphan class the declared hub removes.
    for (const id of ['space.comms', 'space.marketing', 'space.emailstyle', 'space.reach']) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('marketing')
    }
  })

  it('routes every service inside the Offerings and money box to Offerings & Money', () => {
    // space.enroll / space.tickets / space.checkin were three more rows here until LIVE-226. The BOX itself
    // (space.offerings) left the tab in ADR-1313 — it was rendering as a peer beside its own children,
    // linking back to the tab it sat on.
    for (const id of ['space.booking', 'space.memberships', 'space.donations', 'space.payments', 'space.services']) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('offerings')
    }
  })

  it('routes the practitioner content, the Calendar and Your reach to Content & Programs', () => {
    // Calendar and Your reach moved here on the owner ruling in ADR-1313 (both used to fall into the
    // Offerings catch-all).
    for (const id of [
      'space.practices',
      'space.journeys',
      'space.circles',
      'space.program',
      'space.airwaves',
      'space.loom',
      'space.calendar',
      'space.reachreceipt',
    ]) {
      expect(sectionForModule(spaceModuleById(id)!)).toBe('programs')
    }
  })

  it('puts identity + Team + Reviews + Collaborators + Plan & Billing + Danger on Profile & Settings', () => {
    // Collaborators joined on the owner ruling in ADR-1313, matching the box that already owned it
    // (parent: space.people). It had been falling into the Offerings catch-all.
    for (const id of [
      'space.basics',
      'space.people',
      'space.collaborators',
      'space.reviews',
      'space.billing',
      'space.danger',
    ]) {
      expect(isSettingsModule(spaceModuleById(id)!), `${id} belongs to Profile & Settings`).toBe(true)
    }
    // Profile & Settings is a real hub tab (ADR-788) so Plan & Billing is reachable in one tap.
    expect(SPACE_HUB_SECTIONS.some((s) => s.key === 'settings')).toBe(true)
    expect(SPACE_HUB_SECTIONS[SPACE_HUB_SECTIONS.length - 1].key).toBe('settings') // trails the browse tabs
  })
})

// ── A tool files under its box's tab (ADR-1313) ───────────────────────────────────────────────────────
//
// The defect this replaces: `space.automation` was hard-coded into the Marketing list while its parent box
// `space.crm` sat in Resonance, so the tool rendered a tab away from the box that owns it. Nothing noticed,
// because the old resolver's four id lists and the `parent` field were two independent hand-kept records of
// the same fact. With the tab declared per row they are still two records — so this is the guard that keeps
// them agreeing, by CONSTRUCTION rather than by anyone remembering.

/** A box that is EXCLUDED from the hub still stands for a tab: the hub's Content & Programs tab IS the
 *  Content box, and its Offerings & Money tab IS the Offerings and money box (which is exactly why neither
 *  renders a card of its own). Their children file under the tab the box IS.
 *
 *  🔴 This map is the whole difficulty of the guard. Skipping a child whose parent is excluded — the obvious
 *  reading — silently exempts TEN of the eighteen parented rows, and the guard passes the suite while
 *  checking barely half of it. Control (b) below is the proof that it does not. */
const EXCLUDED_BOX_TAB: Readonly<Record<string, SpaceHubSection>> = {
  'space.content': 'programs',
  'space.offerings': 'offerings',
}

/** Rows that deliberately file somewhere other than their box's tab, each with the reason WRITTEN DOWN.
 *  Empty today, and that is the point: a divergence costs a sentence here, so "it just ended up there"
 *  cannot be one. (`space.reachreceipt` is how a divergence is supposed to be resolved — the owner ruled it
 *  moves tabs, so ADR-1313 took its `parent` off rather than granting it an exemption.) */
const HUB_DIVERGENCE_REASONS: Readonly<Record<string, string>> = {}

/** Every complaint about a tool filed away from its box, as a list of readable strings. PURE + total, so the
 *  controls below can feed it a defective catalog and prove it fires. */
function orphanedFromBox(
  modules: readonly SpaceModule[],
  reasons: Readonly<Record<string, string>> = HUB_DIVERGENCE_REASONS,
): string[] {
  const byId = new Map(modules.map((m) => [m.id, m]))
  const out: string[] = []
  for (const m of modules) {
    if (!m.parent) continue
    if (reasons[m.id]) continue
    const box = byId.get(m.parent)
    if (!box) {
      out.push(`${m.id} nests under ${m.parent}, which is not a catalog row`)
      continue
    }
    const boxTab = box.hub === 'none' ? EXCLUDED_BOX_TAB[box.id] : box.hub
    if (!boxTab) {
      out.push(`${m.id} nests under ${box.id}, which is excluded from the hub and stands for no tab`)
      continue
    }
    if (m.hub !== boxTab) {
      out.push(`${m.id} files under ${m.hub}, but its box ${box.id} is on ${boxTab}`)
    }
  }
  return out
}

describe('every tool files under its box (the Automation class, by construction)', () => {
  it('finds no tool filed away from its box in the shipped catalog', () => {
    expect(orphanedFromBox(SPACE_MODULES)).toEqual([])
  })

  it('checks EVERY parented row, including the ten owned by an excluded box', () => {
    // The count is the assertion: it fails if a future edit makes the guard skip a class of row instead of
    // resolving it. Ten of these hang off Content / Offerings and money, which render no card themselves.
    const parented = SPACE_MODULES.filter((m) => m.parent)
    expect(parented.length).toBeGreaterThanOrEqual(18)
    const underExcludedBox = parented.filter((m) => spaceModuleById(m.parent!)!.hub === 'none')
    expect(underExcludedBox.length).toBe(10)
    for (const m of underExcludedBox) {
      expect(EXCLUDED_BOX_TAB[m.parent!], `${m.parent} must stand for a tab`).toBeTruthy()
    }
  })

  // ── CONTROLS: the guard fires ───────────────────────────────────────────────────────────────────────
  //
  // A guard nobody has watched fail is a guard that reads as coverage. Each control feeds it a catalog that
  // is wrong in a specific, historical way and expects the complaint by name.

  /** One shipped row with fields overridden — a defective catalog without touching the real one. */
  const bend = (id: string, over: Partial<SpaceModule>): SpaceModule => ({ ...spaceModuleById(id)!, ...over })

  it('(a) catches the Automation defect exactly as it shipped, and clears the pair that fixed it', () => {
    const crm = spaceModuleById('space.crm')!
    // The defect: Automation hard-coded into the Marketing list, its box left in Resonance.
    const broken = orphanedFromBox([crm, bend('space.automation', { hub: 'marketing' })])
    expect(broken).toHaveLength(1)
    expect(broken[0]).toContain('space.automation')
    expect(broken[0]).toContain('space.crm')
    // The shipped pair, unbent.
    expect(orphanedFromBox([crm, spaceModuleById('space.automation')!])).toEqual([])
  })

  it('(b) catches a child of an EXCLUDED box filed wrongly (the case a naive skip would wave through)', () => {
    const content = spaceModuleById('space.content')!
    expect(content.hub, 'the Content box renders no card of its own').toBe('none')
    const broken = orphanedFromBox([content, bend('space.practices', { hub: 'offerings' })])
    expect(broken).toHaveLength(1)
    expect(broken[0]).toContain('space.practices')
    expect(broken[0]).toContain('programs') // the tab the excluded box stands for
    // Same shape on the other excluded box, which ADR-1313 added.
    const offerings = spaceModuleById('space.offerings')!
    expect(orphanedFromBox([offerings, bend('space.booking', { hub: 'programs' })])).toHaveLength(1)
  })

  it('(c) exempts a row only when the divergence is written down', () => {
    const crm = spaceModuleById('space.crm')!
    const bent = [crm, bend('space.automation', { hub: 'marketing' })]
    expect(orphanedFromBox(bent)).toHaveLength(1)
    expect(orphanedFromBox(bent, { 'space.automation': 'a stated reason' })).toEqual([])
  })

  it('(d) refuses a row whose declared tab has no card grid, or whose box has vanished', () => {
    expect(orphanedFromBox([bend('space.leads', { parent: 'space.gone' })])).toHaveLength(1)
    // A child that declares 'none' is not "excluded", it is unrendered under a box that renders.
    expect(orphanedFromBox([spaceModuleById('space.crm')!, bend('space.leads', { hub: 'none' })])).toHaveLength(1)
  })
})

// THE COMPILE-TIME CONTROL (ADR-1313). The point of `hub` being REQUIRED is that a row which has not chosen
// a tab does not compile — the catch-all became a type error. This holds that error in place: `@ts-expect-error`
// is itself an error when the line below type-checks, so the control fails BOTH ways. Make `hub` optional and
// the unused directive fails; keep it required and the directive is consumed.
const declareRow = (row: SpaceModule): SpaceModule => row
const ROW_WITH_NO_HUB = () =>
  // @ts-expect-error — a catalog row that declares no `hub` tab MUST NOT COMPILE (ADR-1313).
  declareRow({
    id: 'space.fixture',
    label: 'Fixture',
    desc: 'A row that never chose a tab.',
    Icon: spaceModuleById('space.crm')!.Icon,
    family: 'audience',
    slot: 'people',
    gate: { kind: 'always' },
    featureKey: null,
    render: 'link',
    order: 999,
    tier: 'extra',
  })

describe('the hub tab is REQUIRED on a catalog row (compile-time control)', () => {
  it('holds a row with no hub under @ts-expect-error, which is an error when unused', () => {
    // The runtime half is trivial; the assertion that matters is made by `tsc`, above, on every PR.
    expect(ROW_WITH_NO_HUB().id).toBe('space.fixture')
    expect(ROW_WITH_NO_HUB().hub).toBeUndefined()
  })
})

describe('asHubSection', () => {
  it('defaults to the command-center Home and validates the section param', () => {
    expect(asHubSection(undefined)).toBe('dashboard') // Home is the default landing (ADR-796)
    expect(asHubSection('bogus')).toBe('dashboard')
    expect(asHubSection('resonance')).toBe('resonance')
    expect(asHubSection('marketing')).toBe('marketing')
    expect(asHubSection('settings')).toBe('settings') // Profile & Settings is a real tab now (ADR-788)
  })

  it('leads with the Home tab and trails with Profile & Settings', () => {
    expect(SPACE_HUB_SECTIONS[0].key).toBe('dashboard')
    expect(SPACE_HUB_SECTIONS[SPACE_HUB_SECTIONS.length - 1].key).toBe('settings')
  })
})

describe('hubSearchItems', () => {
  const items = hubSearchItems('demo')

  it('surfaces a labelled, in-space, sectioned item for every non-excluded module except Danger', () => {
    expect(items.length).toBeGreaterThan(10)
    for (const it of items) {
      expect(it.label).toBeTruthy()
      expect(it.href).toMatch(/^\/spaces\/demo[/?]/)
      expect(Object.values(SPACE_HUB_SECTION_LABEL)).toContain(it.section)
    }
    const labels = items.map((i) => i.label)
    expect(labels).toContain('CRM')
    expect(labels).toContain('Email')
    expect(labels).not.toContain('Danger zone') // not a search destination
    expect(labels).not.toContain('Page') // excluded from the hub
  })
})
