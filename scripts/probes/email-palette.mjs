// EMAIL-023 probe: every outgoing email reads its colours from lib/theme/palette.ts. The modules that
// render the member shell, the reply wrapper, the batched-reply digest, the promoted-seat email, the
// Thursday This-week body and the week-to-go reminder cron carry NO hand-typed hex (every literal is
// `${palette.x}`), the token guard no longer waives them, and the three shells print one tagline.
//
//   node scripts/probes/email-palette.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FILES = [
  'lib/email.ts',
  'lib/comms/email-template.ts',
  'lib/comms/outbound-batch.ts',
  'lib/comms/leader-send.ts',
  'lib/comms/inbound.ts',
  'lib/events/waitlist-notify.ts',
  'lib/this-week.ts',
  'app/api/cron/event-reminders/route.ts',
  'lib/email-react/shell.tsx',
  'lib/email-studio/shell.ts',
]
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g

for (const file of FILES) {
  const src = readFileSync(file, 'utf8')
  const code = src
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
  const literals = code.match(HEX) ?? []
  assert.deepEqual(literals, [], `${file} types its own colour (${literals.join(', ')}); read lib/theme/palette.ts instead`)
}

const guard = readFileSync('scripts/check-tokens.mjs', 'utf8')
for (const file of ['lib/email.ts', 'lib/comms/email-template.ts', 'lib/comms/outbound-batch.ts', 'lib/events/waitlist-notify.ts', 'lib/this-week.ts', 'app/api/cron/event-reminders/route.ts']) {
  assert.ok(!guard.includes(`p === '${file}'`), `scripts/check-tokens.mjs still waives ${file}; the guard must hold it`)
}

// One tagline under the wordmark, in every shell.
for (const file of ['lib/email.ts', 'lib/email-react/shell.tsx', 'lib/email-studio/shell.ts']) {
  const src = readFileSync(file, 'utf8')
  assert.ok(src.includes('EMAIL_TAGLINE'), `${file} does not print EMAIL_TAGLINE`)
  assert.ok(!/The community collective<|'Community collective'/.test(src), `${file} spells the tagline its own way`)
}

// The reply wrapper is the one copy of bodyToHtml; the six private twins are gone.
for (const file of ['lib/comms/leader-send.ts', 'lib/comms/outbound-batch.ts', 'lib/comms/inbound.ts', 'app/(main)/admin/crm/conversations/actions.ts', 'app/(main)/lead/inbox/actions.ts', 'app/(main)/spaces/[slug]/crm/conversations-actions.ts']) {
  const src = readFileSync(file, 'utf8')
  assert.ok(!/^function bodyToHtml\(/m.test(src) && !/^function bridgeBodyToHtml\(/m.test(src), `${file} keeps its own bodyToHtml`)
  assert.ok(/bodyToHtml[^\n]*from '@\/lib\/comms\/email-template'/.test(src), `${file} does not import bodyToHtml from the reply template`)
}
// The week-to-go reminder wears the member shell and sends no emoji subject.
const reminder = readFileSync('app/api/cron/event-reminders/route.ts', 'utf8')
assert.ok(reminder.includes('emailShell('), 'the week-to-go reminder does not wear emailShell')
assert.ok(/subject: `A week to go: \$\{eventTitle\}`/.test(reminder), 'the week-to-go reminder subject still carries an emoji')

console.log('EMAIL-023: every outgoing email reads its colours from the palette; one tagline; one bodyToHtml.')
