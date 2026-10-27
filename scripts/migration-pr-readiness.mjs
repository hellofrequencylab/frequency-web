// PR readiness only. The isolated PR-target workflow checks out the fresh main Git blob;
// it executes no candidate code and accepts no caller-supplied ledger or approval JSON.
// Main pushes continue through the unchanged strict check-migrations.mjs path.
const digest = /^[a-f0-9]{64}$/
const version = /^\d{14}$/
const fail = reason => ({ status: 'failed', ok: false, reason })
function rows(input, hashes) {
  if (!Array.isArray(input) || input.length < 400) return null
  const out = new Map()
  for (const row of input) {
    if (!version.test(row?.version) || !/^[A-Za-z0-9_.-]+$/.test(row?.name) || out.has(row.version) || (hashes && !digest.test(row.sha256))) return null
    out.set(row.version, row)
  }
  return out
}
function sameNames(a, b) { return a.size === b.size && [...a].every(([v, r]) => b.get(v)?.name === r.name) }
export function evaluateReadiness(facts, policy) {
  const base = rows(facts.baseRows, true), head = rows(facts.headRows, true), live = rows(facts.liveRows, false)
  if (!base || !head || !live) return fail('unknown_or_malformed_inventory')
  if (facts.event !== 'pull_request') return sameNames(head, live) ? { ok: true, status: 'strict_parity' } : fail('strict_main_parity')
  if (!facts.currentBase || facts.baseSha !== facts.currentBase || !facts.sameRepository || facts.baseBranch !== 'main' || facts.headSha !== facts.currentHead) return fail('unknown_or_moving_base_head')
  if (!sameNames(base, live)) return fail('base_live_drift')
  for (const [v, b] of base) {
    const h = head.get(v)
    if (!h || h.name !== b.name || h.sha256 !== b.sha256) return fail('historical_migration_changed')
  }
  const added = [...head.values()].filter(r => !base.has(r.version))
  if (!added.length) return sameNames(head, live) ? { ok: true, status: 'strict_parity' } : fail('unexpected_drift')
  if (!policy?.trustedMainSnapshot || policy.baseSha !== facts.baseSha || !Array.isArray(policy.registrations) || !policy.registrations.length) return fail('untrusted_or_missing_registration')
  const newestBase = [...base.keys()].sort().at(-1)
  const oldOrder = added.filter(row => row.version <= newestBase)
  const orderingExceptions = policy.orderingExceptions ?? []
  if (!Array.isArray(orderingExceptions) || orderingExceptions.length !== oldOrder.length || oldOrder.some(row => !orderingExceptions.some(e => e.file === `supabase/migrations/${row.version}_${row.name}.sql` && e.sha256 === row.sha256 && typeof e.reason === 'string' && e.reason.trim().length >= 20))) return fail('non_monotonic_new_migration')
  if (!Array.isArray(facts.migrationChanges) || facts.migrationChanges.length !== added.length || facts.migrationChanges.some(c => c.status !== 'added')) return fail('non_add_only_diff')
  const expected = policy.registrations
  if (expected.length !== added.length) return fail('unregistered_migration')
  for (const h of added) {
    const file = `supabase/migrations/${h.version}_${h.name}.sql`
    const registration = expected.find(r => r.file === file)
    if (!registration || registration.sha256 !== h.sha256 || !digest.test(registration.sha256) || !facts.migrationChanges.some(c => c.file === file && c.sha256 === h.sha256)) return fail('registration_hash_mismatch')
  }
  // Pin the complete reviewed executable diff (workflow/harness/SQL tests/runtime config),
  // rather than trusting a candidate-controlled workflow merely because it printed SUCCESS.
  const validChanges = changes => Array.isArray(changes) && changes.every(c => typeof c?.file === 'string' && ['added', 'modified', 'removed'].includes(c.status) && digest.test(c.sha256) && /^(000000|100644|100755|120000)$/.test(c.baseMode) && /^(000000|100644|100755|120000)$/.test(c.headMode)) && new Set(changes.map(c => c.file)).size === changes.length
  if (!validChanges(facts.reviewedChanges) || !validChanges(policy.reviewedChanges) || facts.reviewedChanges.length !== policy.reviewedChanges.length || facts.reviewedChanges.some(c => !policy.reviewedChanges.some(p => p.file === c.file && p.status === c.status && p.sha256 === c.sha256 && p.baseMode === c.baseMode && p.headMode === c.headMode))) return fail('unreviewed_execution_or_source_change')
  const run = facts.staging
  if (!run || run.repository !== facts.repository || run.app !== 'github-actions' || run.event !== 'workflow_dispatch' || run.headSha !== facts.headSha || run.workflowPath !== '.github/workflows/db-tests.yml' || run.status !== 'completed' || run.conclusion !== 'success' || !Number.isSafeInteger(run.id) || run.id <= 0) return fail('missing_or_stale_staging')
  const steps = policy.requiredSteps ?? ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', 'Real local service, anon and authenticated room API acceptance', 'Always destroy dispatched staging containers and volumes']
  if (!Array.isArray(steps) || steps.length < 5 || new Set(steps).size !== steps.length || !['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', 'Always destroy dispatched staging containers and volumes'].every(name => steps.includes(name))) return fail('invalid_staging_contract')
  if (!Array.isArray(run.steps) || steps.some(name => run.steps.filter(s => s.name === name && s.conclusion === 'success').length !== 1)) return fail('incomplete_staging')
  return { ok: true, status: 'registered_pending_apply', pending: added.map(r => r.version), mainRemainsStrict: true }
}

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const REPOSITORY = 'hellofrequencylab/frequency-web'
const POLICY_PATH = 'scripts/migration-readiness-policy.json'
const SQL_PATH = /^supabase\/migrations\/(\d{14})_([A-Za-z0-9_.-]+)\.sql$/
const sha = /^[a-f0-9]{40}$/
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex')
const requireFact = (condition, message) => { if (!condition) throw new Error(message) }

