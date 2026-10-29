#!/usr/bin/env node
// Vera builds the post-launch draft from the person's own words and never invents. Runs the pure builder with NO AI
// (the deterministic path), checks every cite is a quote from its source, and reads the wiring: the polish is off
// unless the envFlag switch is on, capped per launch, Haiku, under a daily feature cap, and no persona, wellness,
// Journey or Circle topic data can reach it. Fails on main, where there is no buildout.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
if (!existsSync('lib/launch/buildout.ts')) { console.error('✗ lib/launch/buildout.ts does not exist'); process.exit(1) }

const { quoteDraft, enforceCites, passagesOf, askThem } = await import(new URL('../../lib/launch/buildout.ts', import.meta.url))
const { snippetIsQuoted } = await import(new URL('../../lib/launch/facts.ts', import.meta.url))

const input = {
  spotlight: { name: 'Mara Quinn', line: 'I teach breathwork to tired founders in Austin.', link: 'https://maraquinn.com/' },
  space: { tagline: 'Breathwork for tired founders', about: 'Mara runs small evening sessions at a studio in East Austin.' },
  profile: { bio: 'Former product manager turned breathwork guide.', website: 'maraquinn.com' },
  facts: [],
}
const passages = passagesOf(input)
const d = quoteDraft(input)
if (askThem(d).length) bad.push('a fully answered launch left a field empty')
for (const c of d.cites) if (!snippetIsQuoted(passages.filter((p) => p.origin === c.origin).map((p) => p.text).join('\n'), c.snippet)) bad.push(`cite for ${c.slot}.${c.field} is not a quote from ${c.origin}`)
for (const [slot, field] of [['space', 'tagline'], ['space', 'about'], ['website', 'headline'], ['website', 'intro'], ['email', 'subject'], ['email', 'body']])
  if (!d.cites.some((c) => c.slot === slot && c.field === field)) bad.push(`${slot}.${field} has no cite`)
const forged = enforceCites({ ...d, space: { ...d.space, tagline: 'Transform your life' }, cites: d.cites.map((c) => (c.slot === 'space' && c.field === 'tagline' ? { ...c, snippet: 'Transform your life' } : c)) }, passages)
if (forged.space.tagline !== '') bad.push('a field cited to words the person never wrote was kept')

const io = read('lib/launch/buildout-io.ts')
const pure = read('lib/launch/buildout.ts')
if (!/envFlag\('LAUNCH_BUILDOUT_AI_ENABLED'\)/.test(io)) bad.push('the polish is not behind the envFlag switch')
if (!/polishCallsLeft\(spent\)/.test(io) || !/MAX_AI_CALLS = 2/.test(pure)) bad.push('the polish has no per-launch call cap')
if (!/tier: 'haiku'/.test(io) || !/featureOverBudget\(FEATURE\)/.test(io)) bad.push('the polish is not Haiku under the daily feature cap')
if (!/'launch-buildout'/.test(read('lib/ai/budget.ts'))) bad.push('launch-buildout has no registered daily cap')
if (/persona|wellness|journey|circle|niche|intents/i.test(io.replace(/^\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, ''))) bad.push('the buildout reads data it must not send to a model')
if (!/^LAUNCH_BUILDOUT_AI_ENABLED=$/m.test(read('.env.example'))) bad.push('the switch is not listed blank in .env.example')
if (!/LAUNCH_BUILDOUT_AI_ENABLED/.test(read('docs/RUNBOOKS.md'))) bad.push('the switch has no activation gate in RUNBOOKS')
if (!/buildDraftAction/.test(read('lib/launch/actions.ts'))) bad.push('there is no server action to build the draft')
if (!/20270346027400/.test(readdirNames())) bad.push('the buildout column migration is missing')
function readdirNames() { return read('supabase/migrations/20270346027400_launch_buildout_draft.sql').includes('add column if not exists buildout') ? '20270346027400' : '' }

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ Vera drafts from the person\'s own quotes, cited, capped, and off unless switched on')
