#!/usr/bin/env node
// EMAIL-063: the operator day 0/1/3/7 emails are lifecycle mail but went out with no List-Unsubscribe header, and the
// footer link opens /settings/notifications, which needs a sign-in. A signed-out owner had no way to opt out and the
// inbox showed no one-click button. The sender now stamps the RFC 8058 one-click headers with a signed lifecycle link.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/marketing/operator-lifecycle.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []
if (!/buildUnsubscribeUrl\(\{[^}]*category: 'lifecycle'/.test(src)) fails.push('no signed lifecycle unsubscribe link is built')
if (!/enqueueEmail\(\s*\{ \.\.\.message, headers: listUnsubscribeHeaders\(unsubscribeUrl\) \}/.test(src)) fails.push('the operator email is enqueued without List-Unsubscribe headers')
if (fails.length) { console.error(`EMAIL-063 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-063 ok: operator lifecycle emails carry one-click unsubscribe headers')
