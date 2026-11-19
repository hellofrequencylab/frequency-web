#!/usr/bin/env node
// SEC-028: the free join action never records a PAID Space membership tier while billing is live.
// joinTier is a public server action that takes no payment; before this row only the join card in the
// browser decided whether a tier was paid, so a direct call gave anyone a paid tier for free.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/spaces/memberships.ts', import.meta.url), 'utf8')
const start = src.indexOf('export async function joinTier(')
const body = start >= 0 ? src.slice(start, src.indexOf('\nexport ', start + 10)) : ''
const insertAt = body.indexOf('looseMembershipsTable()')
const guard = body.search(/if \(\s*paidTier && \(await billingLive\(\)\)\s*\)/)
if (start < 0 || guard < 0 || insertAt < 0 || guard > insertAt || !/priceCents > 0/.test(body.slice(0, guard))) {
  console.error('SEC-028 FAIL: joinTier records a membership without refusing a paid tier while billing is live, so a direct call joins a paid tier for free')
  process.exit(1)
}
console.log('SEC-028 ok: joinTier refuses a paid tier while billing is live')
