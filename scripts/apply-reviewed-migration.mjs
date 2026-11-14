// Main-owned apply entry point. Candidate Git blobs are data, never executed JavaScript.
import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readGitBlobs } from './migration-pr-readiness.mjs'
import { invokedDirectly } from './lib/invoked-directly.mjs'
import { migrationDigest, migrationTransaction, normalizedLedger } from './lib/migration-transaction.mjs'

const REPO = 'hellofrequencylab/frequency-web'
export const PRODUCTION_PROJECT = 'azsqfeonabsbmemvddqd'
const SQL = /^supabase\/migrations\/(\d{14})_([A-Za-z0-9_.-]+)\.sql$/
const SHA = /^[a-f0-9]{40}$/
const SOURCES = ['scripts/migration-pr-readiness.mjs', 'scripts/publish-migration-readiness.mjs', '.github/workflows/migration-readiness.yml', 'scripts/migration-readiness-policy.json']
const LEDGER = "select version, coalesce(name, '') as name from supabase_migrations.schema_migrations order by version"
const requireFact = (condition, message) => { if (!condition) throw Object.assign(Error(message), { safe: true }) }
const same = (a, b) => JSON.stringify(normalizedLedger(a)) === JSON.stringify(normalizedLedger(b))
const complete = value => value?.status === 'completed' && value.conclusion === 'success'
const trusted = value => value?.app?.id === 15368 && value.app.slug === 'github-actions'

async function responseJSON(fetcher, url, token, body) {
  let response, text
  try {
    response = await fetcher(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(body ? 150000 : 30000) })
    requireFact(response.ok, 'Provider request failed')
    text = await response.text()
    requireFact(text.length < 16 * 1024 * 1024, 'Provider response too large')
    return JSON.parse(text)
  } catch { throw Object.assign(Error('Provider request failed or outcome unavailable'), { safe: true }) }
}

