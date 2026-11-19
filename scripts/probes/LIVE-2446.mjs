#!/usr/bin/env node
// LIVE-2446: the front door states the new fee rules (ADR-1978). `/` renders the published `pages` row, not
// the template, and that row said "Tips stay open on every tier, with no fee" and listed donations as a
// Business feature. The consequence measured here: a guarded data step rewrites exactly those two lines, and
// nothing in the template a fresh publish starts from brings the retired line back.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const sql = read('supabase/migrations/20270346160000_home_states_finders_fee.sql')
assert.ok(sql.includes("v_new_cta    text := 'Joining is free. Opening a Space is free, and it comes with Crew, so it can take donations and tips."), 'no data step rewrites the front door money line')
assert.ok(sql.includes('We earn one capped finder’s fee, once, only on a customer the network sends you'), 'the front door does not name the capped finder’s fee')
assert.ok(/raise exception 'LIVE-2446: the home-cta-mid body no longer matches/.test(sql), 'the data step is not guarded against overwriting newer words')
assert.ok(!/Tips stay open on every tier/i.test(read('lib/page-editor/templates/home.ts')), 'the home template still says tips are open on every tier')
console.log('LIVE-2446: the front door data step states the finder’s fee and the paying-account rule')
