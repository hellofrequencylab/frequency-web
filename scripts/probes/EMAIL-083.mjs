#!/usr/bin/env node
// EMAIL-083: an unsubscribe or spam complaint wrote an email_suppressions row but left contacts.consent_state as it
// was. On 2026-11-19, 15 imported addresses had an unsubscribe suppression while only 1 contact row said
// 'unsubscribed', so audience counts were too high and any path reading only consent_state could mail them. This
// probe passes while suppress() marks the matching contact rows unsubscribed for opt-out reasons (not bounces), on
// both the insert path and the already-suppressed path, without ever failing the suppression itself.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/suppression.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []
const at = src.indexOf('export async function suppress(')
const body = at < 0 ? '' : src.slice(at, src.indexOf('\nexport ', at + 10))
if (!body) fails.push('suppress() not found (re-check this probe)')
else if ((body.match(/await markContactOptedOut\(addr, reason, spaceId\)/g) ?? []).length < 2) fails.push('suppress() does not sync the contact on both the new-row and already-suppressed paths')
if (!/OPT_OUT_REASONS[^\n]*new Set\(\['unsubscribe', 'complaint'/.test(src)) fails.push('unsubscribe and complaint are not opt-out reasons')
if (/OPT_OUT_REASONS[^\n]*bounce/.test(src)) fails.push('a bounce is treated as an opt-out')
const sync = src.slice(src.indexOf('export async function markContactOptedOut('))
if (!/\.update\(\{ consent_state: 'unsubscribed' \}\)/.test(sync)) fails.push('the contact row is not marked unsubscribed')
if (!/catch \(err\)/.test(sync) || /throw /.test(sync.slice(0, sync.indexOf('\n}\n')))) fails.push('a failed contact sync can fail the suppression')
if (fails.length) { console.error(`EMAIL-083 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-083 ok: an unsubscribe or complaint also marks the contact record unsubscribed')