export function createQueryBackend(env, { fetcher = fetch, run = execFileSync } = {}) {
  requireFact(env.SUPABASE_PROJECT_REF === PRODUCTION_PROJECT, 'Canonical production project required')
  if (env.SUPABASE_DB_URL) {
    let url
    try { url = new URL(env.SUPABASE_DB_URL) } catch { throw Object.assign(Error('Invalid database connection configuration'), { safe: true }) }
    requireFact(['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname === '/postgres', 'Canonical database required')
    const direct = url.hostname === `db.${PRODUCTION_PROJECT}.supabase.co` && decodeURIComponent(url.username) === 'postgres'
    const pooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname) && decodeURIComponent(url.username) === `postgres.${PRODUCTION_PROJECT}`
    requireFact((direct || pooler) && ![...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'user', 'dbname', 'service'].includes(key)), 'Database project binding differs')
    requireFact(!url.searchParams.has('sslmode') || ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode')), 'Encrypted database connection required')
    if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require')
    return { kind: 'psql', query: async (sql, { readOnly = false } = {}) => {
      const statement = readOnly ? `begin read only; select coalesce(json_agg(q), '[]'::json) from (${sql}) q; commit;` : sql
      try {
        const out = run('psql', ['--no-psqlrc', '--no-password', '-qAt', '-v', 'ON_ERROR_STOP=1', url.href, '-c', statement], { encoding: 'utf8', timeout: 150000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
        return readOnly ? JSON.parse(String(out).trim()) : []
      } catch { throw Object.assign(Error('Database query failed or outcome unavailable'), { safe: true }) }
    } }
  }
  requireFact(typeof env.SUPABASE_ACCESS_TOKEN === 'string' && env.SUPABASE_ACCESS_TOKEN.length > 0, 'Database URL or Management API credential required')
  return { kind: 'management-api', query: async (sql, { readOnly = false } = {}) => {
    const body = await responseJSON(fetcher, `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT}/database/query`, env.SUPABASE_ACCESS_TOKEN, { query: sql, read_only: readOnly })
    requireFact(Array.isArray(body) && body.every(row => !row || typeof row !== 'object' || !('error' in row)), 'Unknown database query response')
    return body
  } }
}

function inventory(git, revision) {
  const entries = String(git(['ls-tree', '-r', '-z', revision, '--', 'supabase/migrations/'])).split('\0').filter(Boolean)
  const files = entries.filter(entry => entry.endsWith('.sql')).map(entry => {
    const match = /^(100644|100755) blob [a-f0-9]{40}\t(.+\.sql)$/.exec(entry)
    requireFact(match && SQL.test(match[2]), 'Malformed or non-regular migration source')
    return { file: match[2], mode: match[1] }
  })
  const blobs = readGitBlobs(git, revision, files.map(row => row.file))
  const rows = files.map((row, i) => { const [, version, name] = SQL.exec(row.file); return { ...row, version, name, sha256: migrationDigest(blobs[i]), sql: blobs[i].toString('utf8') } })
  normalizedLedger(rows)
  return rows
}

function reviewedDiff(git, base, head) {
  const fields = String(git(['diff', '--name-status', '--no-renames', '-z', base, head, '--'])).split('\0'); fields.pop()
  requireFact(fields.length % 2 === 0, 'Malformed source inventory')
  const modes = revision => new Map(String(git(['ls-tree', '-r', '-z', revision])).split('\0').filter(Boolean).map(row => { const match = /^([0-7]{6}) \w+ [a-f0-9]{40}\t(.+)$/.exec(row); requireFact(match, 'Unknown source mode'); return [match[2], match[1]] }))
  const before = modes(base), after = modes(head), result = []
  for (let i = 0; i < fields.length; i += 2) {
    const [status, file] = [fields[i], fields[i + 1]]
    requireFact(['A', 'M', 'D'].includes(status) && file && !/[\r\n]/.test(file), 'Unsupported source diff')
    result.push({ file, status: { A: 'added', M: 'modified', D: 'removed' }[status], sha256: migrationDigest(git(['show', `${status === 'D' ? base : head}:${file}`], true)), baseMode: before.get(file) ?? '000000', headMode: after.get(file) ?? '000000' })
  }
  return result
}

export async function collectApplyPlan({ env, git, api, query, now = Date.now }) {
  requireFact(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === REPO && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_WORKFLOW_REF === `${REPO}/.github/workflows/apply-migration.yml@refs/heads/main`, 'Main-owned apply workflow required')
  requireFact(env.SUPABASE_PROJECT_REF === PRODUCTION_PROJECT && /^\d+$/.test(env.PR ?? '') && Number.isSafeInteger(Number(env.PR)) && Number(env.PR) > 0 && /^[A-Za-z0-9-]{1,39}$/.test(env.GITHUB_ACTOR ?? ''), 'Canonical project, PR and actor required')
  const number = Number(env.PR), readPr = () => api(`/repos/${REPO}/pulls/${number}`), readMain = () => api(`/repos/${REPO}/branches/main`)
  const [pr, main] = await Promise.all([readPr(), readMain()])
  const base = main?.commit?.sha, head = pr?.head?.sha
  const binding = current => current?.state === 'open' && !current.draft && current.base?.ref === 'main' && current.base.repo?.full_name === REPO && current.head?.repo?.full_name === REPO && current.base.sha === base && current.head.sha === head
  requireFact(SHA.test(base) && SHA.test(head) && binding(pr) && env.SHA === head && env.GITHUB_SHA === base && String(git(['rev-parse', 'HEAD'])).trim() === base, 'Current exact PR/head/main required')
  const permission = await api(`/repos/${REPO}/collaborators/${env.GITHUB_ACTOR}/permission`)
  if (permission?.permission !== 'admin') {
    const reviews = await api(`/repos/${REPO}/pulls/${number}/reviews?per_page=100`)
    requireFact(Array.isArray(reviews) && reviews.length < 100, 'Complete approval inventory required')
    const latest = new Map(reviews.filter(review => review.user?.login !== pr.user?.login && review.commit_id === head).sort((a, b) => a.id - b.id).map(review => [review.user.login, review.state]))
    requireFact([...latest.values()].includes('APPROVED'), 'Admin dispatcher or exact-head independent approval required')
  }
  git(['fetch', '--no-tags', '--filter=blob:none', 'origin', head])
  const baseRows = inventory(git, base), headRows = inventory(git, head)
  const old = new Map(baseRows.map(row => [row.version, row]))
  requireFact(baseRows.every(row => headRows.some(next => next.version === row.version && next.name === row.name && next.sha256 === row.sha256 && next.mode === row.mode)), 'Historical SQL changed')
  const added = headRows.filter(row => !old.has(row.version)).sort((a, b) => a.version.localeCompare(b.version))
  requireFact(added.length > 0, 'No added migration')
  const policy = JSON.parse(String(git(['show', `${base}:scripts/migration-readiness-policy.json`])))
  const registrations = policy?.registrations?.filter(row => row.pullRequest === number)
  requireFact(policy.version === 1 && registrations?.length === 1, 'Exactly one main registration required')
  const registration = registrations[0]
  requireFact(Date.parse(registration.expiresAt) > now(), 'Registration expired')
  const changes = reviewedDiff(git, base, head)
  const canonical = rows => JSON.stringify([...rows].sort((a, b) => a.file.localeCompare(b.file)))
  requireFact(Array.isArray(registration.reviewedChanges) && canonical(changes) === canonical(registration.reviewedChanges), 'Reviewed source inventory changed')
  const migrationChanges = changes.filter(row => row.file.startsWith('supabase/migrations/'))
  requireFact(migrationChanges.length === added.length && migrationChanges.every(row => row.status === 'added'), 'Migration diff must be add-only')
  requireFact(Array.isArray(registration.migrations) && registration.migrations.length === added.length && added.every(row => registration.migrations.some(pin => pin.file === row.file && pin.sha256 === row.sha256)), 'Unregistered migration hash')
  const checks = await api(`/repos/${REPO}/commits/${head}/check-runs?per_page=100`)
  requireFact(checks?.total_count === checks?.check_runs?.length && checks.total_count <= 100, 'Complete check inventory required')
  const latestCheck = name => checks.check_runs.filter(check => check.name === name && trusted(check) && check.head_sha === head).sort((a, b) => b.id - a.id)[0]
  for (const name of ['db-tests', 'test', 'lint']) requireFact(complete(latestCheck(name)), 'Required exact-head source check not successful')
  const published = latestCheck('migration-readiness')
  requireFact(complete(published) && typeof published.output?.summary === 'string' && published.output.summary.length <= 8192 && published.output.summary.split('\n\n').length === 2, 'Trusted readiness receipt required')
  const receipt = JSON.parse(published.output.summary.split('\n\n')[1])
  requireFact(receipt.version === 1 && receipt.pr === number && receipt.head === head && receipt.base === base && receipt.verdict === 'registered_pending_apply' && /^\d+$/.test(receipt.trustedRunId) && /^\d+$/.test(receipt.trustedRunAttempt), 'Readiness binding differs')
  requireFact(published.external_id === `migration-readiness:${receipt.trustedRunId}:${receipt.trustedRunAttempt}:${number}:${base}:${head}` && receipt.sources && Object.keys(receipt.sources).length === SOURCES.length && SOURCES.every(file => receipt.sources[file] === migrationDigest(git(['show', `${base}:${file}`], true))), 'Readiness source binding differs')
  requireFact(receipt.registrationSha256 === migrationDigest(JSON.stringify(registration)) && receipt.workflowSha256 === registration.workflowSha256, 'Readiness registration differs')
  const trustedWorkflow = await api(`/repos/${REPO}/actions/workflows/migration-readiness.yml`)
  const trustedRuns = await api(`/repos/${REPO}/actions/workflows/${trustedWorkflow.id}/runs?event=pull_request_target&head_sha=${head}&per_page=100`)
  requireFact(trustedWorkflow.path === '.github/workflows/migration-readiness.yml' && trustedRuns.total_count === trustedRuns.workflow_runs?.length && trustedRuns.total_count <= 100, 'Trusted workflow inventory unavailable')
  const latest = trustedRuns.workflow_runs.filter(run => run.head_sha === head && run.event === 'pull_request_target' && run.workflow_id === trustedWorkflow.id && run.repository?.full_name === REPO).sort((a, b) => b.id - a.id)[0]
  // GitHub legitimately returns pull_requests:[] for pull_request_target runs.
  // The authenticated publisher receipt binds PR/base/head; the run/job bind its provenance.
  requireFact(complete(latest) && String(latest.id) === receipt.trustedRunId && String(latest.run_attempt) === receipt.trustedRunAttempt, 'Latest trusted readiness not successful')
  const jobs = await api(`/repos/${REPO}/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`)
  requireFact(jobs.total_count === jobs.jobs?.length && [1, 2].includes(jobs.total_count), 'Trusted evaluator job inventory differs')
  const evaluators = jobs.jobs.filter(job => job.name === 'migration-readiness-runner' && complete(job) && job.head_sha === head && job.steps?.filter(step => step.name === 'Evaluate migration PR readiness' && step.conclusion === 'success').length === 1)
  requireFact(evaluators.length === 1, 'Trusted evaluator did not succeed')
  const checkId = /\/check-runs\/(\d+)$/.exec(evaluators[0].check_run_url ?? '')?.[1]
  requireFact(checkId, 'Evaluator publisher identity absent')
  const evaluator = await api(`/repos/${REPO}/check-runs/${checkId}`)
  requireFact(trusted(evaluator) && complete(evaluator) && evaluator.head_sha === head && evaluators[0].run_id === latest.id && evaluators[0].run_attempt === latest.run_attempt && Number.isSafeInteger(evaluators[0].runner_id) && evaluators[0].runner_id > 0, 'Untrusted evaluator publisher')
  const synthetic = jobs.jobs.filter(job => job.name === 'migration-readiness' && complete(job) && job.head_sha === head && job.run_id === latest.id && job.run_attempt === latest.run_attempt && job.runner_id === null && Array.isArray(job.steps) && job.steps.length === 0)
  if (jobs.jobs.length === 2) requireFact(synthetic.length === 1 && /\/check-runs\/(\d+)$/.exec(synthetic[0].check_run_url ?? '')?.[1] === String(published.id), 'Published receipt is not this trusted run synthetic job')
  requireFact(registration.workflowPath === '.github/workflows/db-tests.yml' && receipt.workflowSha256 === migrationDigest(git(['show', `${head}:${registration.workflowPath}`], true)), 'Staging workflow source differs')
  const stagingWorkflow = await api(`/repos/${REPO}/actions/workflows/db-tests.yml`)
  const stagingRuns = await api(`/repos/${REPO}/actions/workflows/${stagingWorkflow.id}/runs?event=workflow_dispatch&head_sha=${head}&per_page=100`)
  requireFact(stagingWorkflow.path === registration.workflowPath && stagingRuns.total_count === stagingRuns.workflow_runs?.length && stagingRuns.total_count <= 100, 'Staging run inventory unavailable')
  const stage = stagingRuns.workflow_runs.filter(run => run.head_sha === head && run.event === 'workflow_dispatch' && run.workflow_id === stagingWorkflow.id && run.repository?.full_name === REPO).sort((a, b) => b.id - a.id)[0]
  requireFact(complete(stage) && stage.id === receipt.stagingRunId && stage.run_attempt === receipt.stagingAttempt, 'Latest exact-head staging differs')
  const stageJobs = await api(`/repos/${REPO}/actions/runs/${stage.id}/attempts/${stage.run_attempt}/jobs?per_page=100`)
  requireFact(stageJobs.total_count === stageJobs.jobs?.length && stageJobs.total_count > 0 && stageJobs.total_count <= 100 && stageJobs.jobs.every(job => complete(job) && job.head_sha === head), 'Staging job incomplete')
  for (const job of stageJobs.jobs) {
    const id = /\/check-runs\/(\d+)$/.exec(job.check_run_url ?? '')?.[1]
    requireFact(id, 'Staging publisher identity absent')
    const check = await api(`/repos/${REPO}/check-runs/${id}`)
    requireFact(trusted(check) && complete(check) && check.head_sha === head, 'Untrusted staging publisher')
  }
  const steps = stageJobs.jobs.flatMap(job => job.steps ?? [])
  const core = ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', 'Always destroy dispatched staging containers and volumes']
  requireFact(Array.isArray(registration.requiredSteps) && registration.requiredSteps.length >= 5 && new Set(registration.requiredSteps).size === registration.requiredSteps.length && typeof registration.apiAcceptanceStep === 'string' && registration.apiAcceptanceStep.length > 0 && !core.includes(registration.apiAcceptanceStep) && [...core, registration.apiAcceptanceStep].every(name => typeof name === 'string' && registration.requiredSteps.includes(name)) && registration.requiredSteps.every(name => steps.filter(step => step.name === name && step.conclusion === 'success').length === 1), 'Reviewed replay/TAP/API/cleanup not complete')
  const ledger = await query(LEDGER, { readOnly: true }); normalizedLedger(ledger)
  const candidate = new Map(headRows.map(row => [row.version, row.name]))
  requireFact(ledger.every(row => candidate.get(row.version) === row.name) && baseRows.every(row => ledger.some(live => live.version === row.version && live.name === row.name)), 'Main/production ledger drift')
  const maxBase = baseRows.map(row => row.version).sort().at(-1), maxLive = ledger.map(row => row.version).sort().at(-1)
  const plan = added.map(row => ({ ...row, action: ledger.some(live => live.version === row.version && live.name === row.name) ? 'skip' : 'apply' }))
  requireFact(plan.every(row => row.action === 'skip' || (row.version > maxBase && row.version > maxLive)), 'New version must exceed main and ledger')
  // Parse every file even in dry-run, before any production write can be considered.
  for (const row of plan.filter(row => row.action === 'apply')) migrationTransaction({ ...row, ledger })
  const recheck = async expected => {
    requireFact(Date.parse(registration.expiresAt) > now(), 'Registration expired before apply')
    const [currentPr, currentMain, currentLedger, currentChecks, currentStages, currentTrusted] = await Promise.all([readPr(), readMain(), query(LEDGER, { readOnly: true }), api(`/repos/${REPO}/commits/${head}/check-runs?per_page=100`), api(`/repos/${REPO}/actions/workflows/${stagingWorkflow.id}/runs?event=workflow_dispatch&head_sha=${head}&per_page=100`), api(`/repos/${REPO}/actions/workflows/${trustedWorkflow.id}/runs?event=pull_request_target&head_sha=${head}&per_page=100`)])
    requireFact(binding(currentPr) && currentMain.commit?.sha === base && same(currentLedger, expected), 'PR/main/ledger moved before apply')
    requireFact(currentChecks.total_count === currentChecks.check_runs?.length && currentChecks.total_count <= 100, 'Final check inventory unavailable')
    for (const name of ['db-tests', 'test', 'lint', 'migration-readiness']) {
      const check = currentChecks.check_runs.filter(value => value.name === name && trusted(value) && value.head_sha === head).sort((a, b) => b.id - a.id)[0]
      requireFact(complete(check) && (name !== 'migration-readiness' || check.id === published.id), 'Final source/readiness check changed')
    }
    for (const [inventory, snapshot, eventName, workflowId] of [[currentStages, stage, 'workflow_dispatch', stagingWorkflow.id], [currentTrusted, latest, 'pull_request_target', trustedWorkflow.id]]) {
      requireFact(inventory.total_count === inventory.workflow_runs?.length && inventory.total_count <= 100, 'Final run inventory unavailable')
      const run = inventory.workflow_runs.filter(value => value.head_sha === head && value.event === eventName && value.workflow_id === workflowId && value.repository?.full_name === REPO).sort((a, b) => b.id - a.id)[0]
      requireFact(complete(run) && run.id === snapshot.id && run.run_attempt === snapshot.run_attempt, 'Final trusted/staging run changed')
    }
  }
  await recheck(ledger)
  return { pr: number, head, base, plan, ledger, recheck }
}

export async function executeApplyPlan(plan, { query, dryRun = true } = {}) {
  requireFact(typeof query === 'function' && typeof dryRun === 'boolean', 'Explicit query transport required')
  const report = { pr: plan.pr, head: plan.head, base: plan.base, dryRun, files: plan.plan.map(row => ({ action: row.action, file: row.file, sha256: row.sha256 })) }
  if (dryRun) return report
  let ledger = plan.ledger
  for (const row of plan.plan) {
    if (row.action === 'skip') continue
    await plan.recheck(ledger)
    const transaction = migrationTransaction({ ...row, ledger })
    try { await query(transaction, { readOnly: false }) } catch {
      // Never retry a write: a timeout may mean COMMIT succeeded. Readback is diagnostic only.
      let recorded = false
      try { recorded = (await query(LEDGER, { readOnly: true })).some(live => live.version === row.version && live.name === row.name) } catch { /* outcome remains unknown */ }
      throw Object.assign(Error(recorded ? 'Apply response unavailable; version is recorded, verify before continuing' : 'Apply refused or outcome unknown; no write retried'), { safe: true })
    }
    const expected = [...ledger, { version: row.version, name: row.name }]
    const after = await query(LEDGER, { readOnly: true })
    requireFact(same(after, expected), 'Post-apply ledger does not match reviewed plan')
    ledger = after
  }
  await plan.recheck(ledger)
  return report
}

async function main() {
  requireFact(process.argv.slice(2).length <= 1 && process.argv.slice(2).every(arg => ['--apply', '--dry-run'].includes(arg)), 'Unknown apply arguments')
  const env = process.env
  requireFact(env.GH_TOKEN, 'GitHub metadata credential required')
  const git = (args, binary = false, input) => execFileSync('git', ['--no-replace-objects', ...args], { input, encoding: binary ? undefined : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
  requireFact(migrationDigest(readFileSync(fileURLToPath(import.meta.url))) === migrationDigest(git(['show', `${env.GITHUB_SHA}:scripts/apply-reviewed-migration.mjs`], true)), 'Apply helper differs from main')
  const backend = createQueryBackend(env)
  const api = path => responseJSON(fetch, `https://api.github.com${path}`, env.GH_TOKEN)
  const plan = await collectApplyPlan({ env, git, api, query: backend.query })
  const report = await executeApplyPlan(plan, { query: backend.query, dryRun: !process.argv.includes('--apply') })
  const text = JSON.stringify({ transport: backend.kind, ...report })
  console.log(text)
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### Reviewed migration ${report.dryRun ? 'dry-run' : 'apply'}\n\n\`\`\`json\n${text}\n\`\`\`\n`)
}

if (invokedDirectly(import.meta.url)) main().catch(error => { console.error(error?.safe ? error.message : 'Reviewed migration execution refused or unavailable'); process.exitCode = 1 })
