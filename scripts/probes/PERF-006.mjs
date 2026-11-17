#!/usr/bin/env node
// PERF-006: signed-in /events was about 590 KB of HTML and took about 2.1 s to arrive in full (2026-11-17,
// headers in 0.7 to 0.9 s). Three things rode in it that the first paint never shows. Checks in source:
//   1. The map lightbox no longer receives every map row from the page; it reads them when it opens.
//   2. The Around you map tile gets slim pins (id, title, lat, lng, going), not the full rows.
//   3. The right rail's Invite a friend QR (about 35 KB of SVG on every signed-in page) loads on open.
//   4. The /events ItemList JSON-LD is capped instead of listing every upcoming event.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const body = read('components/frequency/members/events/events-body.tsx')
if (/<FqEventsMapLightbox[^>]*\bitems=/.test(body)) fails.push('the /events body still hands the map lightbox every map row')
if (!/<FqEventsMapLightbox[^>]*\bparams=/.test(body)) fails.push('the /events lightbox does not read its rows by the page filters')
if (!/\.map\(toAyMapPin\)/.test(body)) fails.push('the Around you tile still gets full map rows')

const box = read('components/frequency/members/events/events-map-lightbox.tsx')
if (!/loadEventsMapItems\(/.test(box)) fails.push('the lightbox never reads its own rows')
if (!/items: AyMapPin\[\]/.test(box)) fails.push('the map tile is not typed to slim pins')

const rail = read('components/sidebar/right-sidebar.tsx')
if (/renderStyledQrSvg\(/.test(rail.replace(/\/\/.*$/gm, ''))) fails.push('the right rail still renders the invite QR into every page')
const invite = read('components/sidebar/invite-friend-button.tsx')
if (!/format=svg/.test(invite)) fails.push('the invite popup does not read its QR from /api/qr')

const page = read('app/(main)/events/page.tsx')
if (!/eventsListingSchema\(data\.sortedEvents\.slice\(0, LISTING_LD_CAP\)/.test(page)) fails.push('the /events ItemList still lists every upcoming event')

if (fails.length) {
  console.error(`PERF-006 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('PERF-006 ok: the /events HTML leaves the map rows, the invite QR and the long ItemList for when they are used')
