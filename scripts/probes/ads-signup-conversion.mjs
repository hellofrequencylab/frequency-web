#!/usr/bin/env node
// LIVE-2251: a real signup reaches GA4 (and so Google Ads) as one `sign_up` key event.
// Fails when the auth callback stops handing track() the browser's GA identity, or track() stops
// sending sign_up / stops deduping the mirror on the ledger's first-insert result.
import { readFileSync } from 'node:fs'
const cb = readFileSync('app/auth/callback/route.ts', 'utf8')
const tr = readFileSync('lib/analytics/track.ts', 'utf8')
const bad = []
if (!cb.includes('readGaIdentity')) bad.push('callback no longer passes the _ga identity')
if (!tr.includes("'sign_up'")) bad.push("track() no longer sends GA4 sign_up")
if (!tr.includes('opts.idempotencyKey && !recorded')) bad.push('GA mirror no longer deduped on the ledger insert')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
