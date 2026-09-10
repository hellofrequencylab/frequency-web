import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { railForm } from '@/lib/studio/kernel/edit-plan'
import { coerceEventDetails } from '@/lib/events/normalize'
import {
  EVENT_RAIL,
  EVENT_COLUMNS,
  EVENT_COMPOSITES,
  EVENT_GALLERY_WRITES,
  EVENT_PIN_KEYS,
  EVENT_PLACEMENT_WRITES,
  EVENT_PERMALINK_WRITES,
  EVENT_REPEAT_CAPS,
  EVENT_REPEAT_PATHS,
  EVENT_SETTINGS_WRITES,
  eventRailValues,
  eventRepeatPayload,
  eventRepeatRows,
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
      'details.features',
      'startsAt',
      'endsAt',
      'recurrenceRule',
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
      'details.specialInstructions',
      'priceCents',
      'joinMode',
      'details.rsvpWindow.opensAt',
      'details.rsvpWindow.closesAt',
      'details.sponsors',
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

  // ADR-1309. The collections were declared on the manifest from the day it was written and reached
  // no edit surface at all, because `railForm` walked `fields` and stopped.
  it('carries the details COLLECTIONS as repeat groups, in manifest order, and only on the settings zone', () => {
    expect(EVENT_RAIL.settings.repeats.map((r) => r.arrayPath)).toEqual([...EVENT_REPEAT_PATHS])
    expect(EVENT_RAIL.gallery.repeats).toEqual([])
    expect(EVENT_RAIL.placement.repeats).toEqual([])
    expect(EVENT_RAIL.permalink.repeats).toEqual([])
  })

  it('leaves the poster LINEUP out: the event-lineup block id binds the host profile box, so it draws nowhere', () => {
    expect(EVENT_MANIFEST.repeats?.map((r) => r.arrayPath)).toContain('details.lineup')
    expect(EVENT_SETTINGS_WRITES).not.toContain('details.lineup')
    expect(EVENT_RAIL.settings.repeats.map((r) => r.arrayPath)).not.toContain('details.lineup')
  })

  it('heads each collection with the name its own block prints, never with the persisted path', () => {
    const byPath = new Map((EVENT_MANIFEST.repeats ?? []).map((r) => [r.arrayPath, r.label]))
    expect(byPath.get('details.tickets')).toBe('Pricing')
    expect(byPath.get('details.schedule')).toBe('Schedule')
    expect(byPath.get('details.links')).toBe('Links')
    // The one the path gets WRONG: the page's own heading for `details.other` is "Details".
    expect(byPath.get('details.other')).toBe('Details')
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
    expect(groups.map((g) => g.section.key)).toEqual([
      'identity',
      'story',
      'when',
      'where',
      'tickets',
      'lineup',
      'host',
      'settings',
      'other',
    ])
    // Two sections have NO field and exist only for their collection. A filter that asked about
    // fields alone would drop the Links editor and the Details editor and say nothing (ADR-1309).
    expect(groups.find((g) => g.section.key === 'host')?.fields).toEqual([])
    expect(groups.find((g) => g.section.key === 'host')?.repeats.map((r) => r.arrayPath)).toEqual(['details.links'])
    expect(groups.find((g) => g.section.key === 'other')?.repeats.map((r) => r.arrayPath)).toEqual(['details.other'])
    expect(groups.find((g) => g.section.key === 'when')?.fields.map((f) => f.path)).toEqual([
      'startsAt',
      'endsAt',
      'recurrenceRule',
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
    // A LEGACY row: the coarse cadence with no rule beside it, which is what every event written
    // before ADR-1299 carries. The reader resolves it against the start (a Thursday) into the rule
    // it means, and joins the stored end on as the picker's `UNTIL=` part.
    recurrence_type: 'weekly',
    recurrence_rule: null,
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
    details: {
      rsvpWindow: { opensAt: '2026-09-20T09:00:00.000Z', closesAt: null },
      features: ['Tea after', 'Mats provided'],
      sponsors: ['Torus Co.'],
      specialInstructions: 'Park on Matilija. The gate code is 1234.',
      tickets: [{ label: 'Early bird', priceCents: 1250, note: 'First 20' }, { label: 'Door' }],
      schedule: [{ time: '18:30', title: 'Doors' }],
      links: [{ label: 'Tickets', url: 'https://example.com/t', kind: 'tickets' }],
      other: [{ label: 'Bring', value: 'A blanket' }],
    },
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
      'details.features': 'Tea after, Mats provided',
      startsAt: '2026-10-01T18:30',
      endsAt: '',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TH;UNTIL=20261201',
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
      'details.specialInstructions': 'Park on Matilija. The gate code is 1234.',
      priceCents: '12.5',
      joinMode: 'auto',
      'details.rsvpWindow.opensAt': '2026-09-20T09:00',
      'details.rsvpWindow.closesAt': '',
      'details.sponsors': 'Torus Co.',
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
    const fd = eventSettingsFormData(values, { lat: 34.45, lng: -119.24 }, eventRepeatRows(row))
    const sent = Object.fromEntries(fd.entries())
    // `series_scope` rides beside the pin and for the same reason: neither is a manifest field or a
    // column. The pin says WHERE, the scope says what the save may REACH (ADR-1307). Both are the
    // form's own, so both are named here rather than derived from the writes list.
    expect(Object.keys(sent).sort()).toEqual(
      [...EVENT_SETTINGS_WRITES.map((p) => EVENT_COLUMNS[p]), ...EVENT_PIN_KEYS, 'series_scope'].sort(),
    )
    // Defaulted NARROW, and defaulted in the BUILDER, so a caller that forgets it cannot widen a
    // save by omission.
    expect(sent.series_scope).toBe('this')
    expect(Object.fromEntries(eventSettingsFormData(values, { lat: null, lng: null }, {}, 'future').entries()).series_scope).toBe('future')
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
    const noPin = eventSettingsFormData(values, { lat: null, lng: null }, {})
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
    // 🔴 ASSERT THE ARGUMENTS, NEVER THE EXACT CALL TEXT. Both sides of this merge pinned the
    // literal string and each one read as a break when the other added its argument — the same
    // trap `lib/events/options.test.ts` records for a `select(...)` string, hit again here. The
    // save must carry the values, the pin, the repeat rows AND the series scope; how the call is
    // wrapped is the formatter's business.
    const call = source.match(/eventSettingsFormData\(([^)]*)\)/)?.[1] ?? ''
    for (const arg of ['valuesRef.current', 'pinRef.current', 'repeatsRef.current', 'scopeRef.current']) {
      expect(call).toContain(arg)
    }
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

  it('renders each section group\'s repeat groups through the shared list control, capped where the server caps them', () => {
    expect(source).toMatch(/<RailManifestRepeat\b/)
    expect(source).toMatch(/rows=\{repeatRows\[def\.arrayPath\] \?\? \[\]\}/)
    expect(source).toMatch(/max=\{EVENT_REPEAT_CAPS\[def\.arrayPath as EventRepeatPath\]\}/)
  })
})

// ── The details collections, read and written (ADR-1309) ────────────────────────────────────────

describe('the Event rail edits the details collections', () => {
  const row = {
    details: {
      rsvpWindow: { opensAt: '2026-09-20T09:00:00.000Z', closesAt: null },
      specialInstructions: 'Gate code 1234',
      tickets: [{ label: 'Early bird', priceCents: 1250, note: 'First 20' }, { label: 'Door' }],
      schedule: [{ time: '18:30', title: 'Doors' }, { title: 'Set' }],
      links: [{ label: 'Tickets', url: 'https://example.com/t', kind: 'tickets' }],
      other: [{ label: 'Bring', value: 'A blanket' }],
    },
  }

  it('reads every declared cell of every stored row, blank where the item has none', () => {
    const rows = eventRepeatRows(row)
    expect(rows['details.tickets']).toEqual([
      // The stored CENTS read back as the whole units the control types in, exactly as the event's
      // own price does. A tier with no price is blank, not "0".
      { label: 'Early bird', priceCents: '12.5', note: 'First 20' },
      { label: 'Door', priceCents: '', note: '' },
    ])
    expect(rows['details.schedule']).toEqual([
      { time: '18:30', title: 'Doors', note: '' },
      { time: '', title: 'Set', note: '' },
    ])
    expect(rows['details.links']).toEqual([{ label: 'Tickets', url: 'https://example.com/t', kind: 'tickets' }])
    expect(rows['details.other']).toEqual([{ label: 'Bring', value: 'A blanket' }])
  })

  it('reads an absent, empty, or malformed collection as no rows rather than throwing', () => {
    expect(eventRepeatRows({})['details.tickets']).toEqual([])
    expect(eventRepeatRows({ details: 'nonsense' })['details.schedule']).toEqual([])
    expect(eventRepeatRows({ details: { tickets: [null, 'x', 3] } })['details.tickets']).toEqual([])
  })

  it('writes the rows back in the shape the details coercion accepts, price in cents again', () => {
    const rows = eventRepeatRows(row)
    const payload = eventRepeatPayload('details.tickets', rows['details.tickets'])
    expect(payload).toEqual([{ label: 'Early bird', priceCents: 1250, note: 'First 20' }, { label: 'Door' }])
    // The round trip is the property that matters: what a host loads and does not touch must save
    // back as what was stored, or every save quietly rewrites the collection.
    expect(coerceEventDetails({ tickets: payload }).tickets).toEqual(row.details.tickets)
    for (const path of EVENT_REPEAT_PATHS) {
      const key = path.slice('details.'.length) as 'tickets' | 'schedule' | 'links' | 'other'
      expect(coerceEventDetails({ [key]: eventRepeatPayload(path, rows[path]) })[key], path).toEqual(row.details[key])
    }
  })

  it('leaves an unusable price OFF the item rather than writing a zero', () => {
    expect(eventRepeatPayload('details.tickets', [{ label: 'Free', priceCents: '', note: '' }])).toEqual([{ label: 'Free' }])
    expect(eventRepeatPayload('details.tickets', [{ label: 'Odd', priceCents: 'abc', note: '' }])).toEqual([{ label: 'Odd' }])
  })

  it('knows nothing about a collection the plan does not carry', () => {
    expect(eventRepeatPayload('details.lineup', [{ name: 'Nobody' }])).toEqual([])
  })

  // 🔴 The cap is the SERVER's, and a row past it is dropped at save with nothing said. Held against
  // the coercion itself rather than against a comment: a cap that drifts is silent data loss.
  it('caps each collection where coerceEventDetails caps it', () => {
    for (const path of EVENT_REPEAT_PATHS) {
      const key = path.slice('details.'.length) as 'tickets' | 'schedule' | 'links' | 'other'
      const cap = EVENT_REPEAT_CAPS[path]
      const one = (i: number) => ({ label: `L${i}`, value: `V${i}`, title: `T${i}`, url: `https://example.com/${i}` })
      const overflowing = Array.from({ length: cap + 3 }, (_, i) => one(i))
      expect(coerceEventDetails({ [key]: overflowing })[key]?.length, path).toBe(cap)
    }
  })

  it('sends each collection as JSON under its own key, always present so an emptied one can clear', () => {
    const fd = eventSettingsFormData({}, { lat: null, lng: null }, eventRepeatRows(row))
    expect(JSON.parse(String(fd.get('details_tickets')))).toEqual([
      { label: 'Early bird', priceCents: 1250, note: 'First 20' },
      { label: 'Door' },
    ])
    const cleared = eventSettingsFormData({}, { lat: null, lng: null }, {})
    for (const path of EVENT_REPEAT_PATHS) expect(cleared.get(EVENT_COLUMNS[path]), path).toBe('[]')
  })
})

// ── The settings action merges the details bag rather than laundering it (ADR-1309) ─────────────
//
// 🔴 THE TRAP THIS PINS SHUT. `coerceEventDetails` is an ALLOW-LIST over the poster harvest: it
// keeps the eight keys it knows and DROPS the rest. `rsvpWindow` is not one of them, and two SQL
// RPCs read `details->'rsvpWindow'` to decide whether a guest may still RSVP. An action that
// round-tripped the whole bag through that function would delete a host's booking window, and the
// only symptom would be RSVPs quietly reopening on an event the host had closed.

describe('updateEventSettings merges the details bag', () => {
  it('coerces only the keys the form carried, and merges them onto what was stored', () => {
    expect(SETTINGS_ACTION).toMatch(/const editedDetails: Record<string, unknown> = \{\}/)
    expect(SETTINGS_ACTION).toMatch(/coerceEventDetails\(editedDetails\)/)
    expect(SETTINGS_ACTION).toMatch(/for \(const key of Object\.keys\(editedDetails\)\)/)
    // The bag itself is never the argument. That single call is the whole defect.
    expect(SETTINGS_ACTION).not.toMatch(/coerceEventDetails\((?:base|next)Details\)/)
  })

  it('keeps the booking window and the door note, which the allow-list would strip', () => {
    expect(SETTINGS_ACTION).toMatch(/nextDetails\.rsvpWindow = \{ opensAt, closesAt \}/)
    expect(SETTINGS_ACTION).toMatch(/nextDetails\.specialInstructions = note/)
    // Both survive because the merge starts from what was already there.
    expect(SETTINGS_ACTION).toMatch(/const nextDetails: Record<string, unknown> = \{ \.\.\.baseDetails \}/)
  })
})
