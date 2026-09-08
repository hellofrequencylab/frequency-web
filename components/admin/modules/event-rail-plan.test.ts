import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { railForm } from '@/lib/studio/kernel/edit-plan'
import {
  EVENT_RAIL,
  EVENT_COLUMNS,
  EVENT_COMPOSITES,
  EVENT_GALLERY_WRITES,
  EVENT_PIN_KEYS,
  EVENT_PLACEMENT_WRITES,
  EVENT_PERMALINK_WRITES,
  EVENT_SETTINGS_WRITES,
  eventRailValues,
  eventSettingsFormData,
  eventSettingsGroups,
  eventVisibilityField,
} from './event-rail-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT RAIL DERIVES FROM ITS MANIFEST (ADR-1281, closing the Event half of HYG-050).
//
// The same properties the Practice, Journey, and Circle plans pin, plus what this rail adds: a key
// map held against the settings action, six named composites held against the manifest's sections,
// the readers that turn the admin row into the controls' strings, and the FormData the settings form
// sends built from the values with the pin beside them. Plus a source-shape guard: the module declares
// no field and renders every composite the plan names.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS = readFileSync(join(__dirname, '../../../app/(main)/events/admin-actions.ts'), 'utf8')
const SETTINGS_ACTION = ACTIONS.slice(ACTIONS.indexOf('export async function updateEventSettings'))

