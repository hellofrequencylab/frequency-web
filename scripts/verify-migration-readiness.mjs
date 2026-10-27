// Candidate CI consumes only independent metadata from the trusted main-only PR-target run.
// No production credentials, SQL, candidate approval JSON, downloaded code or artifacts used.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const repository = 'hellofrequencylab/frequency-web'
const validSha = /^[a-f0-9]{40}$/
const requireFact = (condition, message) => { if (!condition) throw Error(message) }
export async function verifyReadiness({ env, event, api, git }) {
  requireFact(env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_REPOSITORY === repository && Number.isSafeInteger(event?.number) && event.number > 0, 'PR context required')
  const readPr = () => api(`/repos/${repository}/pulls/${event.number}`)
  const readMain = () => api(`/repos/${repository}/branches/main`)
  const [pr, main, workflow] = await Promise.all([readPr(), readMain(), api(`/repos/${repository}/actions/workflows/migration-readiness.yml`)])
  const head = pr?.head?.sha, base = main?.commit?.sha
  requireFact(pr?.state === 'open' && !pr.draft && pr.base.ref === 'main' && pr.head.repo?.full_name === repository && pr.base.repo?.full_name === repository && validSha.test(head) && validSha.test(base) && event.pull_request?.head?.sha === head && pr.base.sha === base, 'current same-repository PR required')
  const parents = String(git(['cat-file', '-p', 'HEAD'])).split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7))
  requireFact(parents.length === 2 && parents[0] === base && parents[1] === head, 'CI merge tree is stale')
  requireFact(Number.isSafeInteger(workflow?.id) && workflow.path === '.github/workflows/migration-readiness.yml', 'trusted workflow identity unavailable')
  const inventory = await api(`/repos/${repository}/actions/workflows/${workflow.id}/runs?event=pull_request_target&head_sha=${base}&per_page=100`)
  requireFact(Number.isSafeInteger(inventory?.total_count) && Array.isArray(inventory.workflow_runs) && inventory.total_count === inventory.workflow_runs.length && inventory.total_count <= 100, 'run inventory incomplete')
  const run = inventory.workflow_runs.filter(r => r.event === 'pull_request_target' && r.workflow_id === workflow.id && r.head_sha === base && r.repository?.full_name === repository && r.pull_requests?.some(p => p.number === event.number && p.head?.sha === head && p.base?.sha === base)).sort((a, b) => b.id - a.id)[0]
  requireFact(run?.status === 'completed' && run.conclusion === 'success' && Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt), 'exact-head trusted readiness is not complete')
  const jobs = await api(`/repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`)
  requireFact(jobs?.total_count === 1 && jobs.jobs?.length === 1 && jobs.jobs[0].status === 'completed' && jobs.jobs[0].conclusion === 'success' && jobs.jobs[0].head_sha === base && jobs.jobs[0].steps?.filter(s => s.name === 'Evaluate migration PR readiness' && s.conclusion === 'success').length === 1, 'trusted evaluator did not complete')
  const checkId = /\/check-runs\/(\d+)$/.exec(jobs.jobs[0].check_run_url ?? '')?.[1]
  requireFact(checkId, 'trusted job check identity missing')
  const check = await api(`/repos/${repository}/check-runs/${checkId}`)
  requireFact(check?.app?.id === 15368 && check.app.slug === 'github-actions' && check.head_sha === base && check.conclusion === 'success', 'untrusted check publisher')
  const [finalPr, finalMain] = await Promise.all([readPr(), readMain()])
  requireFact(finalPr.state === 'open' && !finalPr.draft && finalPr.head.sha === head && finalPr.base.sha === base && finalMain.commit.sha === base, 'branch moved during readiness read')
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Migration PR readiness proof missing, stale, failed or unavailable; refusing.'); process.exitCode = 1 })
