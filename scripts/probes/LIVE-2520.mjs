// LIVE-2520: the aidentyack.com polish pass. A dropdown's chevron is sized on every hosted site (it drew at the width of its box), the
// line under the Aiden Tyack name spreads to the name's exact width, and the skin carries the design file's own measures: the 60px hero
// and page-form buttons, the khaki and light sage on the pine band, the 1320px photo bands, the 30px top bar. Reads the sources.
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const roles = read('components/sites/role-blocks-css.ts')
const base = roles.slice(roles.indexOf('const BASE = `'), roles.indexOf('const HERO = `'))
if (!/\[data-role\] \.mu-select>svg\{[^}]*width:1rem;height:1rem/.test(base)) bad.push('the dropdown chevron is not sized in the shared sheet every page loads')
if (!/select\[data-part="input"\]\{appearance:none/.test(base)) bad.push('the browser arrow still draws beside the chevron')
const skin = read('components/sites/aiden-tyack-css.ts')
if (/appearance:auto/.test(skin)) bad.push('the Aiden skin brings the browser arrow back')
const chrome = read('components/sites/aiden-tyack-chrome.tsx')
if (!/Array\.from\(tag\)/.test(chrome) || !/at-sr/.test(chrome)) bad.push('the line under the name is not spread letter by letter')
if (!/\.at-logo-tag\{display:flex;justify-content:space-between;width:0;min-width:100%\}/.test(skin)) bad.push('the line under the name does not take the name\'s width')
for (const t of ['--at-khaki:#B6AD90', '--at-moss:#656D4A', '--at-sage-light:#C2C5AA']) if (!read('lib/theme/aiden-tyack.ts').includes(t)) bad.push(`the theme is missing the design colour ${t}`)
if (!/min-height:60px;padding:0 32px;font-size:14px/.test(skin)) bad.push('the hero buttons are not the design\'s 60px')
if (!/\[id\]\{scroll-margin-top:/.test(skin)) bad.push('a jump to a section lands under the sticky header')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('aidentyack.com polish: sized chevron, name-width tagline, design measures and colours, headings clear of the header')
