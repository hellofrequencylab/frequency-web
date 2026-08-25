import { describe, it, expect } from 'vitest'
import { deriveMenuDrift } from './drift'
import { compare } from './drift-core.mjs'
import { PINNED_PROFILE_ID } from './defaults'
import type { ResolvedItem, ResolvedMenu } from './types'

// The four-state per-item derivation the Menu manager renders (LIVE-111, ADR-1134).
//
// The defect this exists for is LIVE-107's: an OPERATOR created the mislabelled
// "Spaces directory" row in this very editor, and nothing on the screen said the row had left
// its default behind. The weekly sweep caught it a week later. These cases pin the derivation
// that puts the same reading in front of the author, at the moment of the edit — and the last
// block pins the property the row demands: the retired/missing split must be the SAME answer
// the weekly job's comparison gives, because both consume one shared function (drift-core.mjs).
//
// No browser, no database: pure values in, pure values out.

let seq = 0
function item(label: string, href: string, extra: Partial<ResolvedItem> = {}): ResolvedItem {
  return {
    id: extra.id ?? `row-${++seq}`,
    label,
    href,
    position: seq,
    colSpan: 1,
    mode: 'active',
    roleModes: {},
    minAccess: 'visitor',
    ...extra,
  }
}

function menu(partial: Partial<ResolvedMenu>): ResolvedMenu {
  return {
    surfaceKey: 'header',
    label: 'Header',
    columns: 6,
    categories: [],
    rootItems: [],
    railCards: [],
    isDefault: false,
    ...partial,
  }
}

/** Code defaults for these cases: one root leaf + one grouped leaf. */
const DEF = menu({
  isDefault: true,
  rootItems: [item('Pricing', '/pricing', { id: 'default:pricing', subheading: 'Plans and rates' })],
  categories: [
    {
      id: 'default:spaces',
      label: 'Spaces',
      position: 0,
      colSpan: 1,
      items: [
        item('Spaces', '/spaces', { id: 'default:spaces:landing' }),
        item('Spaces directory', '/discover/spaces', { id: 'default:spaces:directory' }),
      ],
      children: [],
    },
  ],
})

