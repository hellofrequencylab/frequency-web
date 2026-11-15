import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export function safeParityResult(result) {
  if (result.status !== 0 || result.error) return { category: 'strict_guard_failed' }
  const text = typeof result.stdout === 'string' ? result.stdout : ''
  const counts = /^✅ Migration ledger parity: (\d+) repo file\(s\) ⇄ (\d+) applied row\(s\), identical on version and name\.$/m.exec(text)
  const hashes = /^   versions sha256 `([a-f0-9]{64})` · version\+name sha256 `([a-f0-9]{64})`$/m.exec(text)
  if (!counts || !hashes || counts[1] !== counts[2] || Number(counts[1]) < 400) return { category: 'strict_parity_not_proven' }
  return { category:'strict_version_name_parity', guardExit:0, repoCount:Number(counts[1]), ledgerCount:Number(counts[2]), versionsSha256:hashes[1], versionNameSha256:hashes[2] }
}
export function strictParity(workspace, runner = spawnSync) {
  const directory = mkdtempSync(join(tmpdir(), 'frequency-parity-'))
  try {
    const result = runner(process.execPath, [resolve(workspace,'trusted-guard/scripts/check-migrations.mjs'),'--require-ledger'], {cwd:resolve(workspace,'rollback-candidate'),env:process.env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024})
    // The unchanged guard may include a provider body on failure. Never forward it to Actions.
    writeFileSync(join(directory,'guard.log'),String(result.stdout ?? '')+String(result.stderr ?? ''),{mode:0o600})
    return safeParityResult(result)
  } finally { rmSync(directory,{recursive:true,force:true}) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = strictParity(process.env.GITHUB_WORKSPACE || process.cwd())
  console.log(JSON.stringify(result))
  if (result.category !== 'strict_version_name_parity') process.exitCode=1
}
