#!/usr/bin/env node
// EMAIL-081: only an approver can schedule an Email Studio campaign, but the writer-gated autosave
// (saveEmailCampaign) updated a scheduled campaign by id alone, so its subject, body or sender could change
// after the approver scheduled it and the cron would send the new version. This probe passes while the autosave
// reads the edit lock first, takes a scheduled email off the schedule (and resets approval) before the edit
// lands, refuses an email already going out, and every content write re-asserts an editable status.
import { readFileSync } from 'node:fs'

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const actions = strip(readFileSync(new URL('../../app/(main)/admin/email-studio/actions.ts', import.meta.url), 'utf8'))
const lock = strip(readFileSync(new URL('../../lib/email-studio/edit-lock.ts', import.meta.url), 'utf8'))
const fails = []
const at = actions.indexOf('export async function saveEmailCampaign(')
const body = at < 0 ? '' : actions.slice(at, actions.indexOf('\nexport ', at + 10))
if (!body) fails.push('saveEmailCampaign not found (re-check this probe)')
else {
  const lockAt = body.indexOf('editLockFor(')
  const firstWrite = body.search(/\.update\(/)
  if (lockAt < 0 || (firstWrite >= 0 && lockAt > firstWrite)) fails.push('the autosave does not read the edit lock before its first write')
  if (!/lock === 'locked'\) return \{ error: EDIT_LOCKED_ERROR \}/.test(body)) fails.push('an email already going out is not refused')
  if (!/status: 'draft', scheduled_for: null/.test(body) || !/\.eq\('status', 'scheduled'\)/.test(body)) fails.push('a scheduled email is not taken off the schedule before the edit')
  if (!/APPROVALS_RESET_ON_EDIT\.has\(approval\)\) disarm\.approval_status = 'draft'/.test(body)) fails.push('approval is not reset when a scheduled email is edited')
  const writes = body.match(/\.update\((?!disarm)[\s\S]{0,200}?\.eq\('id', id\)[\s\S]{0,40}/g) ?? []
  const unguarded = writes.filter((w) => !/\.in\('status', EDITABLE_STATUSES\)/.test(w))
  if (writes.length < 3 || unguarded.length) fails.push(`${unguarded.length || 'some'} content write(s) do not re-assert an editable status`)
}
if (!/if \(status === 'scheduled'\) return 'disarm'/.test(lock)) fails.push("editLockFor no longer disarms a scheduled email")
if (!/status === 'sending' \|\| status === 'paused' \|\| status === 'sent'\) return 'locked'/.test(lock)) fails.push('editLockFor no longer locks an email that is going out')
if (fails.length) { console.error(`EMAIL-081 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-081 ok: editing a scheduled email takes it off the schedule and resets approval; one going out is locked')
