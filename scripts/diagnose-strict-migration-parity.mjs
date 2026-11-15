import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PROJECT } from './diagnose-migration-readonly.mjs'
export const LEDGER_QUERY = "select version, coalesce(name, '') as name from supabase_migrations.schema_migrations order by version"
export function safeParityResult(result) {
  if (result.status !== 0 || result.error) return { category: 'strict_guard_failed' }
  const text = typeof result.stdout === 'string' ? result.stdout : ''
  const counts = /^✅ Migration ledger parity: (\d+) repo file\(s\) ⇄ (\d+) applied row\(s\), identical on version and name\.$/m.exec(text)
  const hashes = /^   versions sha256 `([a-f0-9]{64})` · version\+name sha256 `([a-f0-9]{64})`$/m.exec(text)
  if (!counts || !hashes || counts[1] !== counts[2] || Number(counts[1]) < 400) return { category: 'strict_parity_not_proven' }
  return { category:'strict_version_name_parity', guardExit:0, repoCount:Number(counts[1]), ledgerCount:Number(counts[2]), versionsSha256:hashes[1], versionNameSha256:hashes[2] }
}
export async function strictParity(workspace, runner = spawnSync, fetcher = fetch, env = process.env) {
  const directory = mkdtempSync(join(tmpdir(), 'frequency-parity-'))
  try {
    if (env.SUPABASE_PROJECT_REF !== PROJECT || !env.SUPABASE_ACCESS_TOKEN) return {category:'ledger_configuration_refused'}
    let response, text, body
    try {
      response = await fetcher(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:LEDGER_QUERY,read_only:true}),redirect:'error',signal:AbortSignal.timeout(30000)})
      if (response.status < 200 || response.status >= 300) return {category:'ledger_fetch_failed',httpStatus:response.status}
      text = await response.text()
      if (text.length > 16*1024*1024) return {category:'ledger_payload_refused'}
      body = JSON.parse(text)
      if (!Array.isArray(body) || body.length < 400) return {category:'ledger_payload_refused'}
    } catch { return {category:'ledger_read_unavailable'} }
    const ledgerFile = join(directory,'ledger.json')
    writeFileSync(ledgerFile,text,{mode:0o600})
    const result = runner(process.execPath, [resolve(workspace,'trusted-guard/scripts/check-migrations.mjs'),'--require-ledger','--ledger',ledgerFile], {cwd:resolve(workspace,'rollback-candidate'),env:process.env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024})
    // The unchanged guard may include a provider body on failure. Never forward it to Actions.
    writeFileSync(join(directory,'guard.log'),String(result.stdout ?? '')+String(result.stderr ?? ''),{mode:0o600})
    return { ...safeParityResult(result), liveLedgerCount:body.length, analytics50000Recorded:body.some(row=>row?.version==='20270346050000'), analytics50000NameMatches:body.some(row=>row?.version==='20270346050000' && row.name==='analytics_experiments'), hunts51000Recorded:body.some(row=>row?.version==='20270346051000'), hunts51000NameMatches:body.some(row=>row?.version==='20270346051000' && row.name==='hunt_moderation') }
  } finally { rmSync(directory,{recursive:true,force:true}) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await strictParity(process.env.GITHUB_WORKSPACE || process.cwd())
  console.log(JSON.stringify(result))
  if (result.category !== 'strict_version_name_parity') process.exitCode=1
}
