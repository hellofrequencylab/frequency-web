#!/usr/bin/env node
// LIVE-1199 probe: every row of the operator and Space console menus opens inside its console, and the page
// body slides between menu entries. Fails on main before LIVE-1199: Pages, Funnels and Entry points left the
// operator console, and Practices, Journeys, Loom Studio, Email design and Setup left the Space console.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const wrapsAdmin = (p) => /FrequencyAdminConsole/.test(r(p))
if (!wrapsAdmin('app/(main)/pages/layout.tsx')) bad.push('/pages (Pages, Funnels) is outside the operator console')
if (!wrapsAdmin('app/(main)/entry-points/layout.tsx')) bad.push('/entry-points is outside the operator console')
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
