#!/usr/bin/env node
// LIVE-1970: the signed-out Create a Space builder records nine first-party signals with closed props and no typed
// text, through its own anonymous sink into the engagement ledger; the admin Insights page shows the funnel they make
// with the median name-to-saved time; a lead the funnel scored 60 and up is flagged hot and listed first.
//
// The rule modules import the catalogs through the `@/` alias, so the rules are proven under vitest (signal.test.ts,
// funnel.test.ts and the taxonomy's own test; CI's test job runs them). A probe may not spawn a test runner
// (LIVE-034), so this one reads the wiring: the taxonomy, the sink, the dashboard, the tile, the studio's emits and
// the leads page, and checks the tests are there.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const taxonomy = read('lib/analytics/events.ts')
const sink = read('app/api/create-space/signal/route.ts')
const signal = read('lib/create-space/signal.ts')
const dashboard = read('lib/analytics/dashboard.ts')
const tile = read('components/admin/insights/engagement-tab.tsx')
const studio = read('components/frequency/site/pages/create-space/create-space-studio.tsx')
const leads = read('lib/crm/signup-leads.ts')
const leadsPage = read('app/(main)/admin/crm/leads/page.tsx')
const leadsTable = read('app/(main)/admin/crm/leads/leads-table.tsx')

const NINE = ['view', 'name_started', 'accent_picked', 'step_done', 'offer', 'lead', 'photos', 'resume', 'dock_click'].map((s) => `createspace.${s}`)

// The taxonomy: all nine, server-side only (the sink is the one writer).
for (const e of NINE) {
  const m = taxonomy.match(new RegExp(`name: '${e.replace('.', '\\.')}'[^\\n]*clientEmittable: (true|false)`))
  if (!m) bad.push(`${e} is not in the taxonomy`)
  else if (m[1] !== 'false') bad.push(`${e} is client-emittable; /api/track would take a spoof`)
}

// The sink: anonymous, rate limited, closed props, exactly once, always 204.
if (!/rateLimitOk\('create-space-signal'/.test(sink)) bad.push('the sink is not rate limited')
if (!/parseSignalBody\(/.test(sink) || !/signalKey\(/.test(sink)) bad.push('the sink does not check the body or key the write')
if (!/track\(body\.event, body\.props, null/.test(sink)) bad.push('the sink does not write through track() with no actor')
if (!/status: 204/.test(sink) || /status: (400|401|403|500)/.test(sink)) bad.push('the sink answers something other than 204')
// No free string reaches a prop: the only string props are a kit id, a step id, intent ids and a closed source word.
if (!/isPreviewKit\(r\.kit\)/.test(signal) || !/BUILDER_MOVES as readonly string\[\]\)\.includes\(str\(r\.step\)\)/.test(signal) || !/parseIntents\(str\(r\.intents\)/.test(signal) || !/r\.source === 'local' \|\| r\.source === 'email'/.test(signal)) bad.push('a string prop is not checked against a closed list')
if (!/sessionStorage|never a cookie/.test(signal)) bad.push('the visitor key is not a per-tab key')

// The studio sends all nine.
for (const e of NINE) if (!studio.includes(`'${e}'`)) bad.push(`the studio never sends ${e}`)
if (!/keepalive: true/.test(studio)) bad.push('the studio signal is not keepalive')

// The dashboard and the tile.
if (!/createSpaceFunnel\(byType\)/.test(dashboard) || !/createSpaceMedianMs: median\(nameToSavedMs/.test(dashboard)) bad.push('the dashboard does not compute the funnel and the median')
if (!/from\('create_space_drafts'\)\.select\('started_at, converted_at'\)/.test(dashboard)) bad.push('the median reads more than the two timestamps')
if (!/<FunnelView steps=\{d\.createSpaceFunnel\}/.test(tile) || !/formatMedian\(d\.createSpaceMedianMs\)/.test(tile)) bad.push('the Insights page does not show the funnel and the median')

// Hot leads: flagged from the payload score, listed first.
if (!/hot: score !== null && score >= LEAD_HOT_SCORE/.test(leads)) bad.push('a lead is not flagged hot at the threshold')
if (!/Number\(b\.hot\) - Number\(a\.hot\)/.test(leadsPage)) bad.push('hot leads are not listed first')
if (!/l\.hot && <Badge/.test(leadsTable)) bad.push('the leads table does not show the hot flag')

// The rules' own tests must exist and cover the closed props and the funnel.
const signalTest = read('lib/create-space/signal.test.ts')
const funnelTest = read('lib/create-space/funnel.test.ts')
if (!/never let a string through/.test(signalTest) || !/registered in the taxonomy/.test(signalTest)) bad.push('signal.test.ts does not prove the closed props and the taxonomy')
if (!/createSpaceFunnel\(/.test(funnelTest) || !/nameToSavedMs/.test(funnelTest)) bad.push('funnel.test.ts does not prove the funnel and the median')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ create a space funnel: nine anonymous signals with closed props through their own sink, the Insights funnel with the median name-to-saved time, hot leads flagged and first')
