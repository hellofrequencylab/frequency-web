// Candidate CI consumes only independent metadata from the trusted main-only PR-target run.
// No production credentials, SQL, candidate approval JSON, downloaded code or artifacts used.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { invokedDirectly } from './lib/invoked-directly.mjs'
const repository = 'hellofrequencylab/frequency-web'
const validSha = /^[a-f0-9]{40}$/
const requireFact = (condition, message) => { if (!condition) throw Error(message) }
export async function verifyReadiness({ env, event, api, git }) {
  requireFact(env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_REPOSITORY === repository && Number.isSafeInteger(event?.number) && event.number > 0, 'PR context required')
  const readPr = () => api(`/repos/${repository}/pulls/${event.number}`)
  const readMain = () => api(`/repos/${repository}/branches/main`)
  const [pr, main, workflow] = await Promise.all([readPr(), readMain(), api(`/repos/${repository}/actions/workflows/migration-readiness.yml`)])
  // base is the PR's own base; mainTip is only required to equal it when the PR adds SQL.
  const head = pr?.head?.sha, base = pr?.base?.sha, mainTip = main?.commit?.sha
  requireFact(pr?.state === 'open' && !pr.draft && pr.base.ref === 'main' && pr.head.repo?.full_name === repository && pr.base.repo?.full_name === repository && validSha.test(head) && validSha.test(base) && validSha.test(mainTip) && event.pull_request?.head?.sha === head, 'current same-repository PR required')
  const parents = String(git(['cat-file', '-p', 'HEAD'])).split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7))
  requireFact(parents.length === 2 && parents[1] === head, 'CI merge tree is stale')
  const requireCurrentBase = () => requireFact(base === mainTip && parents[0] === mainTip, 'CI merge tree is stale')
  let noSql = false
  requireFact(Number.isSafeInteger(workflow?.id) && workflow.path === '.github/workflows/migration-readiness.yml', 'trusted workflow identity unavailable')
  const inventory = await api(`/repos/${repository}/actions/workflows/${workflow.id}/runs?event=pull_request_target&head_sha=${head}&per_page=100`)
  requireFact(Number.isSafeInteger(inventory?.total_count) && Array.isArray(inventory.workflow_runs) && inventory.total_count === inventory.workflow_runs.length && inventory.total_count <= 100, 'run inventory incomplete')
  const run = inventory.workflow_runs.filter(r => r.event === 'pull_request_target' && r.workflow_id === workflow.id && r.head_sha === head && r.repository?.full_name === repository && r.pull_requests?.some(p => p.number === event.number && p.head?.sha === head && p.base?.sha === base)).sort((a, b) => b.id - a.id)[0]
  requireFact(run?.status === 'completed' && run.conclusion === 'success' && Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt), 'exact-head trusted readiness is not complete')
  const jobs = await api(`/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  requireFact(Array.isArray(jobs?.jobs) && jobs.total_count === jobs.jobs.length && [1, 2].includes(jobs.total_count), 'trusted job inventory incomplete or unexpected')
  // Actions also exposes our explicitly published check as a synthetic job. It is not
  // a second evaluator: require the unique real evaluator and authenticate that check.
  const evaluators = jobs.jobs.filter(job => job.steps?.filter(step => step.name === 'Evaluate migration PR readiness' && step.conclusion === 'success').length === 1)
  requireFact(evaluators.length === 1, 'trusted evaluator did not complete')
  const evaluator = evaluators[0]
  requireFact(evaluator.status === 'completed' && evaluator.conclusion === 'success' && evaluator.head_sha === head, 'trusted evaluator did not complete')
  const checkId = /\/check-runs\/(\d+)$/.exec(evaluator.check_run_url ?? '')?.[1]
  requireFact(checkId, 'trusted job check identity missing')
  const check = await api(`/repos/${repository}/check-runs/${checkId}`)
  requireFact(check?.app?.id === 15368 && check.app.slug === 'github-actions' && check.head_sha === head && check.conclusion === 'success', 'untrusted check publisher')
  if (jobs.jobs.length === 2) {
    requireFact(evaluator.name === 'migration-readiness-runner' && evaluator.run_id === run.id && evaluator.run_attempt === run.run_attempt && Number.isSafeInteger(evaluator.runner_id) && evaluator.runner_id > 0, 'unrecognized real evaluator')
    const synthetic = jobs.jobs.find(job => job !== evaluator)
    requireFact(synthetic.name === 'migration-readiness' && synthetic.run_id === run.id && synthetic.run_attempt === run.run_attempt && synthetic.head_sha === head && synthetic.runner_id === null && Array.isArray(synthetic.steps) && synthetic.steps.length === 0 && synthetic.status === 'completed' && synthetic.conclusion === 'success', 'unrecognized additional job')
    const syntheticId = /\/check-runs\/(\d+)$/.exec(synthetic.check_run_url ?? '')?.[1]
    requireFact(syntheticId && syntheticId !== checkId, 'synthetic check identity missing')
    const published = await api(`/repos/${repository}/check-runs/${syntheticId}`)
    requireFact(published?.id === Number(syntheticId) && published.name === 'migration-readiness' && published.app?.id === 15368 && published.app.slug === 'github-actions' && published.head_sha === head && published.status === 'completed' && published.conclusion === 'success' && published.external_id === `migration-readiness:${run.id}:${run.run_attempt}:${event.number}:${base}:${head}`, 'untrusted synthetic publisher')
    const summary = published.output?.summary
    requireFact(typeof summary === 'string' && summary.length <= 8192 && summary.split('\n\n').length === 2, 'synthetic receipt missing')
    const receipt = JSON.parse(summary.split('\n\n')[1])
    requireFact(receipt?.version === 1 && receipt.pr === event.number && receipt.head === head && receipt.base === base && receipt.trustedRunId === String(run.id) && receipt.trustedRunAttempt === String(run.run_attempt) && ['not_applicable', 'strict_parity', 'registered_pending_apply'].includes(receipt.verdict), 'synthetic receipt binding differs')
    noSql = receipt.verdict === 'not_applicable'
    if (!noSql) requireCurrentBase()
    const sources = ['scripts/migration-pr-readiness.mjs', 'scripts/publish-migration-readiness.mjs', '.github/workflows/migration-readiness.yml', 'scripts/migration-readiness-policy.json']
    // A no-SQL receipt may come from the gate as of the PR's older base; the trusted run identity above authenticates it.
    requireFact(receipt.sources && Object.keys(receipt.sources).length === sources.length && sources.every(file => noSql ? /^[a-f0-9]{64}$/.test(receipt.sources[file] ?? '') : receipt.sources[file] === createHash('sha256').update(git(['show', `${mainTip}:${file}`])).digest('hex')), 'synthetic receipt source differs from current main')
    if (receipt.verdict === 'registered_pending_apply') {
      requireFact(/^[a-f0-9]{64}$/.test(receipt.registrationSha256 ?? '') && /^[a-f0-9]{64}$/.test(receipt.workflowSha256 ?? '') && Number.isSafeInteger(receipt.stagingRunId) && receipt.stagingRunId > 0 && Number.isSafeInteger(receipt.stagingAttempt) && receipt.stagingAttempt > 0, 'synthetic staging receipt incomplete')
    }
  }
  if (jobs.jobs.length !== 2) requireCurrentBase()
  const [finalPr, finalMain] = await Promise.all([readPr(), readMain()])
  requireFact(finalPr.state === 'open' && !finalPr.draft && finalPr.head.sha === head && finalPr.base.sha === base && (noSql || finalMain.commit.sha === mainTip), 'branch moved during readiness read')
  return { ok: true, runId: run.id, head, base }
}
async function main() {
  const env = process.env
  requireFact(env.GITHUB_TOKEN, 'read token required')
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
  const api = async path => {
    const response = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    requireFact(response.ok, 'proof metadata unavailable')
    return response.json()
  }
  let result
  // The independent workflow starts alongside CI. Bounded wait; stale/missing proof never passes.
  for (let attempt = 0; attempt < 12; attempt++) {
    try { result = await verifyReadiness({ env, event, api, git: args => execFileSync('git', ['--no-replace-objects', ...args], { encoding: 'utf8' }) }); break } catch {
      if (attempt === 11) throw Error('trusted proof unavailable')
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }
  requireFact(result?.ok, 'readiness not verified')
  console.log(`Independent current-main migration readiness VERIFIED by Actions run ${result.runId}; no production application claimed.`)
}
if (invokedDirectly(import.meta.url)) main().catch(() => { console.error('Migration PR readiness proof missing, stale, failed or unavailable; refusing.'); process.exitCode = 1 })
