// SCAN-1185 probe: the three space_email owner-read policies wrap auth.uid() in a select, and the two
// composite foreign keys have a covering index. Reads the migration tree.
import { readdirSync, readFileSync } from 'node:fs'
const all = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n')
const need = [
  /alter policy space_email_domains_owner_read[\s\S]{0,400}\(select auth\.uid\(\)\)/i,
  /alter policy space_email_identities_owner_read[\s\S]{0,400}\(select auth\.uid\(\)\)/i,
  /alter policy space_email_identity_defaults_owner_read[\s\S]{0,400}\(select auth\.uid\(\)\)/i,
  /create index if not exists \w+\s+on public\.space_email_identities \(domain_id, space_id\)/i,
  /create index if not exists \w+\s+on public\.space_email_reply_aliases \(conversation_id, space_id\)/i,
]
const miss = need.filter((r) => !r.test(all))
if (miss.length) { console.error(`FAIL: ${miss.length} of 5 advisor fixes missing`); process.exit(1) }
console.log('ok: space_email policies use an initplan and both composite FKs are indexed')
