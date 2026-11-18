#!/usr/bin/env node
// LIVE-2353 probe: the Header style picks in Identity & Branding (Overlay None / Shade / Blend, Height,
// Buttons) reach the Space page. Each pick must be read by the profile layout, handed to the chrome,
// stamped on the hero, and given a rule in the Frequency space-page sheet.
import { readFileSync, existsSync } from 'node:fs'
const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const layout = r('app/(main)/spaces/[slug]/(profile)/layout.tsx')
const chrome = r('components/frequency/members/space/space-chrome.tsx')
const css = r('app/themes/frequency/space-page.css')
if (!/readCoverScrim\(space\.preferences\)/.test(layout)) bad.push('the profile layout never reads the saved overlay')
if (!/scrim=\{coverScrim\}/.test(layout)) bad.push('the overlay is not handed to the chrome')
if (!/height=\{hero\.height\}/.test(layout)) bad.push('the height is not handed to the chrome')
if (!/buttons=\{hero\.buttonOrientation\}/.test(layout)) bad.push('the button layout is not handed to the chrome')
for (const a of ['data-scrim={scrim}', 'data-height={height}', 'data-buttons={buttons}']) {
  if (!chrome.includes(a)) bad.push(`the hero does not stamp ${a.split('=')[0]}`)
}
if (!/\.fqs-hero\[data-scrim="none"\]::before\{display:none\}/.test(css)) bad.push('None still draws the shade')
if (!/\.fqs-hero\[data-scrim="blend"\]::before\{background:[^}]*--fq-bg-canvas/.test(css)) bad.push('Blend does not fade into the page')
if (!/\.fqs-hero\[data-scrim="blend"\][^{]*\.h1\{color:var\(--fq-text-strong\)/.test(css)) bad.push('Blend keeps light text on a light fade')
if (!/\.fqs-hero\.tall\[data-height="short"\]\{min-height/.test(css) || !/\.fqs-hero\.tall\[data-height="tall"\]\{min-height/.test(css)) bad.push('Short and Tall render the same height')
if (!/\.fqs-hero\[data-buttons="stacked"\] \.fqs-acts\{flex-direction:column/.test(css)) bad.push('Stacked buttons still sit in a row')
if (bad.length) { console.error('LIVE-2353: ' + bad.join('; ')); process.exit(1) }
