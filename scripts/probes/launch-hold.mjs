#!/usr/bin/env node
// VLS-06: a visitor who starts a launch signed out is held in one httpOnly 30-day cookie, and claiming it makes
// exactly one space_launch row. Reads the module and the route source, and runs the cookie parser under node.
import { readFileSync } from 'node:fs'
import { parsePendingLaunch, serializePendingLaunch } from '../../lib/launch/pending.ts'

const bad = []
const pending = readFileSync('lib/launch/pending-io.ts', 'utf8')
const claim = readFileSync('app/(main)/launch/claim/route.ts', 'utf8')

if (/^['"]use server['"]/m.test(pending)) bad.push('the hold reader is an action file, so its cookie answers would be a callable endpoint')
if (!/httpOnly: true/.test(pending)) bad.push('the hold cookie is readable by page script')
if (!/launchSystemEnabled\(\)\) notFound\(\)/.test(claim)) bad.push('the claim route opens while the launch is off')
if (!/startLaunch\(profileId/.test(claim) || !/clearPendingLaunch\(\)/.test(claim)) bad.push('the claim does not make the row and clear the hold')
if (!/if \(!profileId\) redirect\(/.test(claim)) bad.push('the claim route answers someone signed out')

const now = new Date('2026-10-28T12:00:00Z')
const raw = serializePendingLaunch({ niche: 'coaches', intents: ['events'], answers: { spotlight: { headline: 'Hi' } } }, now)
if (parsePendingLaunch(raw, now)?.answers.spotlight?.headline !== 'Hi') bad.push('a held answer does not read back')
if (parsePendingLaunch(raw, new Date(now.getTime() + 31 * 86_400_000)) !== null) bad.push('a hold older than 30 days is still read')
if (parsePendingLaunch('{"savedAt":"x"}', now) !== null) bad.push('a tampered cookie is read')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the hold is httpOnly, expires at 30 days, ignores tampering, and the claim makes one row and clears it')
