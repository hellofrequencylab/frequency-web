#!/usr/bin/env node
// LIVE-2359 probe: Bold and Wildheart each have the four kit emails, drawn from the theme's own flat token set, and the
// stock catalog lists all eight with generic coaching copy.
import { readFileSync } from 'node:fs'
const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8')
const fail = (m) => { console.error(`LIVE-2359: ${m}`); process.exit(1) }
const mod = read('lib/theme/house-kit-email.ts')
for (const fn of ['houseKitNoteEmail', 'houseKitWelcomeEmail', 'houseKitDatesEmail', 'houseKitReceiptEmail']) {
  if (!new RegExp(`export function ${fn}\\(`).test(mod)) fail(`${fn} is missing`)
}
if (!/MEGA_SURFACES\[theme\]/.test(mod)) fail('the emails do not read the theme\'s own token set')
const catalog = read('lib/email-samples/catalog.ts')
if (!/\.\.\.houseKitSamples\('bold'\)/.test(catalog) || !/\.\.\.houseKitSamples\('wildheart'\)/.test(catalog)) fail('the catalog does not list the Bold and Wildheart kit emails')
if (!/spaceName: 'Your Space name'/.test(catalog)) fail('the house kit samples invent a studio instead of coaching')
console.log('LIVE-2359: Bold and Wildheart each send the four kit emails in their own tokens, with coaching defaults')
