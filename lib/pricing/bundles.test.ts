import { describe, it, expect } from 'vitest'

// THE BUNDLE DRIFT GUARD (ADR-1197, PROG-BUNDLE).
//
// A bundle names function keys as strings. A typo, or a key retired from the registry, would silently
// switch a tool OFF for a real operator — the bundle would simply not list it, and `nextBlobsForBundle`
// would write `false`. So every key is checked against the LIVE registry rather than a copy, the same
// ratchet shape as gate-meter-drift.test.ts. The consequences are asserted through the real reader
// (`spaceFunctionEnabled`), never against the shape of the blob, because the defect this whole program
// grew out of was a blob that looked correctly written and read back the other way.

import fs from 'node:fs'
import path from 'node:path'

import {
  CAPABILITY_BUNDLES,
  ALL_SPACE_FUNCTION_KEYS,
  CORE_SPACE_FUNCTION_KEYS,
  GENERAL_BUNDLE_ID,
  SETUP_PRESETS,
  UNDISABLEABLE_FUNCTION_KEY,
  capabilityBundle,
  capabilityBundleIds,
  nextBlobsForBundle,
  resolveSetupPreset,
  setupPresetForMode,
  setupPresetIds,
  SETUP_PRESET_BY_MODE,
} from './bundles'
import {
  SPACE_FUNCTIONS,
  seedSpaceConfigFromDefaults,
  spaceFunctionDef,
  spaceFunctionEnabled,
} from '@/lib/spaces/functions'
import { listModes } from '@/lib/spaces/modes'
import { SPACE_MANIFEST } from '@/lib/studio/entities/space'
import { spaceHasEntitlement, spaceBillingEntitlements, BILLING_NAMESPACE } from '@/lib/spaces/entitlements'
import { BILLING_MANAGED_KEYS } from './plans'
import { SPACE_ROLES } from '@/lib/spaces/membership-core'

