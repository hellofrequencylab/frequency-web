import { describe, it, expect } from 'vitest'
import { blueprintForType, tabForSegment, provisionableTypes } from './blueprints'
import { SUPPORTED_ACCENT_TOKENS } from './accent'

// PER-TYPE BLUEPRINT contract (ENTITY-SPACES-BUILD §B.3, Epic 1.3). Locks the Practitioner typed
// composition and the fail-closed behaviour for unknown types. Pure data, no IO.

describe('blueprintForType', () => {
  it('returns the Practitioner blueprint with its tabs, CTA, and hero stats', () => {
    const bp = blueprintForType('practitioner')
    expect(bp).not.toBeNull()
    expect(bp!.typeLabel).toBe('Practitioner')
    // The tab set per §B.3: About · Offerings · Practices & Journeys · Community · Book.
    expect(bp!.tabs.map((t) => t.id)).toEqual(['about', 'offerings', 'practices', 'community', 'book'])
    // The dynamic primary CTA is the plain verb "Book", routing to the book tab (§A.4).
    expect(bp!.primaryCta).toEqual({ label: 'Book', tab: 'book' })
    // Up to four hero StatCards.
    expect(bp!.heroStats.length).toBeGreaterThan(0)
    expect(bp!.heroStats.length).toBeLessThanOrEqual(4)
    // The hero leads with offerings (always-populated for a live practitioner), not sessions
    // (upcoming-only, which a mid-week profile may have zero of — §5, lead with a real stat).
    expect(bp!.heroStats[0]!.metric).toBe('offerings')
    // Warm amber default accent — the practitioner is the DAWN baseline (§1).
    expect(bp!.defaultAccent).toBe('--color-primary')
  })

  it('drops entity-stats from the About tab (the hero already shows the same numbers, §3 dedupe)', () => {
    const bp = blueprintForType('practitioner')!
    expect(bp.tabs[0]!.modules).not.toContain('entity-stats')
  })

  it('the About (index) tab includes the about module so a profile is never blank', () => {
    const bp = blueprintForType('practitioner')!
    expect(bp.tabs[0]!.id).toBe('about')
    expect(bp.tabs[0]!.modules).toContain('entity-about')
  })

  it('fails closed to null for an unknown / unregistered type', () => {
    // 'school' is a clearly fake type with no blueprint; unknown / absent types fall through.
    expect(blueprintForType('school')).toBeNull()
    expect(blueprintForType('unknown')).toBeNull()
    expect(blueprintForType(null)).toBeNull()
    expect(blueprintForType(undefined)).toBeNull()
  })

  it('now registers a blueprint for lab and partner (ADMIN-05 / ADR-341)', () => {
    // `lab` and `partner` were deferred under ADR-339; ADMIN-05 ships their blueprints, so they are
    // now provisionable. The create wizard derives its choices from this registry, so registering
    // them here is what makes the wizard offer them.
    expect(blueprintForType('lab')).not.toBeNull()
    expect(blueprintForType('partner')).not.toBeNull()
  })
})

describe('the canonical PROVISIONABLE role set (ADR-339 + ADR-341)', () => {
  it('registers a blueprint for exactly the seven member-facing role types', () => {
    // The blueprint registry is the source of truth for which types the wizard can stand up. As of
    // ADMIN-05 (ADR-341) the provisionable set is the full member-facing seven: practitioner,
    // business, organization, coaching, event_space, lab, partner. `root` is the platform host with
    // no member-facing blueprint, so it never registers one. This locks the registry to that contract.
    const PROVISIONABLE_WITH_BLUEPRINT = [
      'practitioner',
      'business',
      'organization',
      'coaching',
      'event_space',
      'lab',
      'partner',
    ]
    for (const type of PROVISIONABLE_WITH_BLUEPRINT) {
      expect(blueprintForType(type)).not.toBeNull()
    }
    // The host type has no member-facing blueprint; an unknown type fails closed.
    for (const type of ['root', 'school']) {
      expect(blueprintForType(type)).toBeNull()
    }
  })

  it('exposes the provisionable types as wizard choices in canonical order (the wizard reads this)', () => {
    // The create wizard derives its type buttons from provisionableTypes(); this is what makes Lab +
    // Partner offerable. Lock the order + the labels (sourced from each blueprint's typeLabel).
    expect(provisionableTypes()).toEqual([
      { value: 'practitioner', label: 'Practitioner' },
      { value: 'business', label: 'Business' },
      { value: 'organization', label: 'Organization' },
      { value: 'coaching', label: 'Coaching' },
      { value: 'event_space', label: 'Event Space' },
      { value: 'lab', label: 'Lab' },
      { value: 'partner', label: 'Partner' },
    ])
    // Every offered choice resolves to a real blueprint (the wizard never offers an unrenderable type).
    for (const c of provisionableTypes()) {
      expect(blueprintForType(c.value)).not.toBeNull()
    }
  })
})

