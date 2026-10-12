// LIVE-901 / LIVE-261 probe: a new Business or Nonprofit Space walks its owner through the setup
// wizard before the Circles manager (ADR-1733), and the Circles manager is still where every Space
// ends up. Runs the REAL pure rule (lib/spaces/setup.ts) and reads the seams that hang on it.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/space-setup.mjs
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { postCreateLanding, spaceSetupFinishHref, spaceSetupHref, spaceSetupSteps } from '../../lib/spaces/setup.ts'
import { SPACE_MANIFEST } from '../../lib/studio/entities/space.ts'

/** Source with comment-only lines dropped, so a probe measures code and not its explanation. */
const code = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')

// ── The landing rule: console types walk setup, every other type keeps LIVE-261's landing ────
assert.equal(postCreateLanding('business', 'river-yoga'), '/spaces/river-yoga/setup')
assert.equal(postCreateLanding('nonprofit', 'river-fund'), '/spaces/river-fund/setup')
assert.equal(postCreateLanding('root', 'frequency'), '/spaces/frequency/manage/circles')
assert.equal(spaceSetupFinishHref('river-yoga'), '/spaces/river-yoga/manage/circles')
assert.equal(spaceSetupHref('river-yoga'), '/spaces/river-yoga/setup')

// ── The steps come off the manifest, in the owner's order, and end on the doors ───────────────
assert.deepEqual(
  spaceSetupSteps(SPACE_MANIFEST).map((s) => s.key),
  ['story', 'identity', 'contact', 'offerings', 'first-things'],
)

// ── createSpace USES the rule (not a hardcoded landing) ─────────────────────────────────────
const provision = code('lib/spaces/provision.ts')
assert.ok(provision.includes('redirect(postCreateLanding(type, slug))'), 'createSpace must redirect through postCreateLanding')
assert.ok(!/redirect\(`\/spaces\/\$\{slug\}\/manage\/circles`\)/.test(provision), 'createSpace must not hardcode the Circles landing any more')

// ── The setup route exists, is gated, finishes on the Circles manager, and offers both doors ──
const page = 'app/(main)/spaces/[slug]/setup/page.tsx'
const spark = 'app/(main)/spaces/[slug]/setup/space-setup-spark.tsx'
assert.ok(existsSync(page), `${page} missing`)
assert.ok(existsSync(spark), `${spark} missing`)
const pageSrc = code(page)
assert.ok(pageSrc.includes('resolveSpaceManageAccess') && pageSrc.includes('isConsoleSpaceType'), 'the setup page must gate on manage access and console type')
const sparkSrc = code(spark)
assert.ok(sparkSrc.includes('spaceSetupFinishHref(slug)'), 'the setup must finish on the LIVE-261 landing')
assert.ok(sparkSrc.includes('/circles/new') && sparkSrc.includes('/events/new?space='), 'both First things doors must be offered')
for (const action of ['updateSpaceProfile(', 'setSpaceBusinessInfo(', 'setSpaceImages(', 'setSpaceAccent(']) {
  assert.ok(sparkSrc.includes(action), `the setup must save through the existing ${action} action`)
}
assert.ok(sparkSrc.includes('suggestTaglineAction(') && sparkSrc.includes('draftSpaceBioAction('), 'Vera drafts through the Space copilot seam')

// ── Older Spaces get the one door from the readiness card ───────────────────────────────────
const card = code('app/(main)/spaces/[slug]/settings/profile-completeness-card.tsx')
assert.ok(card.includes('setupHref') && card.includes('Finish setting up'), 'the readiness card must offer the setup door')
const editor = code('app/(main)/spaces/[slug]/manage/identity-editor.tsx')
assert.ok(editor.includes('spaceSetupHref('), 'the identity editor must pass the setup door for console types')

console.log('space-setup probe: ok')
