#!/usr/bin/env node
// LIVE-1460 (ADR-1895), restated for the Theme Kits page (LIVE-2188): /themes shows every kit, from one data file.
//
// Fails when the page route, its SEO entry or its sitemap line goes, when the page stops rendering the kit showcase
// with a kit map to the product themes, or when the page file grows CSS or a raw colour of its own.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (f) => readFileSync(f, 'utf8')
if (!existsSync('app/(marketing)/themes/page.tsx')) bad.push('app/(marketing)/themes/page.tsx is gone')
const gallery = read('components/frequency/site/pages/themes/frequency-themes.tsx')
if (!gallery.includes('<KitShowcase') || !gallery.includes('KIT_THEMES')) bad.push('the page no longer renders the kit showcase from its kit map')
if (/<style|style=\{\{|#[0-9a-fA-F]{6}\b/.test(gallery)) bad.push('the gallery carries page CSS or a raw colour')
if (!read('lib/seo/frequency-pages.ts').includes("path: '/themes',")) bad.push('FREQUENCY_PAGE_SEO has no /themes entry')
if (!read('app/sitemap.ts').includes('/themes`')) bad.push('app/sitemap.ts does not list /themes')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme gallery: route, SEO, sitemap and theme-driven cards are wired')
