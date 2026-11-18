#!/usr/bin/env node
// EMAIL-064: the cross-email cap (one lifecycle email a day, three a week; LIFECYCLE_CAP_ENABLED is on in production since
// 2026-11-17) is only enforced where a sender calls reserveLifecycleSend. On 2026-11-18 only the nurture runner did, so a
// person could get a draft reminder, a launch come-back and an operator email on the same day. This probe passes when
// every registered lifecycle sender reserves through the cap before it enqueues.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const SENDERS = {
  launch_comeback: 'lib/launch/comeback-io.ts',
  launched_welcome: 'lib/launch/launched-io.ts',
  create_space_draft: 'lib/create-space/draft-recovery-io.ts',
  operator_lifecycle: 'lib/marketing/operator-lifecycle.ts',
  nurture_step: 'lib/nurture/runner.ts',
}
const fails = []
for (const [kind, file] of Object.entries(SENDERS)) {
  const url = new URL(file, root)
  if (!existsSync(url)) { fails.push(`${kind}: ${file} is gone (re-check this probe)`); continue }
  const src = readFileSync(url, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  if (!new RegExp(`reserveLifecycleSend\\([\\s\\S]{0,200}kind: '${kind}'`).test(src)) fails.push(`${kind} (${file}) sends without the lifecycle cap`)
}
if (fails.length) { console.error(`EMAIL-064 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-064 ok: every lifecycle sender reserves through the cap')