describe('the bundle registry is well-formed', () => {
  it('has at least one bundle and unique ids', () => {
    expect(CAPABILITY_BUNDLES.length).toBeGreaterThan(0)
    const ids = capabilityBundleIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('EVERY function key in EVERY bundle is a live registry key', () => {
    // The ratchet. A typo or a retired key means a tool silently switched off for a real operator.
    const live = new Set<string>(SPACE_FUNCTIONS.map((f) => f.key))
    const unknown: string[] = []
    for (const b of CAPABILITY_BUNDLES) {
      for (const fn of b.functions) if (!live.has(fn)) unknown.push(`${b.id} -> ${fn}`)
    }
    expect(unknown).toEqual([])
  })

  it('ALL_SPACE_FUNCTION_KEYS is derived from the registry, not a second copy of it', () => {
    expect([...ALL_SPACE_FUNCTION_KEYS].sort()).toEqual(SPACE_FUNCTIONS.map((f) => f.key).sort())
  })

  it('every bundle includes the one function that can never be switched off', () => {
    // `billing` shares its key with the reserved namespace; writing its off-switch destroys every plan
    // grant (SCAN-536). A bundle omitting it would be asking for exactly that.
    expect(spaceFunctionDef(UNDISABLEABLE_FUNCTION_KEY)).toBeTruthy()
    for (const b of CAPABILITY_BUNDLES) {
      expect({ bundle: b.id, includesBilling: b.functions.includes(UNDISABLEABLE_FUNCTION_KEY) }).toEqual(
        { bundle: b.id, includesBilling: true },
      )
    }
  })

  it('every role floor names a real function and a real role', () => {
    const live = new Set<string>(SPACE_FUNCTIONS.map((f) => f.key))
    for (const b of CAPABILITY_BUNDLES) {
      for (const [fn, role] of Object.entries(b.roleFloors ?? {})) {
        expect({ bundle: b.id, fn, known: live.has(fn) }).toEqual({ bundle: b.id, fn, known: true })
        expect(SPACE_ROLES as readonly string[]).toContain(role)
      }
    }
  })

  it('no bundle names a billing-managed entitlement key as a function', () => {
    // Bundles shape tools; they never grant paid capability. Catching the confusion here is cheaper
    // than discovering a bundle that appeared to sell something.
    const billing = new Set<string>(BILLING_MANAGED_KEYS)
    for (const b of CAPABILITY_BUNDLES) {
      for (const fn of b.functions) {
        // crm / email / program are BOTH function keys and entitlement keys; that overlap is legitimate.
        if (spaceFunctionDef(fn)) continue
        expect({ bundle: b.id, fn, isBillingKey: billing.has(fn) }).toEqual({
          bundle: b.id,
          fn,
          isBillingKey: false,
        })
      }
    }
  })
})

describe('the pass-through bundle changes nothing', () => {
  const general = capabilityBundle('general')!

  it('exists and lists every function', () => {
    expect(general).toBeTruthy()
    expect([...general.functions].sort()).toEqual([...ALL_SPACE_FUNCTION_KEYS].sort())
  })

  it('applying it to an empty Space writes no off-switch', () => {
    const { entitlements } = nextBlobsForBundle({}, {}, general)
    expect(Object.values(entitlements)).not.toContain(false)
    expect(entitlements).toEqual({})
  })

  it('applying it to a PAID Space leaves every plan grant intact', () => {
    const paid = { [BILLING_NAMESPACE]: { crm: true, email: true, automation: true, team: true } }
    const { entitlements } = nextBlobsForBundle(paid, {}, general)
    expect(spaceBillingEntitlements({ entitlements })).toEqual({
      crm: true,
      email: true,
      automation: true,
      team: true,
    })
    for (const def of SPACE_FUNCTIONS) {
      expect({ fn: def.key, on: spaceFunctionEnabled({ entitlements }, def) }).toEqual({
        fn: def.key,
        on: true,
      })
    }
  })
})

describe('nextBlobsForBundle', () => {
  /** A curated bundle built for the test only, so the assertions do not depend on shipped curation. */
  const narrow = {
    id: 'test-narrow',
    label: 'Narrow',
    tagline: 'Test fixture.',
    functions: ['profile', 'members', 'events', UNDISABLEABLE_FUNCTION_KEY] as const,
    roleFloors: { events: 'admin' } as const,
  }

  it('switches OFF every function the bundle omits, read through the real reader', () => {
    const { entitlements } = nextBlobsForBundle({}, {}, narrow)
    const on = new Set<string>(narrow.functions)
    for (const def of SPACE_FUNCTIONS) {
      const expected = on.has(def.key) || def.key === UNDISABLEABLE_FUNCTION_KEY
      expect({ fn: def.key, on: spaceFunctionEnabled({ entitlements }, def) }).toEqual({
        fn: def.key,
        on: expected,
      })
    }
  })

  it('subtracts a tool even from a Space whose PLAN pays for it', () => {
    // The reason the three-state entitlement read had to land first: without it this is inert.
    const paid = { [BILLING_NAMESPACE]: { crm: true, email: true } }
    const { entitlements } = nextBlobsForBundle(paid, {}, narrow)
    expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef('crm')!)).toBe(false)
    expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef('email')!)).toBe(false)
  })

  it('NEVER writes the reserved billing namespace, so plan grants survive', () => {
    const paid = { [BILLING_NAMESPACE]: { crm: true, email: true, automation: true } }
    const { entitlements } = nextBlobsForBundle(paid, {}, narrow)
    // The container is untouched even though `crm` and `email` were subtracted at the top level.
    expect(spaceBillingEntitlements({ entitlements })).toEqual({
      crm: true,
      email: true,
      automation: true,
    })
    expect(entitlements[BILLING_NAMESPACE]).not.toBe(false)
    // And the Plan and billing tool itself is still reachable.
    expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef(BILLING_NAMESPACE)!)).toBe(true)
  })

  it('re-applying a WIDER bundle restores what a narrower one switched off', () => {
    const general = capabilityBundle('general')!
    const narrowed = nextBlobsForBundle({}, {}, narrow)
    expect(spaceFunctionEnabled({ entitlements: narrowed.entitlements }, spaceFunctionDef('shop')!)).toBe(
      false,
    )
    const widened = nextBlobsForBundle(narrowed.entitlements, narrowed.featureRoles, general)
    for (const def of SPACE_FUNCTIONS) {
      expect({ fn: def.key, on: spaceFunctionEnabled({ entitlements: widened.entitlements }, def) }).toEqual(
        { fn: def.key, on: true },
      )
    }
  })

  it('leaves keys outside the function registry alone', () => {
    const before = { 'crm.autonomy': 'safe_auto', somethingHandSet: true }
    const { entitlements } = nextBlobsForBundle(before, {}, narrow)
    expect(entitlements['crm.autonomy']).toBe('safe_auto')
    expect(spaceHasEntitlement({ entitlements }, 'somethingHandSet')).toBe(true)
  })

  it('merges role floors without dropping existing overrides', () => {
    const { featureRoles } = nextBlobsForBundle({}, { qr: 'moderator' }, narrow)
    expect(featureRoles).toEqual({ qr: 'moderator', events: 'admin' })
  })

  it('never mutates the blobs it is given', () => {
    const ent = { [BILLING_NAMESPACE]: { crm: true } }
    const roles = { qr: 'moderator' }
    const snapshot = JSON.stringify([ent, roles])
    nextBlobsForBundle(ent, roles, narrow)
    expect(JSON.stringify([ent, roles])).toBe(snapshot)
  })
})

