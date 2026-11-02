#!/usr/bin/env node
// LIVE-1978: two axe (WCAG 2.1 AA) misses from the 2026-11-02 sweep crawl. The map list's empty note on /,
// /spaces and /stories carried a link told apart from the text by colour alone (link-in-text-block), and
// the Create a Space meter put role="progressbar" on a block that also holds the Start over button
// (nested-interactive). This probe reads the sheet for the underline and the builder for where the role sits.
import { readFileSync } from 'node:fs'
const css = readFileSync('app/themes/frequency/site-pages-a.css', 'utf8')
// The builder became the studio (LIVE-1965); the role now sits on the "built" reading, never on the segment buttons.
const tsx = readFileSync('components/frequency/site/pages/create-space/create-space-studio.tsx', 'utf8')
const bad = []
if (!/\.fqm\.pa-static \.fqm-note a\{[^}]*text-decoration:underline/.test(css)) bad.push('site-pages-a.css: the map-list note link is colour-only (no underline rule)')
if (/role="progressbar"[^>]*className="cs-segs"/.test(tsx)) bad.push('create-space-studio.tsx: role="progressbar" sits on .cs-segs, which holds the step buttons')
if (!/role="progressbar"[^>]*className="cs-steps-k"/.test(tsx)) bad.push('create-space-studio.tsx: the "built" reading carries no progressbar role')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('the map-list note link is underlined; the studio progressbar is the built reading alone')
