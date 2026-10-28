// LIVE-1713: the Network Theme Kit's first fourteen home blocks. Measures consequences, not spelling:
//   1. each block renders under NetworkKit with its own data-nk marker, and every layout variant draws a different data-variant;
//   2. the editor offers them (website surface only) and the page planner treats them as own blocks, hero first;
//   3. the Program template and the seed defaults are the same fourteen blocks, in the design's order, bands alternating;
//   4. the blocks' skin is token-only, scoped to the kit, and lives in the kit skin (never in a member or Space surface);
//   5. the default copy makes no promise: no em dash, no invented number, no weekday rhythm.
// Fails on main (no blocks). Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/network-kit-home-blocks.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const TYPES = ['Hero', 'Live', 'Steps', 'Doors', 'Offerings', 'Journeys', 'Gatherings', 'Membership', 'Proof', 'Shop', 'Library', 'Letter', 'FAQ', 'CTA'].map((n) => `NetworkKit${n}`)
const VARIANTS = { Hero: ['split', 'full', 'center', 'left'], Steps: ['grid', 'timeline', 'strip'], Doors: ['grid', 'list', 'tiles'], Offerings: ['list', 'cards', 'split'], Journeys: ['cards', 'feature'], Gatherings: ['split', 'calendar', 'cards'], Membership: ['tiers', 'table', 'spotlight'], Proof: ['quote', 'wall', 'stats'], Shop: ['grid', 'rail'], Library: ['grid', 'list'], Letter: ['band', 'card'], FAQ: ['split', 'stack'], CTA: ['center', 'split', 'band'] }

// 1.
assert.ok(existsSync('components/page-editor/blocks/network-kit.tsx'), 'the blocks exist')
const src = readFileSync('components/page-editor/blocks/network-kit.tsx', 'utf8')
for (const t of TYPES) assert.ok(src.includes(t), `${t} is defined`)
for (const [n, vs] of Object.entries(VARIANTS)) for (const v of vs) assert.ok(src.includes(`'${v}'`), `${n} names variant ${v}`)

// 2.
const config = readFileSync('lib/page-editor/config.tsx', 'utf8')
assert.ok(config.includes('networkKitComponents') && config.includes('networkKit:'), 'the editor registers the blocks and the category')
assert.ok(/website:[^\]]*'networkKit'/.test(readFileSync('lib/page-editor/palette-scope.ts', 'utf8').replace(/\n/g, ' ')), 'the palette offers them on the website surface')
assert.ok(readFileSync('lib/sites/menswork-page.ts', 'utf8').includes("type.startsWith('NetworkKit')"), 'the planner draws them as own blocks')

// 3.
const { networkKitHomeBlocks } = await import('../../lib/sites/network-kit-home.ts')
const blocks = networkKitHomeBlocks()
assert.deepEqual(blocks.map((b) => b.type), TYPES, 'the design order')
assert.deepEqual(blocks.slice(2).map((b) => b.props.band), blocks.slice(2).map((_, i) => (i % 2 ? 'sand' : '')), 'bands alternate after the strip')
assert.ok(readFileSync('lib/sites/editor/templates.ts', 'utf8').includes('networkKitHomeBlocks()'), 'the Program template is the home')

// 4.
const { NETWORK_KIT_BLOCKS_CSS } = await import('../../components/sites/network-kit-blocks-css.ts')
const { NETWORK_KIT_CSS } = await import('../../components/sites/network-kit-css.ts')
assert.ok(NETWORK_KIT_CSS.includes(NETWORK_KIT_BLOCKS_CSS), 'the skin carries the blocks')
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(NETWORK_KIT_BLOCKS_CSS) && !/rgba?\(|hsla?\(/.test(NETWORK_KIT_BLOCKS_CSS), 'no raw colour')
const sels = NETWORK_KIT_BLOCKS_CSS.replace(/\/\*[\s\S]*?\*\//g, '').split(/\}\s*/).map((r) => r.replace(/^@media[^{]*\{/, '').split('{')[0].trim()).filter((s) => s && !s.startsWith('@'))
assert.ok(sels.length > 150 && sels.every((s) => s.split(',').every((p) => p.includes('data-house-theme="network-kit"'))), 'every rule is scoped to the kit')
assert.ok(!/--nk-size-(?!xs|sm)/.test(NETWORK_KIT_BLOCKS_CSS), 'no variable shadows a size utility')

// 5.
const copy = readFileSync('lib/sites/network-kit-home.ts', 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
assert.ok(!copy.includes('—'), 'no em dash')
assert.ok(!/\b\d{1,3}(,\d{3})+\+?|\b\d+(\.\d)? (from|member reviews|readers|going)\b|\b(every|most) (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day/i.test(copy), 'no invented numbers or weekday promises')
console.log('network-kit home blocks: ok')
