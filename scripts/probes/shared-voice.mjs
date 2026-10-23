#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
// Next's build-time marker has no runtime package; all functional builders remain real.
registerHooks({ resolve(spec, ctx, next) {
  if (spec === 'server-only') return { url: new URL('../../test/stubs/server-only.ts', import.meta.url).href, shortCircuit: true }
  return next(spec, ctx)
} })
const { SITE_SIGNOFF, SITE_TAGLINE } = await import('../../lib/site.ts')
const { renderReplyEmail } = await import('../../lib/comms/email-template.ts')
const platform = renderReplyEmail('Hello', null)
for (const output of [platform.html, platform.text]) {
  assert.ok(output.includes(SITE_SIGNOFF), 'Platform mail lost the canonical sign-off')
  assert.ok(output.includes(SITE_TAGLINE), 'Platform mail lost the logo descriptor')
}
const branded = renderReplyEmail('Hello', null, { name: 'Example Studio', logoUrl: null, accent: null, url: 'https://studio.example' })
for (const output of [branded.html, branded.text]) {
  assert.ok(!output.includes(SITE_SIGNOFF), 'Platform marketing replaced a client-branded footer')
  assert.ok(output.includes('Example Studio'), 'Client identity was lost')
  assert.ok(output.includes('Sent with Frequency'), 'Client mail lost its transport attribution')
}
for (const file of ['components/layout/marketing-footer.tsx', 'components/frequency/site/shell/site-footer.tsx']) {
  assert.ok(readFileSync(file, 'utf8').includes('{SITE_SIGNOFF}'), `${file} no longer renders the sign-off`)
}
console.log('Platform sign-off and separate client-branded footer render correctly')
