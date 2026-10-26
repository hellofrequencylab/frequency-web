#!/usr/bin/env node
// LIVE-1460 (ADR-1895): /themes is a gallery of every theme with its starter kits.
//
// Fails when the page route, its SEO entry or its sitemap line goes, when the gallery stops reading the
// theme list and the kit index (so it could drift from the editor), or when it grows page CSS of its own.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (f) => readFileSync(f, 'utf8')
if (!existsSync('app/(marketing)/themes/page.tsx')) bad.push('app/(marketing)/themes/page.tsx is gone')
const gallery = read('components/frequency/site/pages/themes/frequency-themes.tsx')
if (!gallery.includes('SITE_THEMES.map') || !gallery.includes('KIT_INDEX')) bad.push('the gallery no longer reads SITE_THEMES and KIT_INDEX')
if (/<style|style=\{\{|#[0-9a-fA-F]{6}\b/.test(gallery)) bad.push('the gallery carries page CSS or a raw colour')
if (!read('lib/seo/frequency-pages.ts').includes("path: '/themes',")) bad.push('FREQUENCY_PAGE_SEO has no /themes entry')
if (!read('app/sitemap.ts').includes('/themes`')) bad.push('app/sitemap.ts does not list /themes')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme gallery: route, SEO, sitemap and theme-driven cards are wired')
