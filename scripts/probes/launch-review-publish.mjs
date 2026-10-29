#!/usr/bin/env node
// LIVE-1868: ONE Review + Publish screen. Says Publish (never Launch), shows each field with the person's own words
// beside it, writes the same records the inventory reads, never gates on scheduling or photos, and lands on /launch.
//
// Reads the sources (the pure parsing is unit-tested in lib/launch/review.test.ts). Fails when the screen says Launch, when the Publish
// button or the route is gone, when the action stops writing through publishSpotlightStep / patchSpaceWords, when it
// flips websitePublished without a website to publish, when a photo or schedule field is required, or when the form
// stops landing on the overview.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const review = read('lib/launch/review.ts')
const screen = read('components/launch/review-publish.tsx')
const note = read('components/launch/published-note.tsx')
const io = read('lib/launch/review-io.ts')
const actions = read('lib/launch/actions.ts')
const page = read('app/(main)/launch/step/review/page.tsx')
const launchPage = read('app/(main)/launch/page.tsx')

if (!existsSync('app/(main)/launch/step/review/page.tsx') || !review.includes("REVIEW_HREF = '/launch/step/review'")) bad.push('the review route is gone')
const copy = (s) => s.replace(/^import[^\n]*$/gm, '').replace(/^\s*\/\/[^\n]*$/gm, '')
if (/\bLaunch/.test(copy(screen)) || /(title|description|eyebrow)="[^"]*[Ll]aunch/.test(page)) bad.push('the review screen says Launch')
if (!/<Button type="submit">Publish<\/Button>/.test(screen)) bad.push('the Publish button is gone')
if (!/From what you wrote/.test(screen) || !/citesFor/.test(screen)) bad.push('the screen no longer shows the person\'s own words beside a field')
if (/\brequired\b/.test(screen.split('id="later-h"')[1] ?? '') || /name="(photo|event|schedule)/i.test(screen)) bad.push('a photo or schedule field gates Publish')
if (!/publishSpotlightStep/.test(io) || !/patchSpaceWords/.test(io)) bad.push('Publish stopped writing the Spotlight and the Space words')
if (/websitePublished/.test(io.replace(/\/\/[^\n]*/g, ''))) bad.push('Publish flips websitePublished with no website to publish')
if (!/redirect\(PUBLISHED_HREF\)/.test(actions) || !review.includes("PUBLISHED_HREF = '/launch?published=1'")) bad.push('Publish does not land on the overview')
if (!/PublishedNote/.test(launchPage) || /confetti/i.test(copy(note))) bad.push('the done note is missing or has confetti')
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|fontSize/.test(screen + note)) bad.push('the screen uses a raw colour or an inline font size')
if (/—/.test(screen + note + io)) bad.push('an em dash in the copy')

if (!/tagline: oneLine\(raw\.tagline/.test(review) || /toLowerCase|spellcheck|autocorrect/i.test(review)) bad.push('the person\'s own spelling is not kept as typed')
if (!/error: spotlight\.error === REVIEW_ERRORS\.name/.test(review)) bad.push('a Spotlight with no name can publish')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ Review + Publish: says Publish, quotes the person, writes the real records, never gates, lands on the overview')
