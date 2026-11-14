// Actions can attach publisher-created check metadata to the staging suite.
// Only authenticated, non-executing readiness metadata may be excluded.
const REPO = 'hellofrequencylab/frequency-web'
const requireFact = (value, message) => { if (!value) throw Object.assign(Error(message), { safe: true }) }
const positive = value => Number.isSafeInteger(value) && value > 0
const successful = value => value?.status === 'completed' && value.conclusion === 'success'
const publisher = value => value?.app?.id === 15368 && value.app.slug === 'github-actions'
export async function stagingJobInventory({ inventory, run, pr, base, head, api }) {
  requireFact(Array.isArray(inventory?.jobs) && positive(inventory.total_count) && inventory.total_count <= 100 && inventory.total_count === inventory.jobs.length, 'incomplete staging job inventory')
  const real = [], ids = new Set()
  let workflow
  for (const job of inventory.jobs) {
    requireFact(positive(job.id) && !ids.has(job.id) && job.run_id === run.id && job.run_attempt === run.run_attempt && job.head_sha === head && Array.isArray(job.steps), 'foreign staging job identity')
    ids.add(job.id)
    requireFact(job.check_run_url === `https://api.github.com/repos/${REPO}/check-runs/${job.id}`, 'foreign staging publisher URL')
    const check = await api(`/repos/${REPO}/check-runs/${job.id}`)
    requireFact(check?.id === job.id && check.name === job.name && check.head_sha === head && publisher(check), 'untrusted staging check publisher')
    if (job.name === 'db-tests') {
      requireFact(positive(job.runner_id) && successful(job) && successful(check) && job.steps.length > 0, 'staging execution did not succeed')
      real.push(job)
      continue
    }
    requireFact(job.name === 'migration-readiness' && job.runner_id === null && job.steps.length === 0, 'unexpected staging execution')
    const identity = /^migration-readiness:([1-9]\d*):([1-9]\d*):([1-9]\d*):([a-f0-9]{40}):([a-f0-9]{40})$/.exec(check.external_id ?? '')
    requireFact(identity && Number(identity[3]) === pr && identity[4] === base && identity[5] === head && positive(Number(identity[1])) && positive(Number(identity[2])), 'foreign readiness metadata binding')
    const [, runId, attempt] = identity
    requireFact(check.details_url === `https://github.com/${REPO}/runs/${job.id}` || check.details_url === `https://github.com/${REPO}/actions/runs/${runId}`, 'foreign readiness metadata details')
    workflow ??= await api(`/repos/${REPO}/actions/workflows/migration-readiness.yml`)
    requireFact(positive(workflow?.id) && workflow.path === '.github/workflows/migration-readiness.yml', 'unknown readiness metadata workflow')
    const trustedRun = await api(`/repos/${REPO}/actions/runs/${runId}/attempts/${attempt}`)
    requireFact(trustedRun?.id === Number(runId) && trustedRun.run_attempt === Number(attempt) && trustedRun.workflow_id === workflow.id && trustedRun.path === workflow.path && trustedRun.event === 'pull_request_target' && trustedRun.head_sha === head && trustedRun.repository?.full_name === REPO && trustedRun.head_repository?.full_name === REPO, 'untrusted readiness metadata run')
    // No result requirement: this may be the current publisher's own failed/running check.
  }
  requireFact(real.length === 1, 'exactly one real staging execution required')
  return { jobs: real, steps: real[0].steps }
}
