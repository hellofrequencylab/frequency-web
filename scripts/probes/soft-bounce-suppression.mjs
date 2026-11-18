#!/usr/bin/env node
// EMAIL-052: a Transient bounce (a full mailbox, an expired delivery) must not suppress an address on the first event.
// Fails when the Resend webhook suppresses every bounce as hard_bounce again, or the classifier stops reading the
// provider's bounce type, or the Space send path suppresses a soft bounce the global path skipped.
import { readFileSync } from 'node:fs'
const route = readFileSync('app/api/webhooks/resend/route.ts', 'utf8')
const lib = readFileSync('lib/suppression.ts', 'utf8')
const space = readFileSync('lib/spaces/email.ts', 'utf8')
const bad = []
if (/suppress\(to, type === 'bounced' \? 'hard_bounce'/.test(route)) bad.push('webhook suppresses every bounce as hard_bounce')
if (!route.includes('classifyBounce(') || !route.includes('bounceSuppressionReason(')) bad.push('webhook does not classify the bounce before suppressing')
if (!/export function classifyBounce/.test(lib) || !/transient/i.test(lib)) bad.push('lib/suppression.ts has no bounce classifier')
if (!route.includes('suppressAddress:') || !space.includes('opts.suppressAddress === false')) bad.push('Space send path still suppresses a soft bounce')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('ok: soft bounces suppress only when they repeat')
