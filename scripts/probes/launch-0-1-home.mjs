// LIVE-910 (LAUNCH-MARKETING-PLAN §14 Phase 0.1, R7): the front door wears R7 and stops promising that
// selling is free. The published home is a `pages` row, so the consequence is held at the three places
// that write or guard it: the guarded data migration, the template fallback, and the home canon gate.
import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const mig = readdirSync('supabase/migrations').find((f) => /home_r7_headline_selling_starts_at_business\.sql$/.test(f))
assert.ok(mig, 'the guarded home migration (R7 + selling starts at Business) is not in supabase/migrations')
const sql = readFileSync(`supabase/migrations/${mig}`, 'utf8')
assert.match(sql, /Your people are closer than you think\./, 'migration writes the R7 headline')
assert.match(sql, /Selling starts at Business/, 'migration writes the selling line')

const tpl = readFileSync('lib/page-editor/templates/home.ts', 'utf8')
assert.match(tpl, /title: 'Your people are closer than you think\.'/, 'template fallback carries R7')
assert.doesNotMatch(tpl, /from day one|taking money is never behind a plan/i, 'template makes no retired money claim')
for (const m of tpl.matchAll(/[^."]*\b0%[^."]*/g)) assert.match(m[0], /card processing/, `0% claim without card processing: ${m[0]}`)

assert.match(readFileSync('scripts/maintenance/home-copy-canon.mjs', 'utf8'), /export const MONEY_CLAIMS/, 'home canon bans the claim')
console.log('The front door wears R7, says selling starts at Business, and the home canon bans the old claim.')