// ── THE SETUP PRESETS (owner ruling 1 of ADR-1294, LIVE-249) ─────────────────────────────────────
//
// A preset is a product decision about what a kind of operator does NOT get, so the guards below
// assert the two rules that keep it from becoming something else: it only ever SUBTRACTS, and it
// never subtracts a tool the Space cannot work without. Consequences are read through the real
// reader (`spaceFunctionEnabled`), never off the shape of the blob.

/** The four presets the ruling names, by id. A fifth would be a product decision, not a refactor. */
const RULED_PRESET_IDS = ['studio', 'practice', 'venue', 'nonprofit'] as const

/** The tools a preset may not name as ON: naming one would read as granting it, and a bundle cannot
 *  grant. Derived from the registry, so a tool that becomes tier-marked joins this set by itself. */
const TIER_MARKED_KEYS = SPACE_FUNCTIONS.filter((f) => f.entitlement !== null).map((f) => f.key)

describe('the four setup presets', () => {
  it('are exactly the four the owner ruled, in catalog order, beside the pass-through', () => {
    expect(setupPresetIds()).toEqual([...RULED_PRESET_IDS])
    expect(capabilityBundleIds()).toEqual([GENERAL_BUNDLE_ID, ...RULED_PRESET_IDS])
  })

  it('names a real, undisableable core set', () => {
    // Core is what every preset keeps. A key that is not in the registry could never be kept.
    for (const key of CORE_SPACE_FUNCTION_KEYS) expect(spaceFunctionDef(key)?.key).toBe(key)
    expect(CORE_SPACE_FUNCTION_KEYS).toContain(UNDISABLEABLE_FUNCTION_KEY)
    expect(new Set(CORE_SPACE_FUNCTION_KEYS).size).toBe(CORE_SPACE_FUNCTION_KEYS.length)
  })

  it('never SUBTRACTS a core tool', () => {
    // The half of the ruling a preset could get wrong without anyone noticing until an owner opened
    // a console with a hole in it. /manage/circles is the first screen a new owner sees, so `circles`
    // going off would be a dead end on the way in.
    for (const preset of SETUP_PRESETS) {
      const missing = CORE_SPACE_FUNCTION_KEYS.filter((key) => !preset.functions.includes(key))
      expect({ preset: preset.id, coreMissing: missing }).toEqual({ preset: preset.id, coreMissing: [] })
    }
  })

  it('never names a TIER-MARKED tool as on, so no preset can read as a grant', () => {
    expect(TIER_MARKED_KEYS.length).toBeGreaterThan(0) // the positive control for the filter
    for (const preset of SETUP_PRESETS) {
      const granted = TIER_MARKED_KEYS.filter((key) => preset.functions.includes(key))
      expect({ preset: preset.id, paidNamedOn: granted }).toEqual({ preset: preset.id, paidNamedOn: [] })
    }
  })

  it('every one of them actually subtracts something, and adds nothing twice', () => {
    // A preset that listed every function would be a second pass-through wearing a niche name.
    for (const preset of SETUP_PRESETS) {
      const omitted = ALL_SPACE_FUNCTION_KEYS.filter((key) => !preset.functions.includes(key))
      expect(omitted.length, `${preset.id} subtracts nothing`).toBeGreaterThan(0)
      expect(new Set(preset.functions).size, `${preset.id} repeats a key`).toBe(preset.functions.length)
    }
  })

  it('carries operator-facing copy with no em or en dashes (CONTENT-VOICE §10)', () => {
    for (const preset of SETUP_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0)
      expect(preset.tagline.trim().length).toBeGreaterThan(0)
      expect(`${preset.label} ${preset.tagline}`).not.toMatch(/[—–]/)
    }
  })
})