// One native Git process reads the corpus; never spawn a process per historical migration.
export function readGitBlobs(git, revision, paths) {
  requireFact(paths.every(path => !/[\r\n]/.test(path)), 'unsupported blob path')
  const output = Buffer.from(git(['cat-file', '--batch'], true, paths.map(path => `${revision}:${path}\n`).join('')))
  const contents = []; let offset = 0
  for (let i = 0; i < paths.length; i++) {
    const end = output.indexOf(10, offset)
    requireFact(end >= offset, `incomplete Git blob header (${offset}/${output.length}, item ${i}/${paths.length})`)
    const match = /^[a-f0-9]{40,64} blob (\d+)$/.exec(output.subarray(offset, end).toString('utf8'))
    requireFact(match && Number.isSafeInteger(Number(match[1])), 'unexpected Git blob type')
    const size = Number(match[1]), start = end + 1
    requireFact(start + size < output.length && output[start + size] === 10, 'incomplete Git blob body')
    contents.push(output.subarray(start, start + size)); offset = start + size + 1
  }
  requireFact(offset === output.length, 'extra Git batch data')
  return contents
}

function gitModes(git, revision, paths) {
  const records = String(git(['ls-tree', '-r', '-z', revision, '--', ...paths])).split('\0').filter(Boolean)
  const modes = new Map()
  for (const record of records) {
    const match = /^([0-7]{6}) (blob|commit) [a-f0-9]{40,64}\t([\s\S]+)$/.exec(record)
    requireFact(match, 'unreadable Git tree metadata')
    requireFact(!modes.has(match[3]), 'duplicate Git path')
    modes.set(match[3], match[1])
  }
  return modes
}

