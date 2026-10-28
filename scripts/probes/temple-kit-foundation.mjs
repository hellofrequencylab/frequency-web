#!/usr/bin/env node
// LIVE-1642: the Temple Theme Kit's Foundation. `temple-kit` is a stored, readable, rendered site theme with its
// own scoped tokens, its 24 textures and a minimal skin, and the older `temple` theme is untouched.
//
// Fails when the id leaves the site theme registry, when the token module stops exporting the scoped block, when
// the block sets the Space's --color-primary family, when the skin is not layered after the house sheets, when the
// editor contract loses its TempleKit entry, or when a texture is missing. Run on main it fails: none of it exists.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []

const style = r('lib/theme/site-style.ts')
if (!/\|\s*'temple-kit'/.test(style) || !style.includes("v === 'temple-kit'")) bad.push("'temple-kit' is not a registered site theme id")
if (!/'temple-kit':\s*\{\s*corners: 'soft', spacing: 'airy', header: 'bar', footer: 'full'/.test(style)) bad.push('temple-kit has no THEME_LOOK default')

const kit = r('lib/theme/temple-kit.ts')
if (!kit.includes('export const TEMPLE_KIT_TOKENS_CSS')) bad.push('lib/theme/temple-kit.ts does not export TEMPLE_KIT_TOKENS_CSS')
if (!kit.includes('[data-house-theme="temple-kit"]')) bad.push('the token block is not scoped to the temple-kit root')
const block = kit.slice(kit.indexOf('export const TEMPLE_KIT_TOKENS_CSS'))
if (/--color-primary[a-z-]*:/.test(block)) bad.push('the token block sets the Space-owned --color-primary family')

const css = r('components/sites/temple-kit-css.ts')
if (!css.includes('TEMPLE_KIT_CSS')) bad.push('components/sites/temple-kit-css.ts does not export TEMPLE_KIT_CSS')
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css)) bad.push('temple-kit-css.ts carries a raw color')

const chrome = r('components/sites/site-chrome.tsx')
if (!/HOUSE_CSS \+ FREQUENCY_PAGE_CSS \+ TEMPLE_KIT_CSS/.test(chrome)) bad.push('site-chrome.tsx does not layer the Temple Kit skin after the house sheets')
const page = r('components/sites/site-page.tsx')
if (!page.includes("siteStyle.theme === 'temple-kit'") || !page.includes('TEMPLE_KIT_CSS')) bad.push('the site page does not wear the Temple Kit skin')
if (/temple-kit/.test(r('app/layout.tsx'))) bad.push('the Temple Kit is wired into the root layout')

if (!r('lib/sites/editor/theme-contract.json').includes('"TempleKit"')) bad.push('theme-contract.json has no TempleKit entry')
if (!r('lib/sites/editor/theme-contract.json').includes('"Temple"')) bad.push('theme-contract.json lost the older Temple entry')

try {
  execFileSync('node', ['scripts/probes/temple-kit-assets.mjs', 'textures'], { stdio: 'pipe' })
} catch {
  bad.push('the 24 textures are not in public/sites/temple-kit/textures')
}

if (bad.length) {
  console.error('LIVE-1642: ' + bad.join('; '))
  process.exit(1)
}
console.log('LIVE-1642: the Temple Theme Kit foundation is in place')
