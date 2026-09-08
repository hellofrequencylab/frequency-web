import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import { railForm } from '@/lib/studio/kernel/edit-plan'
import {
  CIRCLE_RAIL,
  CIRCLE_COLUMNS,
  CIRCLE_COVER_WRITES,
  CIRCLE_SETTINGS_WRITES,
  CIRCLE_ACCESS_WRITES,
  CIRCLE_CHANNEL_WRITES,
  CIRCLE_PERMALINK_WRITES,
  circleRailValues,
  circleSettingsFormData,
} from './circle-rail-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE CIRCLE RAIL DERIVES FROM ITS MANIFEST (ADR-1281, closing the Circle half of HYG-050).
//
// The same properties the Practice and Journey plans pin, plus the two this rail adds: a column-
// to-path map held against the action that reads it, and the FormData the settings form sends
// built from the values (a native checkbox is absent when unchecked, so a snapshot could never
// switch a Circle back to Listed). Plus a source-shape guard: the module declares no field.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS = readFileSync(join(__dirname, '../../../app/(main)/circles/admin-actions.ts'), 'utf8')

describe('the Circle rail plan', () => {
  it('renders the ten fields the hand-written rail rendered, by zone, in manifest order', () => {
    expect(CIRCLE_RAIL.cover.fields.map((f) => f.path)).toEqual(['imageUrl'])
    expect(CIRCLE_RAIL.settings.fields.map((f) => f.path)).toEqual(['name', 'about', 'type', 'memberCap', 'status', 'unlisted'])
    expect(CIRCLE_RAIL.access.fields.map((f) => f.path)).toEqual(['access'])
    expect(CIRCLE_RAIL.channel.fields.map((f) => f.path)).toEqual(['topicalChannelId'])
    expect(CIRCLE_RAIL.permalink.fields.map((f) => f.path)).toEqual(['slug'])
  })

  it('honours every written column: nothing a save path writes is missing from the rail', () => {
    for (const zone of Object.values(CIRCLE_RAIL)) expect(zone.dropped).toEqual([])
  })

  it('writes each column on exactly one save path, and maps each to exactly one column', () => {
    const all = [
      ...CIRCLE_COVER_WRITES,
      ...CIRCLE_SETTINGS_WRITES,
      ...CIRCLE_ACCESS_WRITES,
      ...CIRCLE_CHANNEL_WRITES,
      ...CIRCLE_PERMALINK_WRITES,
    ]
    expect(new Set(all).size).toBe(all.length)
    expect(Object.keys(CIRCLE_COLUMNS).sort()).toEqual([...all].sort())
    expect(new Set(Object.values(CIRCLE_COLUMNS)).size).toBe(all.length)
  })

  // The map is held against the ACTION, not against itself: every settings column is one the
  // action reads off its FormData, so a renamed column fails here before it fails in production.
  it('maps the settings writes to the columns updateCircleSettings reads off its FormData', () => {
    const body = ACTIONS.slice(ACTIONS.indexOf('export async function updateCircleSettings'))
    for (const path of CIRCLE_SETTINGS_WRITES) {
      const col = CIRCLE_COLUMNS[path]
      expect(body, `${path} -> ${col}`).toMatch(new RegExp(`fd\\.(?:get|has)\\('${col}'\\)`))
    }
  })

  it('reads label, kind, options, and required from the manifest, never from the module', () => {
    const byPath = new Map(CIRCLE_MANIFEST.fields.map((f) => [f.path, f]))
    for (const zone of Object.values(CIRCLE_RAIL)) {
      for (const f of zone.fields) expect(f).toBe(byPath.get(f.path))
    }
    expect(CIRCLE_RAIL.settings.fields.find((f) => f.path === 'name')?.required).toBe(true)
    // The status offers the enum's five values and never the "Paused" the old rail invented.
    const status = CIRCLE_RAIL.settings.fields.find((f) => f.path === 'status')
    expect(status?.options?.map((o) => o.value)).toEqual(['draft', 'forming', 'active', 'inactive', 'archived'])
  })

  it('renders the name because the manifest places it on the rail after creation (ADR-1281)', () => {
    const name = CIRCLE_MANIFEST.fields.find((f) => f.path === 'name')
    expect(name?.placement).toBe('spark')
    expect(name?.editPlane).toBe('rail')
    const undeclared = { ...CIRCLE_MANIFEST, fields: CIRCLE_MANIFEST.fields.map((f) => (f.path === 'name' ? { ...f, editPlane: undefined } : f)) }
    expect(railForm(undeclared, CIRCLE_SETTINGS_WRITES, { hostInline: true }).dropped).toEqual([{ path: 'name', reason: 'spark-only' }])
  })

  it('hosts the inline plane only in the settings form, and only because no inline canvas exists yet', () => {
    const unhosted = railForm(CIRCLE_MANIFEST, CIRCLE_SETTINGS_WRITES)
    expect(unhosted.fields.map((f) => f.path)).toEqual(['name', 'type', 'memberCap', 'status', 'unlisted'])
    expect(unhosted.dropped).toEqual([{ path: 'about', reason: 'inline' }])
  })

  // THE DRIFT TEST against the real manifest. Change one field's placement and the rail follows.
  it('follows a placement change on the manifest with no change to the module', () => {
    const moved = {
      ...CIRCLE_MANIFEST,
      fields: CIRCLE_MANIFEST.fields.map((f) => (f.path === 'memberCap' ? { ...f, placement: 'inline' as const } : f)),
    }
    expect(railForm(moved, CIRCLE_SETTINGS_WRITES).dropped).toEqual([
      { path: 'about', reason: 'inline' },
      { path: 'memberCap', reason: 'inline' },
    ])
    expect(railForm(moved, CIRCLE_SETTINGS_WRITES, { hostInline: true }).fields.map((f) => f.path)).toEqual(CIRCLE_SETTINGS_WRITES)
  })
})

