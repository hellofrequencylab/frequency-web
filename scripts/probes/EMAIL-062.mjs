#!/usr/bin/env node
// EMAIL-062: an unsubscribe must not be lost or undo other choices. (1) processUnsubscribe ignored a failed read of
// notification_preferences and upserted the defaults, switching back on every category the member had turned off.
// (2) The RFC 8058 one-click POST answered 200 even when the write failed, so the mailbox treated the opt-out as done.
import { readFileSync } from 'node:fs'

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const actions = strip(readFileSync(new URL('../../app/unsubscribe/actions.ts', import.meta.url), 'utf8'))
const route = strip(readFileSync(new URL('../../app/api/unsubscribe/route.ts', import.meta.url), 'utf8'))
const fails = []
if (!/const \{ data: existing, error: readError \}[\s\S]{0,200}if \(readError\)/.test(actions)) fails.push('a failed preference read still falls through to the default upsert')
if (!/SAVE_FAILED\.test\(result\.error\)[\s\S]{0,200}status: 503/.test(route)) fails.push('a failed one-click write still answers 200')
if (fails.length) { console.error(`EMAIL-062 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-062 ok: a failed read stops the unsubscribe and a failed one-click write answers 503')
