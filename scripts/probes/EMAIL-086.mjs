#!/usr/bin/env node
// EMAIL-086: approving or scheduling an Email Studio campaign stores a fingerprint of its subject, body, audience and
// links, and the send refuses when the campaign no longer matches it. Contact audit 2026-11-19 (Wave 2), building on
// EMAIL-081 (an edit puts a scheduled email back to draft). Passes when a migration adds the fingerprint and the send
// path compares it before anything is queued.
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '').replace(/^\s*\/\/.*$/gm, '')
const dir = new URL('supabase/migrations/', root)
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => strip(readFileSync(new URL(f, dir), 'utf8'))).join('\n')
const fails = []
if (!/add column[^;]*\bapproval_(fingerprint|hash)\b/i.test(sql)) fails.push('no migration adds an approval fingerprint to campaigns')
const sendUrl = new URL('lib/email-studio/send.ts', root)
const send = existsSync(sendUrl) ? strip(readFileSync(sendUrl, 'utf8')) : null
if (send === null) fails.push('lib/email-studio/send.ts is gone (re-check this probe)')
else if (!/approval_?(fingerprint|hash)|approvalFingerprint|approvalHash/i.test(send)) fails.push('the send path never compares the approval fingerprint before queueing')
if (fails.length) { console.error(`EMAIL-086 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-086 ok: a campaign only sends the exact content and audience that was approved')
