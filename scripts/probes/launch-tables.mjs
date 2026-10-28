#!/usr/bin/env node
// VLS-01 with VLS-12, VLS-23, VLS-26: the Launch tables exist, in production and in the generated types.
//
// Fails until the migration is applied and lib/database.types.ts is regenerated from it, and fails when
// the migration loses a guarantee the launch leans on: one active launch per owner, the double-confirm
// cancel, cited facts only, append-only consent, a service-only reminder log.
import { readFileSync, readdirSync } from 'node:fs'

const bad = []
const tables = ['space_launch', 'launch_sources', 'launch_facts', 'launch_list_attestations', 'launch_email_log']
const file = readdirSync('supabase/migrations').find((f) => f.endsWith('_vera_launch.sql'))
if (!file) bad.push('no vera_launch migration')
const sql = file ? readFileSync(`supabase/migrations/${file}`, 'utf8') : ''
const has = (re, why) => { if (!re.test(sql)) bad.push(why) }

for (const t of tables) {
  has(new RegExp(`create table if not exists public\\.${t}\\b`), `${t} is not created`)
  has(new RegExp(`alter table public\\.${t} enable row level security`), `${t} has no RLS`)
  has(new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated`), `${t} is not revoked from browser roles`)
}
has(/space_launch_one_active_per_owner[\s\S]*where cancelled_at is null and completed_at is null/, 'one active launch per owner is not enforced')
has(/space_launch_cancel_needs_request check \(cancelled_at is null or cancel_requested_at is not null\)/, 'cancel does not need a prior request')
has(/snippet text not null check \(length\(snippet\) between 1 and 1000\)/, 'a fact can lack a verbatim snippet')
has(/origin text not null/, 'a fact can lack an origin')
has(/grant select, insert on table public\.launch_list_attestations to authenticated/, 'the attestation is not append-only for its owner')
has(/launch_email_log_once unique \(launch_id, trigger_kind\)/, 'a reminder can send twice')
if (/to authenticated[^;]*launch_email_log/.test(sql.replace(/\s+/g, ' ')) || /grant[^;]*on table public\.launch_email_log to authenticated/.test(sql)) bad.push('the reminder log is open to signed-in callers')

const types = readFileSync('lib/database.types.ts', 'utf8')
for (const t of tables) if (!new RegExp(`^\\s{6}${t}: \\{`, 'm').test(types)) bad.push(`${t} is not in lib/database.types.ts (apply the migration, then regenerate)`)

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('✓ the five Launch tables are migrated, guarded and typed')