// ── Non-Practitioner role blueprints (Wave B + ADMIN-05: Business · Organization · Coaching ·
// Event Space · Lab · Partner, §2.5 - §2.8, ADR-341) ────────────────────────────────────────────
// Each reuses the SAME seven entity modules + the same wired route segments as Practitioner; only
// the tab labels, the primary CTA label, the hero stat keys, and the order vary. Every CTA routes
// to a wired segment (book/offerings/practices/community), so no tab link 404s.

describe('non-practitioner blueprints (business / organization / coaching / event_space / lab / partner)', () => {
  // Every tab id MUST be a wired profile route segment (a page.tsx exists for it) so the tab row
  // never links to a 404. These are the segments live today.
  const WIRED_SEGMENTS = new Set(['about', 'offerings', 'practices', 'community', 'book'])
  // The only entity modules any blueprint may reference (lib/widgets/modules.ts SPACE_MODULE_IDS).
  const ENTITY_MODULES = new Set([
    'entity-getting-started',
    'entity-about',
    'entity-stats',
    'entity-offerings',
    'entity-practices',
    'entity-community',
    'entity-team',
    'entity-cta',
  ])

  // `aboutLead` = the FIRST module of the About tab (the role's headline section, §5 per-role
  // identity). `stats` = the hero stat keys IN ORDER (each role now leads with a stat it actually
  // has, never an always-zero metric, §5). `accent` = the per-role default brand accent (§1).
  const cases = [
    { type: 'business', typeLabel: 'Business', cta: 'Become a member', labels: ['About', 'Classes', 'Practices', 'Community', 'Join'], aboutLead: 'entity-offerings', stats: ['offerings', 'members', 'circles'], accent: '--color-broadcast' },
    { type: 'organization', typeLabel: 'Organization', cta: 'Donate', labels: ['About', 'Programs', 'Practices', 'Community', 'Donate'], aboutLead: 'entity-about', stats: ['offerings', 'members', 'circles'], accent: '--color-signal' },
    { type: 'coaching', typeLabel: 'Coaching', cta: 'Enroll', labels: ['About', 'Programs', 'Curriculum', 'Community', 'Enroll'], aboutLead: 'entity-practices', stats: ['practices', 'members', 'circles'], accent: '--color-info' },
    { type: 'event_space', typeLabel: 'Event Space', cta: 'Get tickets', labels: ['About', 'Events', 'Practices', 'Community', 'Tickets'], aboutLead: 'entity-offerings', stats: ['offerings', 'members', 'circles'], accent: '--color-warning' },
    // ADMIN-05 (ADR-341): Lab leads About with what's on (a physical room is its calendar); Partner
    // leads with the brand story (a Partner is a brand). Both compose the universal owner four (no
    // role-specific deep control in v1). Partner shares the Business brand accent by design.
    { type: 'lab', typeLabel: 'Lab', cta: 'Visit', labels: ['About', "What's on", 'Practices', 'Community', 'Visit'], aboutLead: 'entity-offerings', stats: ['offerings', 'circles', 'members'], accent: '--color-success' },
    { type: 'partner', typeLabel: 'Partner', cta: 'Join', labels: ['About', 'Perks', 'Practices', 'Community', 'Join'], aboutLead: 'entity-about', stats: ['offerings', 'members', 'circles'], accent: '--color-broadcast' },
  ] as const

  for (const c of cases) {
    describe(c.type, () => {
      const bp = blueprintForType(c.type)!

      it('resolves to its blueprint with the right type label', () => {
        expect(bp).not.toBeNull()
        expect(bp.typeLabel).toBe(c.typeLabel)
      })

      it('declares the same five wired tab segments as Practitioner', () => {
        expect(bp.tabs.map((t) => t.id)).toEqual(['about', 'offerings', 'practices', 'community', 'book'])
      })

      it('carries its role-specific tab labels', () => {
        expect(bp.tabs.map((t) => t.label)).toEqual([...c.labels])
      })

      it('routes its primary CTA verb to the wired book segment', () => {
        expect(bp.primaryCta).toEqual({ label: c.cta, tab: 'book' })
      })

      it('declares its hero stat keys in order, leading with a stat it actually has (§5)', () => {
        expect(bp.heroStats.map((s) => s.metric)).toEqual([...c.stats])
        expect(bp.heroStats.length).toBeLessThanOrEqual(4)
        // The first stat is never `members` (always zero before anyone joins) — every role leads
        // with content it publishes from day one (offerings / practices), §5.
        expect(bp.heroStats[0]!.metric).not.toBe('members')
      })

      it('opens with the about index tab, led by its role-specific headline module (§5)', () => {
        expect(bp.tabs[0]!.id).toBe('about')
        // The About tab still always carries the about prose (so the index is never blank)…
        expect(bp.tabs[0]!.modules).toContain('entity-about')
        // …it leads with the composite getting-started empty (renders only when the profile is empty,
        // §3), then the role's HEADLINE content module (a venue/business/non-profit leads with what
        // it does, not a generic bio), §5 per-role identity.
        expect(bp.tabs[0]!.modules[0]).toBe('entity-getting-started')
        expect(bp.tabs[0]!.modules[1]).toBe(c.aboutLead)
      })

      it('leads every browse tab with the getting-started composite empty (§3)', () => {
        for (const t of bp.tabs) {
          if (t.id === 'book') continue // the conversion tab has its own dedicated empty
          expect(t.modules[0]).toBe('entity-getting-started')
        }
      })

      it('drops entity-stats from the About tab (the hero shows the same numbers, §3 dedupe)', () => {
        expect(bp.tabs[0]!.modules).not.toContain('entity-stats')
      })

      it('uses only wired route segments and only the seven registered entity modules', () => {
        for (const t of bp.tabs) {
          expect(WIRED_SEGMENTS.has(t.id)).toBe(true)
          for (const m of t.modules) expect(ENTITY_MODULES.has(m)).toBe(true)
        }
      })

      it('reuses the same curated DAWN skin as Practitioner (no bespoke slug yet)', () => {
        expect(bp.defaultSkin).toBe(blueprintForType('practitioner')!.defaultSkin)
      })

      it('carries a per-role default accent the override can fully paint (§1)', () => {
        expect(bp.defaultAccent).toBe(c.accent)
        // The default must be a token lib/spaces/accent.ts can remap, else the role would fall back
        // to the host amber and lose its distinct color.
        expect(SUPPORTED_ACCENT_TOKENS.has(bp.defaultAccent)).toBe(true)
      })
    })
  }
})

