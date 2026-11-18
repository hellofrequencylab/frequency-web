#!/usr/bin/env node
// EMAIL-061: with LIFECYCLE_CAP_ENABLED on (production since 2026-11-17) the nurture runner reserved a lifecycle_send_log
// row before it enqueued the email. If the enqueue threw, the row stayed, every later run read 'duplicate' and skipped
// without moving the cursor, and the enrollment never sent that step or any after it. Now a failed enqueue releases the
// reservation, and a 'duplicate' (the step already went out) moves the cursor on.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/nurture/runner.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []
if (/reservation === 'duplicate'\)\s*continue/.test(src)) fails.push("a 'duplicate' reservation still skips without moving the cursor")
if (!/reservation === 'duplicate'\) \{ await advance\(e, step\.order\)/.test(src)) fails.push("a 'duplicate' reservation does not advance the enrollment")
const tryAt = src.indexOf('await enqueueEmail(')
const catchBody = src.slice(tryAt, src.indexOf('sent++', tryAt))
if (!/catch \(err\)[\s\S]*await releaseLifecycleSend\(db, `nurture_step:/.test(catchBody)) fails.push('a failed enqueue does not release the cap reservation')
if (fails.length) { console.error(`EMAIL-061 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-061 ok: a failed nurture enqueue releases its cap reservation and a duplicate moves the cursor on')
