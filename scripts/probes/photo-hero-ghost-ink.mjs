#!/usr/bin/env node
// LIVE-1973: on a dark photo hero (.phero) under the Commons surface, the ghost pill and the breadcrumb
// trail must keep the kit's light literals. Measured 2026-11-02 in a browser on /discover, /discover/circles,
// /discover/spaces, /discover/journeys, /discover/events and the not-found page: the ghost CTA computed to
// ink rgb(52,49,46) and the crumb links to rgb(77,73,69) on a near-black photo, so neither could be read.
// Two rules caused it: members-ui.css re-inks every .btn in a Commons body with a (0,6,0) selector, and
// site-shell.css re-inks every crumb in a Commons main. This probe reads both sheets.
import { readFileSync } from 'node:fs'
const site = readFileSync('app/themes/frequency/kit-site.css', 'utf8')
const shell = readFileSync('app/themes/frequency/site-shell.css', 'utf8')
const bad = []
if (!/\.fq-commons-body :is\(\.hero,\.phero\) \.btn-ghost:not\(\.fq-commons-body \[data-kit\] \*\)\{color:#F2F5FA/.test(site))
  bad.push('kit-site.css has no Commons-body override for the ghost pill on a .hero/.phero, so members-ui.css re-inks it')
if (!/main \.crumbs:not\(\.phero \*\) \{\s*color: var\(--fq-text-muted\)/.test(shell) || !/main \.crumbs:not\(\.phero \*\) a \{\s*color: var\(--fq-text-body\)/.test(shell))
  bad.push('site-shell.css re-inks the crumbs inside a .phero on the Commons surface')
if (bad.length) {
  console.error(bad.join('; '))
  process.exit(1)
}
console.log('photo-hero ghost pills and crumbs keep their light ink on the Commons surface')