// These are deliberately transport seams for offline integration fixtures, not CLI inputs.
// Production always supplies its own Git/GitHub/Management API readers below.
export async function collectReadiness({ env, event, git, api, ledger, collectorSha256, now = Date.now() }) {
  requireFact(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request_target', 'PR Actions context required')
  requireFact(env.GITHUB_REPOSITORY === REPOSITORY, 'unexpected repository')
  const number = event?.number
  requireFact(Number.isSafeInteger(number) && number > 0 && sha.test(event?.pull_request?.head?.sha), 'unknown event head')
  const readPr = () => api(`/repos/${REPOSITORY}/pulls/${number}`)
  const readMain = () => api(`/repos/${REPOSITORY}/branches/main`)
  const [pr, main] = await Promise.all([readPr(), readMain()])
  const baseSha = main?.commit?.sha, headSha = pr?.head?.sha
  requireFact(pr?.state === 'open' && !pr.draft && pr?.base?.ref === 'main' && pr?.base?.repo?.full_name === REPOSITORY && pr?.head?.repo?.full_name === REPOSITORY, 'open ready same-repository main PR required')
  requireFact(sha.test(baseSha) && sha.test(headSha) && headSha === event.pull_request.head.sha && pr.base.sha === baseSha, 'stale or moving event/base/head')
  for (const revision of [baseSha, headSha]) git(['fetch', '--no-tags', '--filter=blob:none', 'origin', revision])
  // This job checks out main on an isolated runner and never executes candidate code.
  requireFact(env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/.github/workflows/migration-readiness.yml@refs/heads/main` && env.GITHUB_SHA === baseSha && String(git(['rev-parse', 'HEAD'])).trim() === baseSha, 'trusted current-main workflow checkout required')
  const blob = (revision, path) => git(['show', `${revision}:${path}`], true)
  const inventory = revision => {
    const names = String(git(['ls-tree', '-r', '--name-only', revision, '--', 'supabase/migrations/'])).trim().split('\n')
    const files = names.filter(file => file.endsWith('.sql'))
    requireFact(files.every(file => SQL_PATH.test(file)), 'malformed migration filename')
    const modes = gitModes(git, revision, ['supabase/migrations/'])
    requireFact(files.every(file => ['100644', '100755'].includes(modes.get(file))), 'migration SQL must be a regular file')
    const contents = readGitBlobs(git, revision, files)
    const inventoryRows = files.map((file, i) => {
      const match = SQL_PATH.exec(file)
      return { version: match[1], name: match[2], sha256: hashBytes(contents[i]), mode: modes.get(file) }
    })
    return inventoryRows
  }
  requireFact(digest.test(collectorSha256 ?? '') && hashBytes(blob(baseSha, 'scripts/migration-pr-readiness.mjs')) === collectorSha256, 'collector differs from current main')
  // NUL paths and no rename folding: delete+add cannot hide historical SQL edits.
  const fields = String(git(['diff', '--name-status', '--no-renames', '-z', baseSha, headSha, '--'])).split('\0')
  fields.pop()
  requireFact(fields.length % 2 === 0, 'malformed Git diff')
  const reviewedChanges = []
  for (let i = 0; i < fields.length; i += 2) {
    const [status, file] = [fields[i], fields[i + 1]]
    requireFact(['A', 'M', 'D'].includes(status) && file && !file.includes('\n'), 'unsupported change kind/path')
    reviewedChanges.push({ file, status: { A: 'added', M: 'modified', D: 'removed' }[status], sha256: hashBytes(blob(status === 'D' ? baseSha : headSha, file)) })
  }
  if (!reviewedChanges.some(change => change.file.startsWith('supabase/migrations/'))) {
    const [finalPr, finalMain] = await Promise.all([readPr(), readMain()])
    requireFact(finalPr.state === 'open' && !finalPr.draft && finalPr.head.sha === headSha && finalPr.base.sha === baseSha && finalMain.commit.sha === baseSha, 'branch moved during no-SQL fallback')
    return { ok: true, status: 'not_applicable' }
  }
  const paths = reviewedChanges.map(change => change.file)
  const baseModes = gitModes(git, baseSha, paths), headModes = gitModes(git, headSha, paths)
  for (const change of reviewedChanges) { change.baseMode = baseModes.get(change.file) ?? '000000'; change.headMode = headModes.get(change.file) ?? '000000' }
  const baseRows = inventory(baseSha), headRows = inventory(headSha)
  const liveRows = await ledger()
  const baseInventory = rows(baseRows, true), headInventory = rows(headRows, true), liveInventory = rows(liveRows, false)
  requireFact(baseInventory && headInventory && liveInventory && sameNames(baseInventory, liveInventory), 'current main/production drift')
  for (const [version, old] of baseInventory) {
    const current = headInventory.get(version)
    requireFact(current && current.name === old.name && current.sha256 === old.sha256 && current.mode === old.mode, 'historical SQL changed')
  }
  if (baseInventory.size === headInventory.size) {
    const [finalPr, finalMain, finalLedger] = await Promise.all([readPr(), readMain(), ledger()])
    const finalRows = rows(finalLedger, false)
    requireFact(finalRows && sameNames(baseInventory, finalRows) && finalPr.state === 'open' && !finalPr.draft && finalPr.base.ref === 'main' && finalPr.head.repo?.full_name === REPOSITORY && finalPr.head.sha === headSha && finalPr.base.sha === baseSha && finalMain.commit.sha === baseSha, 'branch or ledger moved during strict comparison')
    return { ok: true, status: 'strict_parity' }
  }
  const policyDocument = JSON.parse(String(blob(baseSha, POLICY_PATH)))
  requireFact(policyDocument?.version === 1 && Array.isArray(policyDocument.registrations), 'unknown main policy format')
  const registrations = policyDocument.registrations.filter(r => r?.pullRequest === number)
  requireFact(registrations.length === 1, 'exactly one main-side PR registration required')
  const registration = registrations[0]
  requireFact(Number.isFinite(Date.parse(registration.expiresAt)) && Date.parse(registration.expiresAt) > now, 'expired or undated registration')
  requireFact(registration.workflowPath === '.github/workflows/db-tests.yml' && digest.test(registration.workflowSha256) && Array.isArray(registration.requiredSteps) && registration.requiredSteps.length >= 4 && registration.requiredSteps.every(s => typeof s === 'string' && s.length > 0) && new Set(registration.requiredSteps).size === registration.requiredSteps.length, 'invalid reviewed staging contract')
  const coreSteps = ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', 'Always destroy dispatched staging containers and volumes']
  requireFact(typeof registration.apiAcceptanceStep === 'string' && registration.apiAcceptanceStep.length > 0 && !coreSteps.includes(registration.apiAcceptanceStep) && [...coreSteps, registration.apiAcceptanceStep].every(name => registration.requiredSteps.includes(name)), 'full replay, TAP, API acceptance and cleanup contract required')
  requireFact(hashBytes(blob(headSha, registration.workflowPath)) === registration.workflowSha256, 'unreviewed staging workflow bytes')
  const workflow = await api(`/repos/${REPOSITORY}/actions/workflows/db-tests.yml`)
  requireFact(Number.isSafeInteger(workflow?.id) && workflow.path === registration.workflowPath, 'unrecognized database workflow')
  const runs = await api(`/repos/${REPOSITORY}/actions/workflows/${workflow.id}/runs?event=workflow_dispatch&head_sha=${headSha}&per_page=100`)
  requireFact(Array.isArray(runs?.workflow_runs) && Number.isSafeInteger(runs.total_count) && runs.total_count >= 0 && runs.total_count <= 100 && runs.workflow_runs.length === runs.total_count, 'unknown or truncated staging run inventory')
  const candidates = runs.workflow_runs.filter(r => r.head_sha === headSha && r.event === 'workflow_dispatch' && r.workflow_id === workflow.id && r.repository?.full_name === REPOSITORY).sort((a, b) => b.id - a.id)
  // A failed/running newest dispatch cannot be hidden behind an older green attempt.
  const run = candidates[0]
  requireFact(run?.status === 'completed' && run.conclusion === 'success' && Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt), 'latest exact-head staging is not successful')
  const jobs = await api(`/repos/${REPOSITORY}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  requireFact(Array.isArray(jobs?.jobs) && jobs.jobs.length > 0 && Number.isSafeInteger(jobs.total_count) && jobs.total_count === jobs.jobs.length && jobs.total_count <= 100 && jobs.jobs.every(j => j.status === 'completed' && j.conclusion === 'success' && j.head_sha === headSha), 'incomplete staging job inventory')
  for (const job of jobs.jobs) {
    const checkId = /\/check-runs\/(\d+)$/.exec(job.check_run_url ?? '')?.[1]
    requireFact(checkId, 'staging check identity missing')
    const check = await api(`/repos/${REPOSITORY}/check-runs/${checkId}`)
    requireFact(check?.app?.slug === 'github-actions' && check.app.id === 15368 && check.head_sha === headSha && check.status === 'completed' && check.conclusion === 'success', 'untrusted staging check publisher')
  }
  const steps = jobs.jobs.flatMap(j => j.steps ?? [])
  for (const name of registration.requiredSteps) requireFact(steps.filter(s => s.name === name && s.conclusion === 'success').length === 1, 'required reviewed staging step missing/duplicated')
  // The decision kernel retains the original independent full-replay/TAP/API/cleanup requirements.
  const staging = { id: run.id, repository: REPOSITORY, app: 'github-actions', event: run.event, headSha, workflowPath: workflow.path, status: run.status, conclusion: run.conclusion, steps }
  const [currentPr, currentMain, currentLiveRows, currentRuns] = await Promise.all([readPr(), readMain(), ledger(), api(`/repos/${REPOSITORY}/actions/workflows/${workflow.id}/runs?event=workflow_dispatch&head_sha=${headSha}&per_page=100`)])
  requireFact(Number.isSafeInteger(currentRuns?.total_count) && Array.isArray(currentRuns.workflow_runs) && currentRuns.total_count === currentRuns.workflow_runs.length && currentRuns.total_count <= 100, 'unknown final staging run inventory')
  const latest = currentRuns.workflow_runs.filter(r => r.head_sha === headSha && r.event === 'workflow_dispatch' && r.workflow_id === workflow.id && r.repository?.full_name === REPOSITORY).sort((a, b) => b.id - a.id)[0]
  requireFact(latest?.id === run.id && latest.run_attempt === run.run_attempt && latest.status === 'completed' && latest.conclusion === 'success', 'staging changed during proof collection')
  const firstLive = rows(liveRows, false), currentLive = rows(currentLiveRows, false)
  requireFact(firstLive && currentLive && sameNames(firstLive, currentLive), 'production ledger moved during proof collection')
  requireFact(currentPr.state === 'open' && !currentPr.draft && currentPr.base.ref === 'main' && currentPr.head.repo?.full_name === REPOSITORY && currentPr.head.sha === headSha && currentPr.base.sha === baseSha && currentMain.commit.sha === baseSha, 'PR moved during proof collection')
  return evaluateReadiness({ event: 'pull_request', repository: REPOSITORY, sameRepository: true, baseBranch: 'main', baseSha, currentBase: currentMain.commit.sha, headSha, currentHead: currentPr.head.sha, baseRows, headRows, liveRows, migrationChanges: reviewedChanges.filter(c => c.file.startsWith('supabase/migrations/')), reviewedChanges, staging }, { trustedMainSnapshot: true, baseSha, registrations: registration.migrations, reviewedChanges: registration.reviewedChanges, requiredSteps: registration.requiredSteps, orderingExceptions: registration.orderingExceptions })
}

async function main() {
  const env = process.env
  requireFact(env.GITHUB_TOKEN, 'read-only metadata token required')
  const request = async (url, token, options = {}) => {
    const res = await fetch(url, { ...options, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    requireFact(res.ok, `proof read HTTP ${res.status}`)
    const text = await res.text()
    requireFact(text.length < 16 * 1024 * 1024, 'oversized proof response')
    return JSON.parse(text)
  }
  const result = await collectReadiness({
    env, collectorSha256: hashBytes(readFileSync(process.argv[1])), event: JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')),
    git: (args, binary = false, input) => execFileSync('git', ['--no-replace-objects', ...args], { input, encoding: binary ? undefined : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }),
    api: path => request(`https://api.github.com${path}`, env.GITHUB_TOKEN),
    ledger: async () => {
      requireFact(env.SUPABASE_ACCESS_TOKEN && /^[a-z0-9]+$/.test(env.SUPABASE_PROJECT_REF ?? ''), 'live comparison credentials required')
      const payload = await request(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, env.SUPABASE_ACCESS_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'select version, name from supabase_migrations.schema_migrations order by version' }) })
      requireFact(Array.isArray(payload), 'unknown live ledger payload')
      return payload
    },
  })
  requireFact(result.ok && ['strict_parity', 'registered_pending_apply', 'not_applicable'].includes(result.status), `migration readiness refused: ${result.reason ?? result.status}`)
  if (result.status === 'not_applicable') { console.log('No migration-directory change; readiness fallback only, production ledger NOT compared.'); return }
  if (result.status === 'strict_parity') { console.log('Migration PR historical SQL unchanged; current main/production strict parity VERIFIED.'); return }
  console.log(`Migration PR staging VERIFIED; ${result.pending.length} exact registered migration(s) PENDING APPLY. Production was NOT changed. Main remains strict.`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  // No API body, token, SQL, state or Git command arguments are copied into CI diagnostics.
  console.error('Migration PR readiness failed closed; registration, current base/ledger or exact-head staging proof was not satisfied.')
  process.exitCode = 1
})