describe('tabForSegment', () => {
  const bp = blueprintForType('practitioner')!

  it('resolves a known tab segment to its tab', () => {
    expect(tabForSegment(bp, 'offerings').id).toBe('offerings')
    expect(tabForSegment(bp, 'book').id).toBe('book')
  })

  it('falls back to the index (About) tab for an absent or unknown segment', () => {
    expect(tabForSegment(bp, undefined).id).toBe('about')
    expect(tabForSegment(bp, 'nope').id).toBe('about')
  })
})

describe('per-role default accents (§1 KEYSTONE: every role reads on a supported accent)', () => {
  // ALL seven member-facing roles get a supported default accent.
  const ALL_ROLES = ['practitioner', 'business', 'organization', 'coaching', 'event_space', 'lab', 'partner'] as const
  // The five roles whose accent is UNIQUE. lib/spaces/accent.ts ships exactly six accent families;
  // five are taken one-each by these roles, Lab takes the last free one (success), and Partner shares
  // the Business brand family (broadcast) by design (ADR-341) until a Partner-specific family lands.
  const DISTINCT_ACCENT_ROLES = ['practitioner', 'business', 'organization', 'coaching', 'event_space'] as const

  it('gives every role a supported default accent', () => {
    for (const r of ALL_ROLES) {
      const bp = blueprintForType(r)!
      expect(SUPPORTED_ACCENT_TOKENS.has(bp.defaultAccent)).toBe(true)
    }
  })

  it('assigns a DISTINCT default accent to each of the five core roles', () => {
    const accents = DISTINCT_ACCENT_ROLES.map((r) => blueprintForType(r)!.defaultAccent)
    expect(new Set(accents).size).toBe(DISTINCT_ACCENT_ROLES.length)
  })

  it('gives Lab its own free accent and lets Partner share the Business brand family (ADR-341)', () => {
    expect(blueprintForType('lab')!.defaultAccent).toBe('--color-success')
    // Partner is a brand running a loyalty program, so it shares the Business "product / brand" hue
    // on purpose; this is the documented exception to per-role distinctness (ADR-341).
    expect(blueprintForType('partner')!.defaultAccent).toBe('--color-broadcast')
    expect(blueprintForType('business')!.defaultAccent).toBe('--color-broadcast')
  })
})