describe('synced', () => {
  it('an untouched seeded row reads synced', () => {
    const live = menu({
      id: 'm1',
      rootItems: [item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates' })],
    })
    expect(deriveMenuDrift(live, DEF, ['/pricing']).items['db-1']).toEqual({ state: 'synced' })
  })

  it('a missing subheading and an empty subheading are the same non-edit', () => {
    const live = menu({
      id: 'm1',
      rootItems: [item('Spaces', '/spaces', { id: 'db-1', subheading: undefined })],
    })
    // The default for /spaces carries no subheading either.
    expect(deriveMenuDrift(live, DEF, []).items['db-1']).toEqual({ state: 'synced' })
  })
})

describe('edited', () => {
  it('names each diverged field: label, subheading, visibility', () => {
    const live = menu({
      id: 'm1',
      rootItems: [
        item('Plans', '/pricing', { id: 'db-1', subheading: 'What it costs', mode: 'hidden' }),
      ],
    })
    expect(deriveMenuDrift(live, DEF, ['/pricing']).items['db-1']).toEqual({
      state: 'edited',
      changed: ['label', 'subheading', 'visibility'],
    })
  })

  it('a single renamed label is edited by label alone', () => {
    const live = menu({
      id: 'm1',
      rootItems: [item('Rates', '/pricing', { id: 'db-1', subheading: 'Plans and rates' })],
    })
    expect(deriveMenuDrift(live, DEF, []).items['db-1']).toEqual({
      state: 'edited',
      changed: ['label'],
    })
  })

  it('access gates are NOT compared: the registry overwrites them at read time', () => {
    const live = menu({
      id: 'm1',
      rootItems: [
        item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates', minAccess: 'janitor' }),
      ],
    })
    expect(deriveMenuDrift(live, DEF, []).items['db-1']).toEqual({ state: 'synced' })
  })
})

describe('retired vs missing — the split only synced_default_keys can make', () => {
  it('an absent default IN the baseline is retired: the sync will never bring it back', () => {
    const live = menu({ id: 'm1', rootItems: [item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates' })] })
    const d = deriveMenuDrift(live, DEF, ['/pricing', '/spaces', '/discover/spaces'])
    expect(d.absentDefaults).toEqual([
      { label: 'Spaces', href: '/spaces', state: 'retired' },
      { label: 'Spaces directory', href: '/discover/spaces', state: 'retired' },
    ])
  })

  it('an absent default NOT in the baseline is missing: the next sync adds it', () => {
    const live = menu({ id: 'm1', rootItems: [item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates' })] })
    const d = deriveMenuDrift(live, DEF, ['/pricing'])
    expect(d.absentDefaults).toEqual([
      { label: 'Spaces', href: '/spaces', state: 'missing' },
      { label: 'Spaces directory', href: '/discover/spaces', state: 'missing' },
    ])
  })
})

describe('custom', () => {
  it('an operator-added link is custom, and never an absence finding', () => {
    const live = menu({
      id: 'm1',
      rootItems: [
        item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates' }),
        item('Spaces', '/spaces', { id: 'db-2' }),
        item('Spaces directory', '/discover/spaces', { id: 'db-3' }),
        item('Our blog', '/blog', { id: 'db-4' }),
      ],
    })
    const d = deriveMenuDrift(live, DEF, ['/pricing', '/spaces', '/discover/spaces'])
    expect(d.items['db-4']).toEqual({ state: 'custom' })
    expect(d.absentDefaults).toEqual([])
  })
})

describe('the LIVE-107 row, reconstructed for its author', () => {
  it('shows the mislabelled row as edited AND names the default it orphans', () => {
    // The live 2026-08-24 shape: a row labelled "Spaces directory" pointing at /spaces (the
    // marketing landing), and NO row for /discover/spaces, whose key sits in the baseline.
    const live = menu({
      id: 'm1',
      rootItems: [item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates' })],
      categories: [
        {
          id: 'db-cat',
          label: 'Spaces',
          position: 0,
          colSpan: 1,
          items: [item('Spaces directory', '/spaces', { id: 'db-2' })],
          children: [],
        },
      ],
    })
    const d = deriveMenuDrift(live, DEF, ['/pricing', '/spaces', '/discover/spaces'])
    // The row the operator is editing: its href IS a default (/spaces), its label diverged.
    expect(d.items['db-2']).toEqual({ state: 'edited', changed: ['label'] })
    // And the default whose label it wears is absent — retired (baselined), with the lie named.
    expect(d.absentDefaults).toEqual([
      { label: 'Spaces directory', href: '/discover/spaces', state: 'retired', mislabelledAs: '/spaces' },
    ])
  })
})

describe('the pinned rail row', () => {
  it('is skipped on both sides: it has no DB row and never syncs', () => {
    const pinned = item('Profile', '/settings/profile', { id: PINNED_PROFILE_ID })
    const live = menu({ id: 'm1', surfaceKey: 'left', rootItems: [pinned] })
    const def = menu({ isDefault: true, surfaceKey: 'left', rootItems: [pinned] })
    const d = deriveMenuDrift(live, def, [])
    expect(d.items).toEqual({})
    expect(d.absentDefaults).toEqual([])
  })
})

describe('agreement with the weekly job', () => {
  it('retired/missing IS unreachable/pending from the shared comparison, on the same inputs', () => {
    const live = menu({ id: 'm1', rootItems: [item('Pricing', '/pricing', { id: 'db-1', subheading: 'Plans and rates' })] })
    const baseline = ['/pricing', '/spaces']
    const d = deriveMenuDrift(live, DEF, baseline)

    const r = compare(
      [
        { label: 'Pricing', href: '/pricing' },
        { label: 'Spaces', href: '/spaces' },
        { label: 'Spaces directory', href: '/discover/spaces' },
      ],
      { items: [{ label: 'Pricing', href: '/pricing' }], syncedDefaultKeys: baseline },
    )
    expect(d.absentDefaults.filter((a) => a.state === 'retired').map((a) => a.href)).toEqual(
      r.unreachable.map((l) => l.href),
    )
    expect(d.absentDefaults.filter((a) => a.state === 'missing').map((a) => a.href)).toEqual(
      r.pending.map((l) => l.href),
    )
  })
})
