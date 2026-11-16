// LIVE-510: the memberships block is registered everywhere it must be, and its pop-up takes the server join panel.
// Re-pointed 2026-11-16 (owner approval, Daniel, "Approve re-pointing both probes"; PROG-E2B). One arm changed:
// the profile section list is no longer hand-written source text in lib/spaces/profile-blocks.ts, it is derived
// in lib/entity-blocks/space-profile.ts, so that arm now LOADS the list and asserts the same consequence
// (memberships is a profile section), plus the gate the row always described (the `memberships` function).
// Every other arm is the inline probe's, unchanged.
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
const Q = '["\\x27]'
const V = rd('components/widgets/space-profile/memberships.tsx')
if (V === null) fail('the memberships block view is gone, so the on-page call to action has nothing to draw')
if (!/MembershipJoinDialog/.test(V)) fail('the block no longer mounts MembershipJoinDialog, so there is no pop-up')
if (!/MembershipJoin\b/.test(V)) fail('the block no longer hands the SERVER join surface into the dialog, so the panel is a second copy of the plans')
const D = rd('components/spaces/membership-join-dialog.tsx')
if (D === null) fail('the membership pop-up component is gone')
if (!/children/.test(D)) fail('the pop-up no longer takes its panel as children, so it builds its own')
if (/listMembershipTiers|space_membership_tiers/.test(D)) fail('the pop-up fetches tiers itself, so the browser carries a second copy of the tier model')

const SECTIONS = 'lib/entity-blocks/space-profile.ts'
if (!fs.existsSync(SECTIONS)) fail(`${SECTIONS} is gone`)
const { PROFILE_BLOCKS, profileBlockById, defaultProfileLayout } = await import(`../../../${SECTIONS}`)
const section = PROFILE_BLOCKS.find((b) => b.id === 'memberships')
if (!section || profileBlockById('memberships') !== section) fail('memberships is not in the S1 profile block registry')
if (section.requiresFunction !== 'memberships') fail('the memberships section is not gated on the memberships function, so it lands in a fresh default for a Space that sells none')
if (!defaultProfileLayout('business', new Set(['memberships'])).includes('memberships')) fail('a Space with memberships on does not get the memberships section in its fresh default')
if (defaultProfileLayout('business', new Set()).includes('memberships')) fail('a Space with memberships off still gets the memberships section in its fresh default')

const R = rd('lib/entity-blocks/registry.ts')
if (R === null) fail('lib/entity-blocks/registry.ts is gone')
if (!new RegExp('id: ' + Q + 'memberships' + Q).test(R)) fail('memberships is not in the unified entity-block registry, so the palette cannot offer it')
const M = rd('components/widgets/space-profile/space-profile-modules.tsx')
if (M === null) fail('the block component map is gone')
if (!/memberships: MembershipsBlock/.test(M)) fail('memberships maps to no component, so a placed block would render nothing')
console.log('ok')
