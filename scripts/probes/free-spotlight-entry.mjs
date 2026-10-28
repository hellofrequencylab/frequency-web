#!/usr/bin/env node
// VLS-05: every "Get a Free Spotlight" button says the same words, links to /launch/start with where it was
// pressed, shows only while the doorway is on, and sits on the home page, each /for door and each Theme Kit page.
//
// Runs lib/launch/entry.ts and lib/launch/enabled.ts under node and reads the button, the landing route and the
// pages that carry it. Fails when a page loses the button, the label drifts, the button shows with the switch
// off, or the landing opens with it off.
import { readFileSync } from 'node:fs'
import { FREE_SPOTLIGHT_LABEL, freeSpotlightHref } from '../../lib/launch/entry.ts'
import { launchEntryEnabled } from '../../lib/launch/enabled.ts'

const bad = []
const read = (p) => readFileSync(p, 'utf8')

if (FREE_SPOTLIGHT_LABEL !== 'Get a Free Spotlight') bad.push('the button label is not "Get a Free Spotlight"')
const u = new URL(freeSpotlightHref('door', 'coaches-and-healers'), 'https://x.test')
if (u.pathname !== '/launch/start' || u.searchParams.get('utm_campaign') !== 'free-spotlight' || u.searchParams.get('utm_medium') !== 'door' || u.searchParams.get('utm_content') !== 'coaches-and-healers') bad.push('the button address does not land on /launch/start with its utm values')

const button = read('components/marketing/free-spotlight-button.tsx')
if (!/if \(!launchEntryEnabled\(\)\) return null/.test(button)) bad.push('the button shows while the doorway is off')
for (const [file, tag] of [
  ['components/frequency/site/pages/home/frequency-home.tsx', 'surface="home"'],
  ['components/frequency/site/pages/funnel/niche/niche-door.tsx', 'surface="door"'],
  ['components/frequency/site/pages/themes/frequency-themes.tsx', 'surface="themes"'],
  ['components/frequency/site/pages/themes/frequency-theme-kit.tsx', 'surface="theme"'],
]) if (!read(file).includes(`<FreeSpotlightButton ${tag}`)) bad.push(`${file} has no Get a Free Spotlight button`)
if (!/spotlightHref/.test(read('components/frequency/site/pages/themes/frequency-midnight.tsx')) || !/freeSpotlightHref\('theme', 'nocturne'\)/.test(read('app/(marketing)/themes/nocturne/page.tsx'))) bad.push('the Nocturne page has no Get a Free Spotlight button')
if (!/if \(!launchEntryEnabled\(\)\) notFound\(\)/.test(read('app/(marketing)/free-spotlight/page.tsx'))) bad.push('the landing opens while the doorway is off')

delete process.env.LAUNCH_SYSTEM_ENABLED
delete process.env.LAUNCH_ENTRY_ENABLED
if (launchEntryEnabled()) bad.push('the doorway is on with no switch set')
process.env.LAUNCH_ENTRY_ENABLED = 'on'
if (launchEntryEnabled()) bad.push('the doorway opens while the launch itself is off')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ Get a Free Spotlight: one label, one address with its utm values, dark until the switch is on, on every door')
