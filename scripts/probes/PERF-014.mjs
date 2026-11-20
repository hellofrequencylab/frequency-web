#!/usr/bin/env node
// PERF-014: the public /events page fetches only the banners near the screen, starts no map engine on
// load, and names itself in og:url.
//
// Before (production, 2026-11-19): every event card and every Around you card drew its banner as a CSS
// background, and a background is fetched for every card in the DOM, so /events pulled up to sixty
// upload-size banners before the visitor scrolled (3.75 MB, 201 requests); the crawl saw no og:url.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const fails = []

const card = read('components/frequency/members/events/event-card.tsx')
if (/backgroundImage/.test(card)) fails.push('event-card draws its banner as a CSS background (fetched for every card on the page)')
if (!/<img[\s\S]{0,200}className="ev-ph"[\s\S]{0,200}loading="lazy"/.test(card)) fails.push('event-card has no lazy <img className="ev-ph"> banner')

const ay = read('components/frequency/members/events/around-you.tsx')
if (/backgroundImage/.test(ay)) fails.push('around-you draws a banner as a CSS background')
if (!/src=\{spot\.cover\}[\s\S]{0,120}fetchPriority="high"/.test(ay)) fails.push('the Around you spotlight banner is not an early, high-priority <img>')
if (!/src=\{item\.cover\}[\s\S]{0,120}loading="lazy"/.test(ay)) fails.push('the Around you cards do not load their banners lazily')

const css = read('app/themes/frequency/members-events.css')
if (!/:is\(\.ev-cover,\.ay-spot-cover,\.ay-card-cover\)>\.ev-ph\{[^}]*object-fit:cover/.test(css)) fails.push('members-events.css does not size the .ev-ph banner (object-fit: cover) inside the three covers')

// No map engine on load: the engine is a next/dynamic chunk mounted only inside the open lightbox.
const lb = read('components/frequency/members/events/events-map-lightbox.tsx')
if (!/const MapCanvas = dynamic\(\(\) => import\('@\/components\/maps\/map-canvas'\)/.test(lb)) fails.push('the events map engine is not a lazy chunk')
if (!/\{open && \(/.test(lb)) fails.push('the events map lightbox body is not gated on open')

const pc = read('lib/page-content.ts')
if (!/openGraph: \{[^}]*url: route/.test(pc)) fails.push('pageContentMetadata emits no og:url for /events')

if (fails.length) {
  console.error(`PERF-014 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log('PERF-014 ok: /events banners are lazy <img> (spotlight eager), no map engine on load, og:url set')
