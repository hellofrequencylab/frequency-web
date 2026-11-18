#!/usr/bin/env node
// JRN-015: a Journey has a HOST (its Space) and any number of GUIDES (people). Checks the consequence in source:
//   1. The journey_plan_guides table exists as a migration and is registered service-role only.
//   2. The Journey pages credit guides, falling back to the host Space, then the author.
//   3. A Space's Journeys manager can add and remove guides, gated on the Space steward.
//   4. A guide may start a Run of the Journey in a Circle of its home Space (and nowhere else).
import { existsSync, readFileSync } from 'node:fs'
const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []
const mig = 'supabase/migrations/20270346090000_journey_plan_guides.sql'
if (!existsSync(new URL(mig, root)) || !/create table if not exists public\.journey_plan_guides/.test(read(mig))) fails.push('no journey_plan_guides migration')
if (!/^journey_plan_guides$/m.test(read('scripts/rls-deny-all.txt'))) fails.push('journey_plan_guides is not in rls-deny-all')
if (!/^journey_plan_guides\s+internal$/m.test(read('scripts/table-grants.txt'))) fails.push('journey_plan_guides is not internal in table-grants')
const side = read('components/frequency/members/journey/journey-side.tsx')
if (!/guides\.length > 1 \? 'Your guides'/.test(side) || !/Hosts and guides this Journey/.test(side)) fails.push('the course page guide panel does not show guides then the host Space')
const page = read('app/(main)/journeys/[slug]/page.tsx')
if (!/listJourneyGuides\(plan\.id\)/.test(page) || !/Guided by/.test(page) || !/Hosted by/.test(page)) fails.push('the Journey page does not credit its host and guides')
if (!/<GuidesPanel /.test(read('app/(main)/spaces/[slug]/journeys/page.tsx'))) fails.push('the Space Journeys manager has no Guides panel')
if (!/listShareApproverIds\(p\.space_id\)/.test(read('app/(main)/spaces/[slug]/journeys/guide-actions.ts'))) fails.push('guide writes are not gated on the Space steward')
if (!/guideMayRunIn\(input\.planId, caller\.id, gate\.spaceId\)/.test(read('app/(main)/journeys/run-actions.ts'))) fails.push('a guide cannot start a Run of their Journey')
if (fails.length) { console.error('JRN-015 FAIL\n- ' + fails.join('\n- ')); process.exit(1) }
console.log('JRN-015 ok: Journeys have a host Space and guides, credited, managed by the Space team, and guides can host Runs')
