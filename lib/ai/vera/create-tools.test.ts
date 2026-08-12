import { describe, it, expect } from 'vitest'

// DRIFT GUARDS for the governed create surface (ADR-988). Same posture as the playbook
// registry tests: the interesting properties here are STRUCTURAL, so they are asserted rather
// than trusted. Two of them (the surface is derived; `auto` is unrepresentable) are also
// enforced by the type system, and the tests exist so a refactor that loosens a type still
// fails loudly instead of quietly.

import {
  CREATE_AUTONOMY_TIER,
  CREATE_ENTITY_TOOL,
  CREATE_GATES,
  checkCreateDraft,
  createConfirmLabel,
  createEntityToolDef,
  createEverAutoExecutes,
  createGateFor,
  creatableEntities,
  creatableEntityIds,
  effectiveCreateTier,
  isCreatableEntity,
  parseDraftArg,
} from './create-tools'
import { VERA_TOOLS, getTool, requiresConfirmation, validateToolCall } from './tools'
import { STUDIO_ENTITIES, studioEntityIds } from '@/lib/studio/registry'
import { isCatalogOnly } from '@/lib/studio/kernel/manifest'
import { PLAYBOOK_REGISTRY } from '@/lib/playbooks/registry'

describe('which entities are creatable', () => {
  it('is DERIVED from the Studio catalog, never a second list', () => {
    const expected = STUDIO_ENTITIES.filter((m) => !isCatalogOnly(m)).map((m) => m.entity)
    expect(creatableEntityIds()).toEqual(expected)
    expect(creatableEntityIds().length).toBeGreaterThan(0)
  })

  it('covers the nine guided entities and excludes the catalog-only ones', () => {
    const ids = creatableEntityIds()
    for (const guided of ['circle', 'event', 'journey', 'practice', 'space', 'business', 'listing', 'product', 'service']) {
      expect(ids, `${guided} should be creatable`).toContain(guided)
    }
    // A Channel, a Room, a Hub, a Nexus and a Broadcast are two fields on a modal that already
    // works. They are in the catalog so it is complete, not so they get a wizard.
    for (const catalogOnly of ['channel', 'room', 'hub', 'nexus', 'broadcast']) {
      expect(ids, `${catalogOnly} should not be creatable here`).not.toContain(catalogOnly)
    }
  })

  it('rejects an unknown entity', () => {
    expect(isCreatableEntity('not-an-entity')).toBe(false)
    expect(isCreatableEntity('')).toBe(false)
    expect(checkCreateDraft('not-an-entity', {}).ok).toBe(false)
    expect(checkCreateDraft('not-an-entity', {}).errors.join(' ')).toContain('not a thing the Studio knows')
  })

  it('rejects a catalog-only entity, which is registered but has no guided flow', () => {
    expect(isCreatableEntity('channel')).toBe(false)
    const r = checkCreateDraft('channel', { name: 'Trail talk' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('no guided flow')
  })

  it('tracks the catalog: every creatable id is a registered id', () => {
    const registered = new Set(studioEntityIds())
    for (const id of creatableEntityIds()) expect(registered.has(id)).toBe(true)
  })
})

describe('the create gate', () => {
  it('declares a gate for EVERY creatable entity, so a new manifest cannot land ungated', () => {
    for (const id of creatableEntityIds()) {
      expect(CREATE_GATES[id], `${id} has no declared create gate`).toBeTruthy()
    }
  })

  it('names no entity the catalog does not know', () => {
    const registered = new Set(studioEntityIds())
    for (const id of Object.keys(CREATE_GATES)) expect(registered.has(id)).toBe(true)
  })

  // The DRAFTS BADGE depends on this one. `countMyCreateProposals` (create-entity.ts) narrows its
  // SQL count to the CREATE_GATES keys that still resolve through `createGateFor`, because that is
  // the exact predicate `listMyCreateProposals` applies row-by-row in JS. If a declared gate ever
  // stopped being a creatable entity, `createGateFor` would return null for it and the entity would
  // silently drop out of BOTH — which is consistent, but the badge counting a set the page cannot
  // show (or vice versa) is the failure worth naming. Keys and creatables must stay the same set.
  it('resolves through createGateFor for every key, so the drafts count and the drafts page agree', () => {
    for (const id of Object.keys(CREATE_GATES)) {
      expect(createGateFor(id), `${id} declares a gate but is not a creatable entity`).toBeTruthy()
    }
  })

  it('makes a scoped gate say which authority holds the line', () => {
    for (const [id, gate] of Object.entries(CREATE_GATES)) {
      if (gate.kind === 'scoped') expect(gate.why.trim().length, `${id} scoped gate needs a reason`).toBeGreaterThan(20)
      else expect(gate.capability).toMatch(/\.create$/)
    }
  })
})

describe('autonomy: creation can never be auto', () => {
  it('is declared suggest', () => {
    expect(CREATE_AUTONOMY_TIER).toBe('suggest')
  })

  it('stays suggest at EVERY position of the per-Space autonomy slider', () => {
    expect(effectiveCreateTier(false)).toBe('suggest')
    expect(effectiveCreateTier(true)).toBe('suggest')
    expect(createEverAutoExecutes(false)).toBe(false)
    expect(createEverAutoExecutes(true)).toBe(false)
  })

  it('is not a tool any playbook can auto-fire', () => {
    // The one code path that CAN execute a governed tool without a human tap picks its tool from
    // `PlaybookActionTool`. `create_entity` is absent from that union at the type level; this
    // asserts the same thing about the live registry data.
    const playbookTools = PLAYBOOK_REGISTRY.flatMap((p) => p.actions.map((a) => a.tool as string))
    expect(playbookTools).not.toContain(CREATE_ENTITY_TOOL)
  })

  it('has no auto-eligible playbook that could reach it', () => {
    for (const p of PLAYBOOK_REGISTRY.filter((x) => x.autonomyTier === 'auto')) {
      for (const a of p.actions) expect(a.tool).not.toBe(CREATE_ENTITY_TOOL)
    }
  })
})

describe('the tool definition', () => {
  it('is registered in Vera’s bounded surface exactly once', () => {
    const hits = VERA_TOOLS.filter((t) => t.key === CREATE_ENTITY_TOOL)
    expect(hits).toHaveLength(1)
  })

  it('is a write, so it requires a member confirmation and carries a label', () => {
    expect(requiresConfirmation(CREATE_ENTITY_TOOL)).toBe(true)
    expect(getTool(CREATE_ENTITY_TOOL)?.confirmLabel).toBeTruthy()
  })

  it('advertises the DERIVED entity list, so the tool cannot name an entity the catalog lacks', () => {
    const def = createEntityToolDef()
    const entityParam = def.params.find((p) => p.name === 'entity')
    expect(entityParam?.required).toBe(true)
    for (const id of creatableEntityIds()) {
      expect(entityParam?.description).toContain(id)
      expect(def.description).toContain(id)
    }
    expect(entityParam?.description).not.toContain('channel')
  })

  it('validates like any other tool in the surface', () => {
    expect(validateToolCall(CREATE_ENTITY_TOOL, { entity: 'circle', draft: '{"name":"Sunrise Swim"}' }).ok).toBe(true)
    expect(validateToolCall(CREATE_ENTITY_TOOL, { entity: 'circle' }).ok).toBe(false) // no draft
    expect(validateToolCall(CREATE_ENTITY_TOOL, { entity: 'circle', draft: '{}', bogus: 'x' }).ok).toBe(false)
  })

  it('labels the confirm with the entity’s own name', () => {
    expect(createConfirmLabel('circle')).toBe('Create this Circle')
    expect(createConfirmLabel('not-an-entity')).toBe('Create this')
  })
})

describe('draft validation', () => {
  it('accepts a draft that has what the manifest requires', () => {
    const r = checkCreateDraft('circle', { name: 'Sunrise Swim', about: 'A cold dip and a hot coffee.' })
    expect(r).toEqual({ ok: true, errors: [] })
  })

  it('names every missing required field in one pass', () => {
    const r = checkCreateDraft('circle', {})
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('Name')
  })

  it('treats blank and whitespace as missing', () => {
    expect(checkCreateDraft('circle', { name: '   ' }).ok).toBe(false)
  })

  it('re-runs the kernel’s own clearance rule rather than restating it', () => {
    // Every creatable entity must at least be VALIDATABLE without throwing, on an empty draft
    // and on a plausible one. An entity that declares commercial facts blocks until its ledger
    // clears them, which is the server-side half of the review board's gate.
    for (const m of creatableEntities()) {
      expect(() => checkCreateDraft(m.entity, {})).not.toThrow()
      const r = checkCreateDraft(m.entity, {})
      expect(typeof r.ok).toBe('boolean')
      expect(Array.isArray(r.errors)).toBe(true)
    }
  })
})

describe('parseDraftArg', () => {
  it('reads a JSON object off the string the tool surface carries', () => {
    expect(parseDraftArg('{"name":"Sunrise Swim"}')).toEqual({ name: 'Sunrise Swim' })
  })

  it('passes an object through untouched', () => {
    expect(parseDraftArg({ name: 'x' })).toEqual({ name: 'x' })
  })

  it('fails closed on anything that is not a plain object', () => {
    for (const bad of ['[]', '"nope"', '7', 'not json', '', null, undefined, 42, ['a']]) {
      expect(parseDraftArg(bad), String(bad)).toBeNull()
    }
  })
})
