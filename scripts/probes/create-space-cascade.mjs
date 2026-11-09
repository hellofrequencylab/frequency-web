// LIVE-2063: the signed-out builder's choices cascade, the draft is captured on type, and an abandoned claim still gets
// its come-back emails. Reads the files and runs the pure carry under node, never a test runner (LIVE-034). Exit 1 on
// the first miss.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

// 1. Capture on type: the server save no longer waits for the contact step's Continue.
const studio = read('components/frequency/site/pages/create-space/create-space-studio.tsx')
if (!/const sendable = \(d: BuilderDraft\) => Boolean\(leadEmailOf\(d\) && d\.name\.trim\(\)\)/.test(studio)) bad.push('the studio does not save the draft as soon as a name and address are typed')
if (/sendable = .*done\.contact/.test(studio)) bad.push('the studio still gates the server save on the contact step')

// 2. The styles cascade: the review screen passes the hold's carry, the Spotlight step turns the accent into the brand colour.
const reviewIo = read('lib/launch/review-io.ts')
if (!/publishSpotlightStep\(profileId, launch, edits\.spotlight, carry\)/.test(reviewIo)) bad.push('publishReview makes the Space without the carry (handle, Theme Kit, accent)')
const launchActions = read('lib/launch/actions.ts')
if (!/publishReview\(profileId, launch, edits, readCarry\(held\?\.answers\.spotlight\)\)/.test(launchActions)) bad.push('the review Publish button does not hand the hold to publishReview')
const spotlightIo = read('lib/launch/spotlight-io.ts')
if (!/accent: kitAccentFill\(carry\.theme, carry\.accent\)/.test(spotlightIo)) bad.push('the Spotlight step does not turn the carried accent into the Space accent')
const provision = read('lib/spaces/provision.ts')
if (!/fillSpaceBrandAccent\(spaceId, input\.accent\)/.test(provision)) bad.push('createSpace does not write the picked accent as the brand colour')
if (provision.indexOf('fillSpaceBrandAccent(spaceId, input.accent)') > provision.indexOf('applyMegaTheme(spaceId, input.theme)')) bad.push('the picked accent lands after the theme default would fill it')

// 3. An abandoned claim keeps its reminders: converted is stamped at /launch/claim, never at Claim.
const claimActions = read('app/(marketing)/create-a-space/actions.ts')
if (/markDraftConverted/.test(claimActions)) bad.push('Claim still stamps the draft converted before anyone signs in')
const claimRoute = read('app/(main)/launch/claim/route.ts')
if (!/markDraftConverted\(lead\)/.test(claimRoute)) bad.push('/launch/claim does not stamp the carried draft converted')
const handoff = read('lib/create-space/handoff.ts')
if (!/lead: draft\.leadToken/.test(handoff)) bad.push('the hold does not carry the draft token')

// 4. The Network kit preview wears the kit, not the generic mock (Daniel's screenshot, 2026-11-03): its four schemes
//    read from the token module, Marigold first, its own photo library, and the kit's serif voice, badge and arch.
const previewSite = read('lib/create-space/preview-site.ts')
if (!/'network-kit': NETWORK_KIT_SCHEME_ORDER\.map/.test(previewSite)) bad.push('the Network kit preview does not read its accents from the kit schemes')
if (!/'network-kit': \{\s*hero: NETWORK_PHOTO/.test(previewSite)) bad.push('the Network kit preview wears the generic photos')
const previewTokens = read('lib/theme/preview-tokens.ts')
for (const key of ["'--pv-font-em'", "'--pv-art'", "'--pv-badge'"]) if (!previewTokens.includes(key)) bad.push(`the preview contract lost ${key}`)
if (!/emFont: "'Instrument Serif'/.test(previewTokens) || !/badge: true/.test(previewTokens)) bad.push('the Network kit preview lost its serif voice or its badge')

// 5. The pure carry round-trips the token under node.
const { readCarry, carryFields } = await import('../../lib/launch/carry.ts')
const carry = readCarry(carryFields({ theme: 'designer', accent: '2', lead: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345' }))
if (carry.lead !== 'AbCdEfGhIjKlMnOpQrStUvWxYz012345' || carry.accent !== '2') bad.push('the carry drops the token or the accent')
if (readCarry({ lead: 'short' }).lead) bad.push('the carry accepts a token off-shape')

if (bad.length) {
  for (const b of bad) console.error('✗', b)
  process.exit(1)
}
console.log('✓ create-space cascade: capture on type, styles carried to the Space, abandoned claims keep their reminders')
