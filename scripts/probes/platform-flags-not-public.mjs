// SEC-016: platform_flags is not readable by anon or authenticated, and no app code reads it through a user-scoped client.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const bad = []
const mig = readdirSync('supabase/migrations').filter((f) => f.endsWith('platform_flags_not_public.sql'))
if (!mig.length) bad.push('no migration drops the public read policy')
else {
  const sql = readFileSync(join('supabase/migrations', mig[0]), 'utf8')
  if (!/drop policy if exists "platform_flags: public read"/i.test(sql)) bad.push('policy not dropped')
  if (!/revoke all on table public\.platform_flags from anon, authenticated/i.test(sql)) bad.push('grants not revoked')
}
// A file that queries platform_flags must do it through the admin client.
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return n === 'node_modules' || n === '.next' ? [] : statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [] })
for (const f of ['app', 'lib', 'components'].flatMap(walk)) {
  const s = readFileSync(f, 'utf8')
  if (/from\(\s*['"]platform_flags['"]\s*\)/.test(s) && !/createAdminClient/.test(s)) bad.push(`${f} reads platform_flags without the admin client`)
}
if (bad.length) { console.error('FAIL', bad); process.exit(1) }
console.log('ok: platform_flags is not public')
