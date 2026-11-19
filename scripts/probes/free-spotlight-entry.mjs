#!/usr/bin/env node
// LIVE-1629 (Daniel-approved Gate A re-aim, 2026-11-11): keep the former landing link working through its permanent redirect.
// The button, attribution and switch checks remain; the retired landing itself now has a permanent survivor.
import { existsSync, readFileSync } from 'node:fs'
import { FREE_SPOTLIGHT_LABEL, freeSpotlightHref } from '../../lib/launch/entry.ts'
import { launchEntryEnabled } from '../../lib/launch/enabled.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')

if (FREE_SPOTLIGHT_LABEL !== 'Get a Free Spotlight') bad.push('the button label is not "Get a Free Spotlight"')
const u = new URL(freeSpotlightHref('door', 'coaches-and-healers'), 'https://x.test')
if (u.pathname !== '/launch/start' || u.searchParams.get('utm_campaign') !== 'free-spotlight' || u.searchParams.get('utm_medium') !== 'door' || u.searchParams.get('utm_content') !== 'coaches-and-healers') bad.push('the button address does not land on /launch/start with its utm values')

if (!/freeSpotlightHref\('themes'/.test(read('components/frequency/site/pages/themes/frequency-themes.tsx'))) bad.push('the Theme Kits page main buttons do not use the doorway')
const button = read('components/marketing/free-spotlight-button.tsx')
if (!/if \(!launchEntryEnabled\(\)\) return null/.test(button)) bad.push('the button shows while the doorway is off')
for (const [file, tag] of [
  ['components/frequency/site/pages/home/frequency-home.tsx', 'surface="home"'],
  ['components/frequency/site/pages/funnel/niche/niche-door.tsx', 'surface="door"'],
  ['components/frequency/site/pages/themes/frequency-theme-kit.tsx', 'surface="theme"'],
]) if (!read(file).includes(`<FreeSpotlightButton ${tag}`)) bad.push(`${file} has no Get a Free Spotlight button`)
if (!/spotlightHref/.test(read('components/frequency/site/pages/themes/frequency-midnight.tsx')) || !/freeSpotlightHref\('theme', 'nocturne'\)/.test(read('app/(marketing)/themes/nocturne/page.tsx'))) bad.push('the Nocturne page has no Get a Free Spotlight button')

const config = read('next.config.ts')
// /free-spotlight is the Free Spotlight builder again (LIVE-2481, owner 2026-11-19, pin rewrite approved on the card
// "Yes, update all of them"): the page exists, renders the builder, and nothing redirects it away.
const landing = ['app', '(marketing)', 'free-spotlight', 'page.tsx'].join('/')
if (!existsSync(landing) || !/<FreeSpotlightPage/.test(read(landing))) bad.push('/free-spotlight is not the Free Spotlight builder')
if (/source: '\/free-spotlight'/.test(config)) bad.push('/free-spotlight still redirects away from the builder')

delete process.env.LAUNCH_SYSTEM_ENABLED
delete process.env.LAUNCH_ENTRY_ENABLED
if (launchEntryEnabled()) bad.push('the doorway is on with no switch set')
process.env.LAUNCH_ENTRY_ENABLED = 'on'
if (launchEntryEnabled()) bad.push('the doorway opens while the launch itself is off')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('LIVE-1629: the button and switch contract holds and the retired landing permanently redirects to the Create a Space wizard')
