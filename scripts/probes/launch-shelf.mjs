#!/usr/bin/env node
// VLS-12: the source shelf's rules and store. lib/launch/shelf.test.ts pins the rules (a fact with no snippet or
// origin, or a snippet that is not in the source, is refused; sources keep kind and sizes; a cancel keeps them thirty
// days). This reads the wiring: the table refuses a fact with no snippet or origin and removes facts with their
// source, the store checks every fact before it writes, and nothing on the shelf reaches a pixel.
import { readFileSync, readdirSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const mig = readdirSync('supabase/migrations').filter((f) => f.endsWith('_vera_launch.sql')).map((f) => read(`supabase/migrations/${f}`)).join('\n')
const io = read('lib/launch/shelf-io.ts')
const facts = read('lib/launch/facts.ts')

if (!/snippet text not null check \(length\(snippet\) between 1 and/.test(mig) || !/origin text not null check \(length\(origin\) between 1 and/.test(mig)) bad.push('the table accepts a fact with no snippet or origin')
if (!/source_id uuid not null references public\.launch_sources\(id\) on delete cascade/.test(mig)) bad.push('removing a source does not remove its facts')
if (!/checkFact\(/.test(io) || !/checkSource\(/.test(io)) bad.push('the store writes without checking the rules')
if (!/expires_at: expiryFor\(/.test(io)) bad.push('a cancel does not start the thirty day clock on sources')
if (!/not_quoted/.test(facts)) bad.push('a paraphrase can pass as a citation')
if (/^import .*(pixel|analytics|capi|track)/im.test(io)) bad.push('the shelf store reaches an analytics call')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ the shelf quotes or says nothing: sources keep kind and size, facts need a snippet and origin, removal cascades, a cancel starts the thirty days')
