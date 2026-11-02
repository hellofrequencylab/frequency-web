#!/usr/bin/env node
// LIVE-1978: two axe (WCAG 2.1 AA) misses from the 2026-11-02 sweep crawl. The map list's empty note on /,
// /spaces and /stories carried a link told apart from the text by colour alone (link-in-text-block), and
// the Create a Space meter put role="progressbar" on a block that also holds the Start over button
// (nested-interactive). This probe reads the sheet for the underline and the builder for where the role sits.
import { readFileSync } from 'node:fs'
const css = readFileSync('app/themes/frequency/site-pages-a.css', 'utf8')
const tsx = readFileSync('components/frequency/site/pages/create-space/create-space-builder.tsx', 'utf8')
const bad = []
if (!/\.fqm\.pa-static \.fqm-note a\{[^}]*text-decoration:underline/.test(css)) bad.push('site-pages-a.css: the map-list note link is colour-only (no underline rule)')
if (/role="progressbar"[^>]*className="cs-bld-meter"/.test(tsx)) bad.push('create-space-builder.tsx: role="progressbar" sits on .cs-bld-meter, which holds the Start over button')
if (!/role="progressbar"[^>]*className="ig-ring"/.test(tsx)) bad.push('create-space-builder.tsx: the ring carries no progressbar role')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('the map-list note link is underlined; the builder progressbar is the ring alone')
