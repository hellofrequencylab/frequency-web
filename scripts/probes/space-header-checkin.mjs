#!/usr/bin/env node
// LIVE-1283 probe: the Space page's badge strip is a Check In button on the cover's top right.
import { readFileSync, existsSync } from 'node:fs'
const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const layout = r('app/(main)/spaces/[slug]/(profile)/layout.tsx')
const fq = layout.slice(layout.indexOf("SITE_DESIGN === 'frequency'"), layout.indexOf('<DetailTemplate'))
if (!/coverAction=/.test(fq) || !/variant="cover"/.test(fq)) bad.push('the Frequency header has no Check In cover action')
if (/<\/Suspense>\s*\{children\}/.test(fq) && /<BadgeNote[^>]*viewerProfileId=\{viewerProfileId\} \/>/.test(fq)) bad.push('the badge strip is still under the tabs')
if (!/fqs-cover-action/.test(r('components/frequency/members/space/space-chrome.tsx'))) bad.push('the chrome has no cover action slot')
if (!/fqs-cover-action\{position:absolute;top:16px;right:16px/.test(r('app/themes/frequency/space-page.css'))) bad.push('the cover action is not top right')
const b = r('components/spaces/checkin-button.tsx')
if (!/aria-disabled="true"/.test(b) || !/btn pa/.test(b)) bad.push('the button lacks the greyed and illuminated states')
if (!/readCheckinActivated/.test(r('components/spaces/badge-note.tsx'))) bad.push('the button ignores the Space activation')
if (bad.length) { console.error('LIVE-1283: ' + bad.join('; ')); process.exit(1) }
