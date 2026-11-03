// LIVE-2069: a Space on the Services theme draws as Services, and Vanta's site exists in code. Reads the files, never a test runner (LIVE-034).
// The site page and chrome must emit the Services sheet and the font class for siteStyle.theme 'services', the accent vars must exist, and the
// Vanta pages must be built from Services blocks. Exit 1 on the first miss.
import { readFileSync, existsSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const page = read('components/sites/site-page.tsx')
if (!/servicesSite\s*=\s*siteStyle\.theme === 'services'/.test(page) || !/SERVICES_SITE_CSS/.test(page) || !/SERVICES_FONT_CLASS/.test(page)) bad.push('site-page.tsx does not dress a Services site')
if (!/SERVICES_SITE_CSS/.test(read('components/sites/site-chrome.tsx'))) bad.push('site-chrome.tsx does not emit the Services sheet')
if (!/theme === 'services'\s*\?\s*servicesAccentVars/.test(read('lib/sites/site-render-style.ts'))) bad.push('site-render-style.ts does not measure the Services accent')
if (!/export function servicesAccentVars/.test(read('lib/theme/services.ts'))) bad.push('servicesAccentVars is missing')
const vanta = read('lib/sites/vanta-site.ts')
if (!/theme: 'Services'/.test(vanta) || !/ServicesHero/.test(vanta)) bad.push('lib/sites/vanta-site.ts is not a Services site')
if (!/readSiteStyle\(\{\}\)\.theme\)\.toBe\('frequency'\)/.test(read('lib/theme/existing-sites-keep-their-theme.test.ts'))) bad.push('the existing-sites guard test is missing')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('Services sites are dressed by the site renderer; Vanta is built on them')