describe('applying a setup preset leaves core on and the preset list off', () => {
  // This is the consequence LIVE-249 is closed against, measured exactly as provisioning produces
  // it: the per-type seed blobs a new Space is inserted with, then the bundle applied over them.
  const seeded = seedSpaceConfigFromDefaults('business', [])

  it.each(SETUP_PRESETS.map((p) => [p.id, p] as const))('%s', (_id, preset) => {
    const { entitlements } = nextBlobsForBundle(seeded.entitlements, seeded.featureRoles, preset)
    const on = new Set<string>(preset.functions)
    for (const def of SPACE_FUNCTIONS) {
      // The undisableable key is on whatever the blob says, because its off-switch is never written.
      const expected = on.has(def.key) || def.key === UNDISABLEABLE_FUNCTION_KEY
      expect({ preset: preset.id, fn: def.key, on: spaceFunctionEnabled({ entitlements }, def) }).toEqual({
        preset: preset.id,
        fn: def.key,
        on: expected,
      })
    }
    // And every core tool is reachable, stated separately so a core regression names itself.
    for (const key of CORE_SPACE_FUNCTION_KEYS) {
      expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef(key)!), `${preset.id}/${key}`).toBe(true)
    }
  })

  it('a preset never grants a paid tool the Space was not already paying for', () => {
    // The inverse of the subtractive rule, read through the tool the plan would have paid for.
    for (const preset of SETUP_PRESETS) {
      const { entitlements } = nextBlobsForBundle({}, {}, preset)
      for (const key of TIER_MARKED_KEYS) {
        expect({ preset: preset.id, fn: key, on: spaceFunctionEnabled({ entitlements }, spaceFunctionDef(key)!) })
          .toEqual({ preset: preset.id, fn: key, on: false })
      }
    }
  })

  it('re-applying the pass-through restores everything a preset switched off', () => {
    const general = capabilityBundle(GENERAL_BUNDLE_ID)!
    for (const preset of SETUP_PRESETS) {
      const narrowed = nextBlobsForBundle({}, {}, preset)
      const widened = nextBlobsForBundle(narrowed.entitlements, narrowed.featureRoles, general)
      for (const def of SPACE_FUNCTIONS) {
        expect({ preset: preset.id, fn: def.key, on: spaceFunctionEnabled({ entitlements: widened.entitlements }, def) })
          .toEqual({ preset: preset.id, fn: def.key, on: true })
      }
    }
  })
})

describe('resolveSetupPreset', () => {
  it('accepts every registered preset id, trimmed', () => {
    for (const id of setupPresetIds()) expect(resolveSetupPreset(`  ${id} `)?.id).toBe(id)
  })

  it('refuses the pass-through, so a creation form cannot use it to mean "everything on"', () => {
    // Everything-on is what a Space is already; writing a bundle to say it would be a no-op write
    // in the highest-risk path in the product.
    expect(resolveSetupPreset(GENERAL_BUNDLE_ID)).toBeNull()
  })

  it('is total: null, empty and unknown all read as no preset', () => {
    expect(resolveSetupPreset(null)).toBeNull()
    expect(resolveSetupPreset(undefined)).toBeNull()
    expect(resolveSetupPreset('')).toBeNull()
    expect(resolveSetupPreset('not-a-preset')).toBeNull()
  })
})

