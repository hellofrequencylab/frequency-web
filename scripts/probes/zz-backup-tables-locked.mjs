// SCAN-1190: every hand-made zz_* rollback table named by a migration is locked (RLS on, anon and authenticated revoked).
// Reads the migrations because CI has no catalog; the live check is the query at the foot of the migration.
import { readdirSync, readFileSync } from 'node:fs'
const dir = 'supabase/migrations'
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
const mig = readFileSync(`${dir}/20270346027700_lock_zz_backup_tables.sql`, 'utf8')
const need = ['zz_backup_free_human_20261029', 'zz_backup_free_human_blocks_20261030', 'zz_backup_free_human_page_20261030', 'zz_backup_free_human_pages_20261030', 'zz_backup_alli_rae_update5_20261030']
const bad = need.filter((t) => !mig.includes(`'${t}'`))
if (!/enable row level security/.test(mig) || !/revoke all on table[\s\S]*from anon, authenticated/.test(mig)) bad.push('rls/revoke statements')
if (/create table[^;]*zz_backup/i.test(sql) && bad.length) bad.push('zz table created in a migration without lock')
if (bad.length) { console.error('FAIL', bad); process.exit(1) }
console.log('ok: zz backup tables locked')
