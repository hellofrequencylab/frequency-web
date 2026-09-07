import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JOURNEY_MANIFEST } from '@/lib/studio/entities/journey'
import { railForm } from '@/lib/studio/kernel/edit-plan'
import {
  JOURNEY_RAIL,
  JOURNEY_ATTRIBUTE_WRITES,
  JOURNEY_DELIVERY_WRITES,
  JOURNEY_HEADER_WRITES,
  JOURNEY_IDENTITY_WRITES,
  JOURNEY_MEETING_WRITES,
  JOURNEY_VISIBILITY_WRITES,
  journeyAttributesPatch,
  journeyDeliveryPatch,
  journeyMeetingPatch,
  journeyMetaPatch,
  journeyRailValues,
  journeyRewards,
} from './journey-rail-plan'

// ─────────────────────────────────────────────────────────────────────────────
// THE JOURNEY RAIL DERIVES FROM ITS MANIFEST (ADR-1240 · ADR-1246, the Journey third of HYG-050).
//
// The same three properties the Practice plan pins, which the hand-mounted editor lacked:
//   1. the rail renders EXACTLY the fields the editor rendered before the derivation, by zone;
//   2. every written column is honoured, so no save path writes a column the rail cannot show;
//   3. a placement change on the manifest changes the rail, with no edit to the module.
// Plus the two things a JSON-argument rail adds: the row reads into values by manifest path, and
// each column-to-key map round-trips those values into the shape its action takes.
// ─────────────────────────────────────────────────────────────────────────────

const TOUCHPOINT = ['format', 'schedule', 'timezone', 'location', 'link', 'notes', 'eventId']

