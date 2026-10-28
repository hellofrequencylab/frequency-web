#!/usr/bin/env node
// LIVE-1380: the Midnight feature page exists on the template kit, is routed, has its SEO entry and is in the sitemap.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const page = r('components/frequency/site/pages/themes/frequency-midnight.tsx')
if (!page.includes('KeepGoing')) bad.push('the feature page no longer ends on the shared KeepGoing band')
if (/style=\{\{[^}]*(#|rgb)/.test(page)) bad.push('the feature page carries a raw color')
if (!r('app/(marketing)/themes/nocturne/page.tsx').includes('FREQUENCY_PAGE_SEO.midnight')) bad.push('the /themes/nocturne route has no SEO entry')
if (!r('lib/seo/frequency-pages.ts').includes("path: '/themes/nocturne'")) bad.push('FREQUENCY_PAGE_SEO has no midnight entry')
if (!r('app/sitemap.ts').includes('/themes/nocturne')) bad.push('the sitemap does not list /themes/nocturne')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('midnight-feature-page: ok')
