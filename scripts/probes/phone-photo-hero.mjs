// LIVE-2487: on a phone the Services and New World photo hero shows the picture, the headline and the button on the first
// screen, and the header keeps the owner's name. Measures the consequences on the sheets that ship:
//   1. at 600px and under the header's copy of the hero button is hidden and the menu panel carries it instead;
//   2. the photo stops being a full-height backdrop: it sits in flow, capped below the screen height, and the copy rises onto
//      its fade (a negative top margin, no 104px top padding);
//   3. the headline is sized for a phone, and the button runs the full width;
//   4. New World lays the same block last, after its own header bar, so nothing later in its sheet undoes it;
//   5. desktop is untouched: every new rule lives inside the phone query.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/phone-photo-hero.mjs
import assert from 'node:assert/strict'

const { SERVICES_SITE_CSS, SERVICES_PHONE_HERO_CSS } = await import('../../components/sites/services-css.ts')
const { NEW_WORLD_CSS } = await import('../../components/sites/new-world-css.ts')

for (const [name, sheet, scope] of [
  ['Services', SERVICES_SITE_CSS, '[data-house-theme="services"]'],
  ['New World', NEW_WORLD_CSS, '[data-house-theme="new-world"]'],
]) {
  const at = sheet.lastIndexOf('@media (max-width:600px){\n' + scope + ' .hs-header-actions>.hs-btn{display:none}')
  assert.ok(at > 0, `${name}: the phone hero block is in the sheet`)
  const block = sheet.slice(at, sheet.indexOf('\n}\n', at))
  assert.ok(block.includes(`${scope} .hs-menu-panel a[data-cta]{display:flex`), `${name}: the menu panel carries the button`)
  assert.match(block, /\.sv-hero--photo \.sv-hero-bg--photo\{position:relative;[^}]*height:min\(60svh,480px\)/, `${name}: the photo sits in flow, capped`)
  assert.match(block, /\.sv-hero--photo \.sv-hero-in\{margin-top:-88px;padding:0 /, `${name}: the copy rises onto the fade`)
  assert.match(block, /\.sv-hero--photo \.sv-hero-copy \.sv-display\{font-size:clamp\(38px,12\.5vw,60px\)\}/, `${name}: phone headline size`)
  assert.match(block, /\.sv-hero--photo \.sv-actions \.sv-btn\{flex:1 1 100%/, `${name}: full-width button`)
  // 4. Laid last: nothing after it but the reduced-motion stop and the closing tick.
  if (name === 'New World') assert.ok(sheet.indexOf('.hs-header-actions .hs-btn-dark{min-height:36px') < at, 'New World: after its header bar')
}

// 5. Every rule of the shared block is inside the phone query.
const body = SERVICES_PHONE_HERO_CSS.trim()
assert.ok(body.startsWith('@media (max-width:600px){') && body.endsWith('}'), 'one phone query wraps the whole block')
assert.equal((body.match(/@media/g) || []).length, 1, 'no second query')
console.log('LIVE-2487 phone photo hero: ok')