describe('the Event rail plan', () => {
  it('renders the plan by zone, in manifest order', () => {
    expect(EVENT_RAIL.gallery.fields.map((f) => f.path)).toEqual(['coverImagePath', 'galleryImagePaths'])
    expect(EVENT_RAIL.settings.fields.map((f) => f.path)).toEqual([
      'title',
      'category',
      'description',
      'startsAt',
      'endsAt',
      'recurrenceType',
      'recurrenceUntil',
      'timeZone',
      'location',
      'attendanceMode',
      'onlineUrl',
      'venueName',
      'street',
      'city',
      'region',
      'postalCode',
      'country',
      'hideAddress',
      'priceCents',
      'joinMode',
      'details.rsvpWindow.opensAt',
      'details.rsvpWindow.closesAt',
      'visibility',
      'capacity',
      'energyTag',
      'rsvpRequiresApproval',
      'checkInEnabled',
      'marketListed',
    ])
    expect(EVENT_RAIL.placement.fields.map((f) => f.path)).toEqual(['scopeId'])
    expect(EVENT_RAIL.permalink.fields.map((f) => f.path)).toEqual(['slug'])
  })

  it('honours every written column: nothing a save path writes is missing from the rail', () => {
    for (const zone of Object.values(EVENT_RAIL)) expect(zone.dropped).toEqual([])
  })

  it('writes each column on exactly one save path, and maps each to exactly one key', () => {
    const all = [...EVENT_GALLERY_WRITES, ...EVENT_SETTINGS_WRITES, ...EVENT_PLACEMENT_WRITES, ...EVENT_PERMALINK_WRITES]
    expect(new Set(all).size).toBe(all.length)
    expect(Object.keys(EVENT_COLUMNS).sort()).toEqual([...all].sort())
    expect(new Set(Object.values(EVENT_COLUMNS)).size).toBe(all.length)
  })

  // The map is held against the ACTION: every settings key, and both pin keys, is one the action
  // reads off its FormData, so a renamed key fails here before it fails in production.
  it('maps the settings writes to the keys updateEventSettings reads off its FormData', () => {
    for (const path of EVENT_SETTINGS_WRITES) {
      expect(SETTINGS_ACTION, `${path} -> ${EVENT_COLUMNS[path]}`).toMatch(new RegExp(`fd\\.get\\('${EVENT_COLUMNS[path]}'\\)`))
    }
    for (const key of EVENT_PIN_KEYS) expect(SETTINGS_ACTION).toMatch(new RegExp(`fd\\.get\\('${key}'\\)`))
  })

  it('reads label, kind, options, and required from the manifest, never from the module', () => {
    const byPath = new Map(EVENT_MANIFEST.fields.map((f) => [f.path, f]))
    for (const zone of Object.values(EVENT_RAIL)) {
      for (const f of zone.fields) expect(f).toBe(byPath.get(f.path))
    }
    expect(EVENT_RAIL.settings.fields.find((f) => f.path === 'title')?.required).toBe(true)
    expect(EVENT_RAIL.settings.fields.find((f) => f.path === 'timeZone')?.kind).toBe('select')
  })

  it('renders the start, the place, and the price because the manifest places them on the rail after creation (ADR-1281)', () => {
    for (const path of ['startsAt', 'location', 'priceCents']) {
      const f = EVENT_MANIFEST.fields.find((x) => x.path === path)
      expect(f?.placement, path).toBe('spark')
      expect(f?.editPlane, path).toBe('rail')
    }
    const undeclared = {
      ...EVENT_MANIFEST,
      fields: EVENT_MANIFEST.fields.map((f) => (f.placement === 'spark' ? { ...f, editPlane: undefined } : f)),
    }
    expect(railForm(undeclared, EVENT_SETTINGS_WRITES, { hostInline: true }).dropped).toEqual([
      { path: 'startsAt', reason: 'spark-only' },
      { path: 'location', reason: 'spark-only' },
      { path: 'priceCents', reason: 'spark-only' },
    ])
  })

  it('hosts the inline plane only because no inline canvas exists yet', () => {
    const unhosted = railForm(EVENT_MANIFEST, EVENT_SETTINGS_WRITES)
    expect(unhosted.dropped).toEqual([
      { path: 'title', reason: 'inline' },
      { path: 'description', reason: 'inline' },
    ])
    expect(railForm(EVENT_MANIFEST, EVENT_GALLERY_WRITES).fields).toEqual([])
  })

  // THE DRIFT TEST against the real manifest. Change one field's placement and the rail follows.
  it('follows a placement change on the manifest with no change to the module', () => {
    const moved = {
      ...EVENT_MANIFEST,
      fields: EVENT_MANIFEST.fields.map((f) => (f.path === 'capacity' ? { ...f, placement: 'inline' as const } : f)),
    }
    const form = railForm(moved, EVENT_SETTINGS_WRITES)
    expect(form.dropped.map((d) => d.path)).toEqual(['title', 'description', 'capacity'])
    expect(railForm(moved, EVENT_SETTINGS_WRITES, { hostInline: true }).fields.map((f) => f.path)).toEqual(
      EVENT_RAIL.settings.fields.map((f) => f.path),
    )
  })

  it('names its composites under sections the manifest declares, each once', () => {
    const sections = new Set(EVENT_MANIFEST.sections.map((s) => s.key))
    for (const c of EVENT_COMPOSITES) expect(sections.has(c.section), c.key).toBe(true)
    expect(new Set(EVENT_COMPOSITES.map((c) => c.key)).size).toBe(EVENT_COMPOSITES.length)
    expect(EVENT_COMPOSITES.map((c) => c.key)).toEqual(['gallery', 'venueSearch', 'mapPin', 'cohosts', 'placement', 'share'])
  })

  it('groups the settings zone by manifest section, in manifest order, dropping empty sections', () => {
    const groups = eventSettingsGroups()
    expect(groups.map((g) => g.section.key)).toEqual(['identity', 'story', 'when', 'where', 'tickets', 'settings'])
    expect(groups.find((g) => g.section.key === 'when')?.fields.map((f) => f.path)).toEqual([
      'startsAt',
      'endsAt',
      'recurrenceType',
      'recurrenceUntil',
      'timeZone',
    ])
    expect(groups.every((g) => g.section.title.length > 0 && g.section.desc.length > 0)).toBe(true)
  })

  it('offers "My circle" only on a Circle scope, leaving the manifest itself untouched (ADR-883)', () => {
    const def = EVENT_RAIL.settings.fields.find((f) => f.path === 'visibility')
    if (!def) throw new Error('the settings zone lost its visibility field')
    expect(eventVisibilityField(def, 'circle')).toBe(def)
    const narrowed = eventVisibilityField(def, 'public')
    expect(narrowed.options?.some((o) => o.value === 'circle_only')).toBe(false)
    expect(narrowed.options?.length).toBe((def.options?.length ?? 0) - 1)
    expect(def.options?.some((o) => o.value === 'circle_only')).toBe(true)
  })
})

