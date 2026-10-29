// LIVE-1711: the Network Theme Kit has its stand-alone site skin. Measures consequences, not spelling:
//   1. the skin exists and every rule sits under [data-house-theme="network-kit"], so nothing reaches a Space console or a member page;
//   2. it is token-only: no raw colour outside the token block;
//   3. it carries the design's rules: page grain on the root, 2px ink focus 3px off, 44/48/56 controls, pill buttons that rise 1px,
//      28px cards, the leaf crop, sentence-case labels (never uppercase), the four look axes, reduced motion with no moves;
//   4. the chrome wears it: the site page loads the kit faces and skin for this theme only, the chrome draws the lockup, the announce
//      bar, the wave footer, minimal footer and the "Powered by Frequency" line;
//   5. the theme stays in preview (WEBSITE_THEMES_LIVE) until its blocks and pages are built.
// Fails on main (the skin does not exist). Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/network-kit-chrome.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

assert.ok(existsSync('components/sites/network-kit-css.ts'), 'the skin exists')
const { NETWORK_KIT_CSS } = await import('../../components/sites/network-kit-css.ts')
const { NETWORK_KIT_TOKENS_CSS } = await import('../../lib/theme/network-kit.ts')
const skin = NETWORK_KIT_CSS.replace(NETWORK_KIT_TOKENS_CSS, '')

// 1 and 2.
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(skin) && !/rgba?\(|hsla?\(/.test(skin), 'no raw colour in the skin')
const sels = skin.split(/\}\s*/).map((r) => r.replace(/^@media[^{]*\{/, '').split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim()).filter((s) => s && !s.startsWith('@'))
assert.ok(sels.length > 100 && sels.every((s) => s.includes('data-house-theme="network-kit"')), 'every rule is scoped to the kit')

// 3.
for (const needle of ['mix-blend-mode:multiply', 'outline:2px solid var(--color-focus-ring);outline-offset:3px', '--nk-control-h-sm', '--nk-control-h-lg', 'translateY(-1px)', 'scale(.97)', '--nk-radius-card', '--nk-radius-leaf', 'data-footer="minimal"', 'prefers-reduced-motion:reduce', '[data-grade]::before']) assert.ok(skin.includes(needle), `skin holds ${needle}`)
assert.ok(!/text-transform:uppercase/.test(skin), 'labels are sentence case')
assert.ok(NETWORK_KIT_TOKENS_CSS.includes('[data-site-corners="square"]') && NETWORK_KIT_TOKENS_CSS.includes('[data-site-header="pill"]') && NETWORK_KIT_TOKENS_CSS.includes('[data-site-spacing="compact"]'), 'the look axes re-point the tokens the skin reads')

// 4.
const page = readFileSync('components/sites/site-page.tsx', 'utf8')
assert.ok(page.includes('NETWORK_KIT_FONT_CLASS') && page.includes('NETWORK_KIT_CSS') && page.includes("siteStyle.theme === 'network-kit'"), 'the site page wears the kit faces and skin')
assert.ok(!readFileSync('app/layout.tsx', 'utf8').includes('network-kit'), 'no kit face in the root layout')
const chrome = readFileSync('components/sites/site-chrome.tsx', 'utf8')
for (const needle of ["'network-kit'", 'NetworkKitLogo', 'NetworkKitBar', 'NetworkKitHeaderState', 'nk-footer-ground', 'Powered by Frequency', "'minimal'"]) assert.ok(chrome.includes(needle), `chrome has ${needle}`)

// 5.
const state = await import('../../lib/sites/editor/state.ts')
assert.ok(state.WEBSITE_THEMES_LIVE.has('NetworkKit'), 'published to a live site (owner phrase "rewrite probe LIVE-1711", 2026-10-29)')
console.log('network-kit chrome: ok')