describe('the Mode to preset map (the data LIVE-149 was waiting for)', () => {
  it('maps only registered (type, Focus) pairs, and only to registered presets', () => {
    const registered = new Set(listModes().map((m) => `${m.type}:${m.variant}`))
    const presets = new Set(setupPresetIds())
    for (const [key, id] of Object.entries(SETUP_PRESET_BY_MODE)) {
      expect({ key, isRegisteredMode: registered.has(key) }).toEqual({ key, isRegisteredMode: true })
      expect({ key, id, isPreset: presets.has(id) }).toEqual({ key, id, isPreset: true })
    }
  })

  it('pins the whole table, so a re-pointed Mode is a decision and not a typo', () => {
    expect(SETUP_PRESET_BY_MODE).toEqual({
      'business:packages': 'practice',
      'business:cohort': 'practice',
      'business:appointments': 'practice',
      'business:service': 'practice',
      'business:membership': 'studio',
      'business:ticketed': 'venue',
      'business:programs': 'venue',
      'nonprofit:donations': 'nonprofit',
      'nonprofit:programs': 'nonprofit',
    })
  })

  it('leaves a PRODUCT business unmapped, which is the documented gap and not an oversight', () => {
    // Its defining tool is the Shop, the Shop is tier-marked, and a preset may not name a paid tool
    // as on. So there is no honest preset for it and it starts with every tool on, as it does today.
    expect(setupPresetForMode('business', 'product')).toBeNull()
  })

  it('resolves every mapped Focus through the same reader provisioning uses', () => {
    expect(setupPresetForMode('business', 'appointments')?.id).toBe('practice')
    expect(setupPresetForMode('business', 'membership')?.id).toBe('studio')
    expect(setupPresetForMode('business', 'ticketed')?.id).toBe('venue')
    expect(setupPresetForMode('nonprofit', 'donations')?.id).toBe('nonprofit')
  })

  it('is total: no type, no Focus, and an unknown Focus all read as no preset', () => {
    expect(setupPresetForMode(null, 'appointments')).toBeNull()
    expect(setupPresetForMode('business', null)).toBeNull()
    expect(setupPresetForMode('business', 'not-a-focus')).toBeNull()
    expect(setupPresetForMode('root', 'appointments')).toBeNull()
  })
})

describe('the Space Spark carries the preset field', () => {
  const field = SPACE_MANIFEST.fields.find((f) => f.path === 'preset')

  it('declares it on the Spark, as a choice', () => {
    expect(field).toBeTruthy()
    expect(field!.kind).toBe('select')
    expect(field!.placement).toBe('spark')
    expect(field!.section).toBe('model')
  })

  it('offers exactly the registered presets, ids AND labels', () => {
    // The manifest RESTATES the registry because bundles.ts reaches a `server-only` module and a
    // manifest is imported by client surfaces. This is the guard that makes the restatement safe.
    expect(field!.options?.map((o) => o.value)).toEqual(SETUP_PRESETS.map((p) => p.id))
    expect(field!.options?.map((o) => o.label)).toEqual(SETUP_PRESETS.map((p) => p.label))
  })

  it('is asked once and declares no later edit plane (ADR-1281)', () => {
    // A preset is a STARTING shape. Re-asking it on a rail would switch tools off behind an owner
    // who has since tuned them by hand.
    expect(field!.editPlane).toBeUndefined()
    expect(field!.prose).toBeUndefined()
  })
})

describe('provisioning applies the preset through the one writer', () => {
  // A SOURCE-SHAPE guard: the behaviour lives in a `use server` module this suite must not import,
  // and the thing worth pinning is which seam it goes through. `setSpaceBundle` reads the two jsonb
  // columns and hands them to the pure resolver above; a second writer here would be a second answer
  // to "what is on".
  const provision = fs.readFileSync(path.join(process.cwd(), 'lib/spaces/provision.ts'), 'utf8')

  it('resolves a preset and applies it with setSpaceBundle', () => {
    expect(provision).toMatch(/resolveSetupPreset/)
    expect(provision).toMatch(/setupPresetForMode/)
    expect(provision).toMatch(/setSpaceBundle\(spaceId, setupPreset\.id\)/)
  })

  it('takes the preset as an input, so an explicit Spark choice beats the derived one', () => {
    expect(provision).toMatch(/preset\?: string \| null/)
    expect(provision).toMatch(/resolveSetupPreset\(input\.preset\) \?\?/)
  })

  it('notices when the apply fails instead of swallowing it (AGENTS deploy-safety rule)', () => {
    expect(provision).toMatch(/console\.error\([\s\S]{0,200}setup preset/)
  })

  it('never writes spaces.plan or the billing namespace from the preset path', () => {
    // Shaping and charging are two decisions on two surfaces (ADR-874). The writer cannot touch
    // money; this asserts the CALLER did not reach around it.
    expect(provision).not.toMatch(/setSpacePlan|setSpaceAddons/)
  })
})