describe('the Event rail reads its row and writes its FormData through the key map', () => {
  const row = {
    id: 'e1',
    slug: 'breath',
    title: 'Breath Is Life',
    description: null,
    location: 'The Royal Temple',
    starts_at: '2026-10-01T18:30:00.000Z',
    ends_at: null,
    recurrence_type: null,
    recurrence_until: '2026-12-01T00:00:00.000Z',
    time_zone: null,
    attendance_mode: null,
    online_url: null,
    venue_name: 'Royal Temple',
    street: null,
    city: 'Ojai',
    region: 'CA',
    postal_code: null,
    country: null,
    hide_address: true,
    price_cents: 1250,
    join_mode: null,
    rsvpOpensAt: '2026-09-20T09:00:00.000Z',
    rsvpClosesAt: null,
    visibility: 'circle_only',
    scope_type: 'space',
    capacity: 40,
    energy_tag: null,
    rsvp_requires_approval: false,
    category: null,
    theme: { marketListed: false },
  }

  it('reads each field through its key, with the action shapes read backwards and the manifest defaults for an unset column', () => {
    expect(eventRailValues(row)).toEqual({
      title: 'Breath Is Life',
      category: 'gathering',
      description: '',
      startsAt: '2026-10-01T18:30',
      endsAt: '',
      recurrenceType: 'none',
      recurrenceUntil: '2026-12-01',
      timeZone: 'America/Los_Angeles',
      location: 'The Royal Temple',
      attendanceMode: 'in_person',
      onlineUrl: '',
      venueName: 'Royal Temple',
      street: '',
      city: 'Ojai',
      region: 'CA',
      postalCode: '',
      country: '',
      hideAddress: 'true',
      priceCents: '12.5',
      joinMode: 'auto',
      'details.rsvpWindow.opensAt': '2026-09-20T09:00',
      'details.rsvpWindow.closesAt': '',
      // circle_only on a non-Circle scope reads as the unlisted the server steps it down to.
      visibility: 'unlisted',
      capacity: '40',
      energyTag: '',
      rsvpRequiresApproval: 'false',
      // The theme bag's own default is ON; this row switched it off.
      checkInEnabled: 'true',
      marketListed: 'false',
    })
    expect(eventRailValues({ ...row, scope_type: 'circle', visibility: null }).visibility).toBe('circle_only')
  })

  it('sends every settings key the action reads, each switch as on/off so it can turn OFF, and the pin beside them', () => {
    const values = eventRailValues(row)
    const fd = eventSettingsFormData(values, { lat: 34.45, lng: -119.24 })
    const sent = Object.fromEntries(fd.entries())
    expect(Object.keys(sent).sort()).toEqual([...EVENT_SETTINGS_WRITES.map((p) => EVENT_COLUMNS[p]), ...EVENT_PIN_KEYS].sort())
    expect(sent).toMatchObject({
      title: 'Breath Is Life',
      starts_at: '2026-10-01T18:30',
      price: '12.5',
      rsvp_opens_at: '2026-09-20T09:00',
      hide_address: 'on',
      rsvp_requires_approval: 'off',
      checkin_enabled: 'on',
      market_listed: 'off',
      lat: '34.45',
      lng: '-119.24',
    })
    const noPin = eventSettingsFormData(values, { lat: null, lng: null })
    expect(noPin.get('lat')).toBe('')
    expect(noPin.get('lng')).toBe('')
  })
})

describe('the Event settings module renders the plan, not a field list', () => {
  const source = readFileSync(join(__dirname, 'event-settings-module.tsx'), 'utf8')

  it('imports the plan, renders its groups under the manifest section titles, and sends the plan FormData', () => {
    expect(source).toMatch(/from '\.\/event-rail-plan'/)
    expect(source).toMatch(/eventSettingsGroups\(\)/)
    expect(source).toMatch(/\{section\.title\}/)
    expect(source).toMatch(/eventSettingsFormData\(valuesRef\.current, pinRef\.current\)/)
  })

  it('declares no autosave field of its own (a named Input, Textarea, Select, Checkbox, or hidden input)', () => {
    expect(source).not.toMatch(/<(?:Input|Textarea|Select|Checkbox)\b[^>]*\bname=/)
    expect(source).not.toMatch(/type="hidden"/)
  })

  it('renders every composite the plan names, and none it does not', () => {
    const rendered: Record<(typeof EVENT_COMPOSITES)[number]['key'], RegExp> = {
      gallery: /<MultiImageUpload\b/,
      venueSearch: /<VenueAutocomplete\b/,
      mapPin: /<EventLocationPicker\b/,
      cohosts: /<EventCohostChooser\b/,
      placement: /<EventPlacementField\b/,
      share: /<EventShareField\b/,
    }
    for (const c of EVENT_COMPOSITES) expect(source, c.key).toMatch(rendered[c.key])
    expect(Object.keys(rendered).sort()).toEqual([...EVENT_COMPOSITES.map((c) => c.key)].sort())
  })

  it('takes even the zone labels from the manifest', () => {
    for (const zone of ['COVER', 'MORE_PHOTOS', 'PERMALINK']) expect(source).toMatch(new RegExp(`\\{${zone}\\.label`))
  })
})