describe('the Journey rail plan', () => {
  it('renders the same fields the hand-mounted editor rendered, in the same six zones', () => {
    expect(JOURNEY_RAIL.identity.fields.map((f) => f.path)).toEqual(['title', 'summary'])
    expect(JOURNEY_RAIL.header.fields.map((f) => f.path)).toEqual([
      'cover_image',
      'logo_image',
      'header_overlay_style',
      'header_overlay_color',
    ])
    expect(JOURNEY_RAIL.delivery.fields.map((f) => f.path)).toEqual([
      'completion_gems',
      'drip_interval_days',
      'certificate_enabled',
    ])
    expect(JOURNEY_RAIL.visibility.fields.map((f) => f.path)).toEqual(['visibility'])
    expect(JOURNEY_RAIL.attributes.fields.map((f) => f.path)).toEqual([
      'difficulty',
      'category',
      'tags',
      'daily_minutes',
      'enroll_cap',
    ])
    expect(JOURNEY_RAIL.meeting.fields.map((f) => f.path)).toEqual([
      ...TOUCHPOINT.map((k) => `meeting.${k}`),
      ...TOUCHPOINT.map((k) => `meeting.gathering.${k}`),
    ])
  })

  it('honours every written column: nothing a save path writes is missing from the rail', () => {
    for (const [name, zone] of Object.entries(JOURNEY_RAIL)) expect(zone.dropped, name).toEqual([])
  })

  it('writes each column on exactly one save path', () => {
    const all = [
      ...JOURNEY_IDENTITY_WRITES,
      ...JOURNEY_HEADER_WRITES,
      ...JOURNEY_DELIVERY_WRITES,
      ...JOURNEY_VISIBILITY_WRITES,
      ...JOURNEY_ATTRIBUTE_WRITES,
      ...JOURNEY_MEETING_WRITES,
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('reads label, kind, options, and required from the manifest, never from the module', () => {
    const byPath = new Map(JOURNEY_MANIFEST.fields.map((f) => [f.path, f]))
    for (const zone of Object.values(JOURNEY_RAIL)) {
      for (const f of zone.fields) expect(f).toBe(byPath.get(f.path))
    }
    expect(JOURNEY_RAIL.identity.fields[0]?.required).toBe(true)
    // The three columns the rail persisted for a year without a declaration (ADR-1246).
    expect(JOURNEY_RAIL.header.fields.map((f) => f.kind)).toEqual(['image', 'image', 'select', 'color'])
    expect(JOURNEY_RAIL.header.fields[2]?.options?.map((o) => o.value)).toEqual(['none', 'shadow', 'fade'])
  })

  it('the header zone keeps the cover ahead of the logo, which the module relies on', () => {
    expect(JOURNEY_RAIL.header.fields.filter((f) => f.kind === 'image').map((f) => f.path)).toEqual([
      'cover_image',
      'logo_image',
    ])
  })

  it('hosts the inline plane only in the identity form, and only because no inline canvas exists yet', () => {
    const unhosted = railForm(JOURNEY_MANIFEST, JOURNEY_IDENTITY_WRITES)
    expect(unhosted.fields).toEqual([])
    expect(unhosted.dropped).toEqual([
      { path: 'title', reason: 'inline' },
      { path: 'summary', reason: 'inline' },
    ])
  })

  // THE DRIFT TEST against the real manifest. Change one field's placement and the rail follows.
  it('follows a placement change on the manifest with no change to the module', () => {
    const moved = {
      ...JOURNEY_MANIFEST,
      fields: JOURNEY_MANIFEST.fields.map((f) => (f.path === 'tags' ? { ...f, placement: 'spark' as const } : f)),
    }
    const form = railForm(moved, JOURNEY_ATTRIBUTE_WRITES)
    expect(form.fields.map((f) => f.path)).toEqual(['difficulty', 'category', 'daily_minutes', 'enroll_cap'])
    expect(form.dropped).toEqual([{ path: 'tags', reason: 'spark-only' }])
  })
})

describe('the rail reads the row by manifest path, and writes each action its own shape', () => {
  const row = {
    title: 'Sleep reset',
    summary: null,
    cover_image: 'https://x/cover.jpg',
    logo_image: null,
    header_overlay_style: null,
    header_overlay_color: '#112233',
    completion_gems: 40,
    drip_interval_days: null,
    certificate_enabled: true,
    visibility: 'unlisted',
    difficulty: 'gentle',
    category: null,
    tags: ['sleep', 'calm'],
    daily_minutes: 15,
    enroll_cap: null,
    meeting: {
      format: 'hybrid',
      schedule: 'Sundays 7pm',
      timezone: 'ET',
      location: 'The hall',
      link: 'https://meet',
      notes: null,
      eventId: 'evt1',
      gathering: null,
    },
  }

  it('reads scalars, lists, booleans, dotted paths, and the manifest defaults for unset columns', () => {
    const v = journeyRailValues(row)
    expect(v.title).toBe('Sleep reset')
    expect(v.summary).toBe('')
    expect(v.tags).toBe('sleep, calm')
    expect(v.certificate_enabled).toBe('true')
    expect(v.completion_gems).toBe('40')
    // Manifest `read` defaults: a 7 day drip, Shade.
    expect(v.drip_interval_days).toBe('7')
    expect(v.header_overlay_style).toBe('shadow')
    expect(v['meeting.format']).toBe('hybrid')
    expect(v['meeting.eventId']).toBe('evt1')
    expect(v['meeting.gathering.format']).toBe('')
    // Only the rail's fields, never the Spark's brief.
    expect(v['answers.who']).toBeUndefined()
  })

  it('journeyMetaPatch sends only the zone it is asked for, with the action’s key names', () => {
    const v = journeyRailValues(row)
    expect(journeyMetaPatch(v, JOURNEY_IDENTITY_WRITES)).toEqual({ title: 'Sleep reset', summary: null })
    expect(journeyMetaPatch(v, JOURNEY_HEADER_WRITES)).toEqual({
      coverImage: 'https://x/cover.jpg',
      logoImage: null,
      headerOverlayStyle: 'shadow',
      headerOverlayColor: '#112233',
    })
  })

  it('journeyRewards and journeyDeliveryPatch read numbers and the toggle', () => {
    const v = journeyRailValues(row)
    expect(journeyRewards(v)).toBe(40)
    expect(journeyDeliveryPatch(v)).toEqual({ certificateEnabled: true, dripIntervalDays: 7 })
    expect(journeyRewards({ completion_gems: '' })).toBe(0)
  })

  it('journeyAttributesPatch splits tags the way the kit joins them and sends empty as null', () => {
    expect(journeyAttributesPatch(journeyRailValues(row))).toEqual({
      difficulty: 'gentle',
      category: null,
      tags: ['sleep', 'calm'],
      dailyMinutes: 15,
      enrollCap: null,
    })
  })

  it('journeyMeetingPatch rebuilds both touchpoints and rejects a format the shape does not know', () => {
    const v = journeyRailValues(row)
    const m = journeyMeetingPatch(v)
    expect(m.format).toBe('hybrid')
    expect(m.eventId).toBe('evt1')
    expect(m.notes).toBeNull()
    expect(m.gathering).toEqual({
      format: null,
      schedule: null,
      timezone: null,
      location: null,
      link: null,
      notes: null,
      eventId: null,
    })
    expect(journeyMeetingPatch({ ...v, 'meeting.format': 'telepathy' }).format).toBeNull()
  })
})

describe('the Journey settings module renders the plan, not an editor', () => {
  const source = readFileSync(join(__dirname, 'journey-settings-module.tsx'), 'utf8')

  it('imports the plan and hands each zone’s fields to the rail renderer', () => {
    expect(source).toMatch(/from '\.\/journey-rail-plan'/)
    expect(source).toMatch(/JOURNEY_RAIL\.identity\.fields/)
    expect(source).toMatch(/JOURNEY_RAIL\.delivery\.fields/)
    expect(source).toMatch(/JOURNEY_RAIL\.attributes\.fields/)
    expect(source).toMatch(/JOURNEY_RAIL\.visibility\.fields/)
  })

  it('no longer mounts the hand-drawn editor, and declares no field of its own', () => {
    expect(source).not.toMatch(/<JourneySettings\b/)
    expect(source).not.toMatch(/<(?:Input|Textarea|Select)\b/)
  })

  it('takes even the image labels and the touchpoint headings from the manifest', () => {
    expect(source).toMatch(/label=\{COVER\.label\}/)
    expect(source).toMatch(/label=\{LOGO\.label\}/)
    expect(source).toMatch(/\{section\.title\}/)
  })
})
