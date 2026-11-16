// LIVE-525: an operator can add an FAQ section to their own page.
// Re-pointed 2026-11-16 (owner approval, Daniel, "Approve re-pointing both probes"; PROG-E2B). The first arm
// read lib/spaces/profile-blocks.ts as source text. That hand-written list is folded into the registry, so the
// arm now LOADS the derived list (lib/entity-blocks/space-profile.ts) and asserts the same consequences: faq is
// a profile section, about is too (the control), faq carries no function gate, and it applies to every space
// type. Two consequences the text match could only imply are measured outright: faq is in a fresh default with
// every function off, and a saved faq id is not dropped. The registry and render-map arms are unchanged.
import fs from 'node:fs'
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
const rd = (f) => {
  try {
    return fs.readFileSync(f, 'utf8')
  } catch {
    return null
  }
}
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const SECTIONS = 'lib/entity-blocks/space-profile.ts'
if (!fs.existsSync(SECTIONS)) fail('the profile block registry is gone')
const { PROFILE_BLOCKS, profileBlockById, defaultProfileLayout } = await import(`../../../${SECTIONS}`)
if (!Array.isArray(PROFILE_BLOCKS)) fail('PROFILE_BLOCKS is gone')
const row = PROFILE_BLOCKS.find((b) => b.id === 'faq')
if (!row) fail('faq is in the ProfileBlockId union and renders everywhere, but still has NO PROFILE_BLOCKS row: the block picker cannot offer it and no fresh default layout can include it, so an operator cannot add an FAQ section to their own page')
if (!PROFILE_BLOCKS.some((b) => b.id === 'about')) fail('the registry lost its about row, so this check is reading the wrong thing')
if (row.requiresFunction !== null) fail('the faq row now carries a SPACE_FUNCTION gate, so defaultProfileLayout drops FAQ for every Space with that switch off: FAQ has no such switch (block-data-sources gives it functionKey null), and the gate puts the section back out of an operator reach')
if (!(Array.isArray(row.types) && row.types.length === 1 && row.types[0] === '*')) fail('the faq row no longer applies to every space type, so some Spaces cannot add an FAQ section')
for (const type of ['business', 'nonprofit']) {
  if (!defaultProfileLayout(type, new Set()).includes('faq')) fail(`a fresh default for a ${type} Space with every function off has no FAQ section`)
}
if (profileBlockById('faq') !== row) fail('a saved faq id does not validate as a profile section, so the flat render drops it as unknown')

const R = rd('lib/entity-blocks/registry.ts')
if (R === null) fail('the unified entity block registry is gone')
const rc = code(R)
const ci = rc.indexOf('CORE_PROFILE_BLOCK_IDS')
const ki = rc.indexOf('KIND_PALETTE_EXCLUSIONS')
if (ci < 0 || ki <= ci) fail('the curated palette set CORE_PROFILE_BLOCK_IDS is gone, so this check cannot read the offer')
const core = rc.slice(ci, ki)
if (!/.faq./.test(core)) fail('faq is not in CORE_PROFILE_BLOCK_IDS, the set profilePaletteForKind narrows the palette to, so the block picker does not offer FAQ however many registry rows it has')
const M = rd('components/widgets/space-profile/space-profile-modules.tsx')
if (M === null) fail('the space profile render map is gone')
if (!/faq: FaqBlock/.test(code(M))) fail('faq has no render component, so it would be offered and then draw nothing once placed')
console.log('LIVE-525 ok')
