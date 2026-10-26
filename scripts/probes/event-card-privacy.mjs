import assert from 'node:assert/strict'
import { loadProbeModule } from '../lib/probe-module.mjs'

const maps = loadProbeModule('lib/events/maps-link.ts')
const location = loadProbeModule('lib/events/visible-location.ts', { './maps-link': maps })
const credit = loadProbeModule('lib/events/platform-credit.ts')
const focal = loadProbeModule('lib/images/focal-point.ts')
const focus = loadProbeModule('lib/events/cover-focus.ts', { '@/lib/images/focal-point': focal })
let row, heroCalls = 0
const base = { title: 'Synthetic private identity', starts_at: '2027-01-01T12:00:00Z', visibility: 'public', status: 'published', removed_at: null, hide_address: true, location: 'Secret street 123', venue_name: 'Secret venue', street: 'Secret street 123', city: 'Vista', region: 'CA', host: { display_name: 'Synthetic Host', handle: 'synthetic' }, host_space: null, attendance_mode: 'in_person', is_cancelled: false, theme: { coverFocus: '25% 70%' }, cover_image_path: 'synthetic/cover.jpg', poster_path: 'synthetic/poster.jpg', details: {} }
const shared = loadProbeModule('lib/og/event-card.tsx', { '@/lib/og/stage-card': { stageCardResponse: value => value } })
const mapped = await shared.eventCardResponse({ title: 'Fixture title', when: 'Fixture day', where: 'Fixture city', hostLine: 'Fixture host', chip: null, isCancelled: false, coverUrl: 'https://fixture.invalid/shared.jpg', coverFocus: '25% 70%' })
assert.equal(mapped.title, 'Fixture title'); assert.equal(mapped.coverUrl, 'https://fixture.invalid/shared.jpg'); assert.equal(mapped.coverFocus, '25% 70%')
const Image = loadProbeModule('app/(public)/events/[slug]/opengraph-image.tsx', {
  '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
    assert.equal(table, 'events')
    const query = { select: columns => { for (const field of ['visibility', 'status', 'removed_at', 'hide_address', 'cover_image_path', 'poster_path', 'details', 'theme']) assert.ok(columns.split(/[, ]+/).includes(field), `Read ${field}`); return query }, eq: (field, value) => { assert.equal(field, 'slug'); assert.equal(value, 'synthetic-event'); return query }, maybeSingle: async () => ({ data: row }) }
    return query
  } }) },
  '@/lib/events/platform-credit': credit,
  '@/lib/events/hero-url': { resolveEventHeroUrl: async event => { assert.equal(event, row); heroCalls++; return 'https://fixture.invalid/cover.jpg' } },
  '@/lib/events/visible-location': location,
  '@/lib/events/cover-focus': focus,
  '@/lib/og/event-card': { eventCardResponse: value => ({ kind: 'event', ...value }) },
  '@/lib/og/stage-card': { stageCardResponse: value => ({ kind: 'neutral', ...value }) },
  '@/lib/og/content-type': { OG_CONTENT_TYPE: 'image/jpeg' },
  '@/lib/site': { SITE_NAME: 'Frequency' },
}).default
async function render(value) { row = value; heroCalls = 0; return Image({ params: Promise.resolve({ slug: 'synthetic-event' }) }) }
for (const value of [null, ...['private', 'circle_only', null].map(visibility => ({ ...base, visibility })), { ...base, status: 'draft' }, { ...base, removed_at: '2026-01-01T00:00:00Z' }]) {
  const card = await render(value)
  assert.equal(card.kind, 'neutral')
  assert.equal(heroCalls, 0, 'Do not resolve private artwork')
  for (const secret of ['Synthetic', 'Secret', 'Vista', '2027']) assert.equal(JSON.stringify(card).includes(secret), false, 'Neutral card contains no event identity')
}
for (const visibility of ['public', 'unlisted']) {
  const card = await render({ ...base, visibility })
  assert.equal(card.kind, 'event'); assert.equal(card.title, base.title)
  assert.equal(card.where, 'Vista, CA'); assert.equal(card.coverUrl, 'https://fixture.invalid/cover.jpg')
  assert.equal(card.coverFocus, '25% 70%'); assert.equal(heroCalls, 1)
  assert.equal(card.hostLine, 'Hosted by Synthetic Host')
}
const cancelled = await render({ ...base, is_cancelled: true })
assert.equal(cancelled.chip, 'Cancelled'); assert.equal(cancelled.isCancelled, true)
const online = await render({ ...base, attendance_mode: 'online' })
assert.equal(online.chip, 'Online')
console.log('Actual canonical event card route protects private/draft/removed identity, keeps unlisted shares, redacts hidden addresses and preserves artwork/focus; synthetic DB/card dependencies only')
