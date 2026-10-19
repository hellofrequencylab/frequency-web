// EMAIL-024 probe: every plain-text sender wears the Studio shell. The Space campaign composer, the
// scheduled-send cron, the drip cron and the event broadcast render through lib/spaces/campaign-html.ts
// (the Space's brand, the unsubscribe placeholder, the free-plan line); Studio campaigns, nurture,
// automations and the agent call plainTextEmail. None of the eight carries a hand-typed hex, and the
// token guard no longer waives them.
//
//   node scripts/probes/email-shells.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g
const code = (file) => readFileSync(file, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const SPACE_SENDERS = {
  'lib/spaces/campaigns.ts': /renderCampaignHtml[^\n]*from '@\/lib\/spaces\/campaign-html'/,
  'lib/spaces/campaigns-send-due.ts': /renderCampaignHtml[^\n]*from '@\/lib\/spaces\/campaign-html'/,
  'lib/spaces/drip-runner.ts': /renderCampaignHtml[^\n]*from '@\/lib\/spaces\/campaign-html'/,
  'app/(main)/events/[slug]/manage/broadcast-actions.ts': /renderCampaignHtml/,
}
const FREQUENCY_SENDERS = ['lib/studio/campaigns.ts', 'lib/studio/agent.ts', 'lib/automations.ts', 'lib/nurture/runner.ts']

for (const [file, seam] of Object.entries(SPACE_SENDERS)) {
  assert.ok(seam.test(readFileSync(file, 'utf8')), `${file} does not render through lib/spaces/campaign-html.ts`)
}
for (const file of FREQUENCY_SENDERS) {
  assert.ok(readFileSync(file, 'utf8').includes('plainTextEmail('), `${file} does not render through plainTextEmail`)
}
for (const file of [...Object.keys(SPACE_SENDERS), ...FREQUENCY_SENDERS, 'lib/spaces/campaign-html.ts']) {
  const literals = code(file).match(HEX) ?? []
  assert.deepEqual(literals, [], `${file} types its own colour (${literals.join(', ')})`)
  assert.ok(!code(file).includes('postalFooterHtml'), `${file} still appends the plain postal paragraph instead of the shell footer`)
}

const guard = readFileSync('scripts/check-tokens.mjs', 'utf8')
for (const file of ['lib/automations.ts', 'lib/nurture/runner.ts', 'lib/studio/agent.ts', 'lib/studio/campaigns.ts', 'lib/spaces/campaigns.ts', 'lib/spaces/campaigns-send-due.ts', 'lib/spaces/drip-runner.ts']) {
  assert.ok(!guard.includes(`p === '${file}'`), `scripts/check-tokens.mjs still waives ${file}`)
}

// The Space senders pass the Space's brand: the composer from the Space row, the crons from a spaces read.
assert.ok(/spaceEmailBrand\(sender\)/.test(readFileSync('lib/spaces/campaigns.ts', 'utf8')), 'the composer send does not pass the Space brand')
assert.ok(/brand_accent/.test(readFileSync('lib/spaces/campaigns-send-due.ts', 'utf8')), 'the scheduled send does not read the Space brand')
assert.ok(/brand_accent/.test(readFileSync('lib/spaces/drip-runner.ts', 'utf8')), 'the drip send does not read the Space brand')

console.log('EMAIL-024: every plain-text sender wears the Studio shell; Space sends wear the Space brand.')
