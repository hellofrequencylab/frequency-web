#!/usr/bin/env node
// SEC-042: the two request-backed anonymous track() callers ask the browser's analytics consent
// before Google gets a copy. track() skips the account consent read when there is no actor, so the
// signed-out builder's nine steps and anonymous QR scans were mirrored to GA4 after a decline.
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
const fails = []
const sink = read('app/api/create-space/signal/route.ts')
if (!/const mirrorGa = await requestGoogleAllowed\(\)/.test(sink) || !/mirrorGa \}\)/.test(sink)) fails.push('create-space signal sink mirrors to Google without the browser consent check')
const qr = read('app/q/[slug]/route.ts')
if (!/requestGoogleAllowed\(\)[\s\S]{0,80}\.then\(\(mirrorGa\) => track\('qr\.scanned'/.test(qr)) fails.push('/q/<slug> mirrors qr.scanned to Google without the browser consent check')
if (fails.length) {
  console.error(`SEC-042 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log('SEC-042 ok: anonymous builder steps and QR scans reach Google only with browser consent')
