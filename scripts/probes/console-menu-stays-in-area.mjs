#!/usr/bin/env node
// LIVE-1199 probe: every row of the operator and Space console menus opens inside its console, and the page
// body slides between menu entries. Fails on main before LIVE-1199: Pages, Funnels and Entry points left the
// operator console, and Practices, Journeys, Loom Studio, Email design and Setup left the Space console.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const wrapsAdmin = (p) => /FrequencyAdminConsole/.test(r(p))
if (!wrapsAdmin('app/(main)/pages/layout.tsx')) bad.push('/pages (Pages, Funnels) is outside the operator console')
if (!/requireAdmin\('host', \{ staff: 'marketing' \}\)/.test(r('app/(main)/admin/entry-points/page.tsx'))) bad.push('Entry points has no door inside /admin')
if (!/href: '\/admin\/entry-points'/.test(r('lib/nav/studio.ts'))) bad.push('the Entry points menu row still points at the member route')
// The member shell steps aside on a console route (client side, so a layout alone cannot do it): every route a
// console menu row opens must be in the rule, or the console renders nested inside the member shell.
const rule = r('lib/nav/console-route.ts')
if (!/pages\(\\\/\|\$\)/.test(rule)) bad.push('/pages is not a console route, so the console nests inside the member shell')
for (const d of ['practices', 'journeys', 'loom', 'marketing', 'setup']) if (!new RegExp('[(|]' + d + '[|)]').test(rule)) bad.push(`/spaces/<slug>/${d} is not a console route`)
for (const d of ['practices', 'journeys', 'loom', 'marketing', 'setup']) {
  if (!/FrequencySpaceConsole/.test(r(`app/(main)/spaces/[slug]/${d}/layout.tsx`))) bad.push(`/spaces/<slug>/${d} is outside the Space console`)
}
const slide = r('components/frequency/admin/console-slide.tsx')
if (!/<ViewTransition/.test(slide) || !/key=\{pathname\}/.test(slide)) bad.push('the console slide is gone')
if (!/<ConsoleSlide>/.test(r('components/frequency/admin/admin-shell.tsx'))) bad.push('the shell does not slide its page body')
if (!/transitionTypes=\{slideTypes/.test(r('components/frequency/admin/admin-nav.tsx'))) bad.push('the menu links carry no slide direction')
const css = r('app/themes/frequency/admin-shell.css')
if (!/fq-slide-forward-in/.test(css)) bad.push('the slide has no style')
if (!/prefers-reduced-motion:reduce\)\{\s*::view-transition-old/.test(css)) bad.push('the slide ignores reduced motion')

if (bad.length) { console.error('LIVE-1199 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1199: the console menus stay in their area and the page slides')
