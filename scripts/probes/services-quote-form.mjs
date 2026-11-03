// LIVE-2094: the Services theme has a real quote form (design: Vanta Quote.jsx) and Vanta's /quote page uses it. Reads the files, never a
// test runner (LIVE-034). The block must be registered, the form must send through the anonymous lead door, and Vanta's quote page must
// carry the block. Exit 1 on the first miss.
import { readFileSync, existsSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!/ServicesQuote: block\(/.test(read('components/page-editor/blocks/services.tsx'))) bad.push('ServicesQuote is not a registered Services block')
const form = read('components/sites/services-quote-form.tsx')
if (!/submitContactForm\(/.test(form) || !/name="company"/.test(form)) bad.push('the quote form does not send through the lead door with its honeypot')
if (!/\.sv-qf\{/.test(read('components/sites/services-css.ts'))) bad.push('the quote form has no Services styling')
if (!/b\('ServicesQuote'/.test(read('lib/sites/vanta-site.ts'))) bad.push("Vanta's quote page does not use the quote form")
const chrome = read('components/sites/site-chrome.tsx')
if (!/const sv = skin\?\.theme === 'services'/.test(chrome) || !/sv-wordmark/.test(chrome)) bad.push('site-chrome.tsx does not draw the Services header and footer')
if (!/\.hs-header::after/.test(read('components/sites/services-css.ts'))) bad.push('the Services sheet does not dress the header')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('Services sites have a three-step quote form; Vanta uses it')