describe('the Circle rail reads its row and writes its FormData through the column map', () => {
  const row = {
    id: 'c1',
    slug: 'sunrise',
    name: 'Sunrise',
    about: null,
    type: 'online',
    member_cap: 8,
    status: null,
    image_url: 'https://img/x.png',
    unlisted: true,
    access: null,
    topical_channel_id: 'ch1',
  }

  it('reads each field through its column, with the manifest defaults for an unset column', () => {
    expect(circleRailValues(row)).toEqual({
      imageUrl: 'https://img/x.png',
      name: 'Sunrise',
      about: '',
      type: 'online',
      memberCap: '8',
      status: 'draft',
      unlisted: 'true',
      access: 'open',
      topicalChannelId: 'ch1',
      slug: 'sunrise',
    })
  })

  it('sends the settings columns the action reads, with the switch encoded on/off so it can turn OFF', () => {
    const on = circleSettingsFormData({ name: 'Sunrise', about: 'Early.', type: 'online', memberCap: '8', status: 'active', unlisted: 'true' })
    expect(Object.fromEntries(on.entries())).toEqual({
      name: 'Sunrise',
      about: 'Early.',
      type: 'online',
      member_cap: '8',
      status: 'active',
      unlisted: 'on',
    })
    const off = circleSettingsFormData({ name: 'Sunrise', unlisted: 'false' })
    expect(off.get('unlisted')).toBe('off')
    expect(off.get('about')).toBe('')
    expect([...off.keys()].sort()).toEqual(['about', 'member_cap', 'name', 'status', 'type', 'unlisted'])
  })
})

describe('the Circle settings module renders the plan, not a field list', () => {
  const source = readFileSync(join(__dirname, 'circle-settings-module.tsx'), 'utf8')

  it('imports the plan and hands its fields to the rail renderer', () => {
    expect(source).toMatch(/from '\.\/circle-rail-plan'/)
    expect(source).toMatch(/fields=\{CIRCLE_RAIL\.settings\.fields\}/)
    expect(source).toMatch(/circleSettingsFormData\(valuesRef\.current\)/)
  })

  it('declares no autosave field of its own (a named Input, Textarea, or Select)', () => {
    expect(source).not.toMatch(/<(?:Input|Textarea|Select)\b[^>]*\bname=/)
  })

  it('takes even the zone labels from the manifest', () => {
    for (const zone of ['COVER', 'ACCESS', 'CHANNEL', 'PERMALINK']) expect(source).toMatch(new RegExp(`\\{${zone}\\.label\\}`))
  })
})
