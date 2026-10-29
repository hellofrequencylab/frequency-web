import { expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { verifyReadiness } from './verify-migration-readiness.mjs'

// Public, bounded metadata shape captured from real run40537880292 attempt2.
const observed = {"run":{"id":40537880292,"run_attempt":2,"workflow_id":398404199,"head_sha":"4460d98124c070da4df1e052e261db79e99bc7dd","event":"pull_request_target","repository":{"full_name":"hellofrequencylab/frequency-web"},"status":"completed","conclusion":"success","pull_requests":[{"url":"https://api.github.com/repos/hellofrequencylab/frequency-web/pulls/4137","id":5034207065,"number":4137,"head":{"ref":"release/room-foundation-reviewed","sha":"4460d98124c070da4df1e052e261db79e99bc7dd","repo":{"id":1249725957,"url":"https://api.github.com/repos/hellofrequencylab/frequency-web","name":"frequency-web"}},"base":{"ref":"main","sha":"a8453827d8b6c5e6c29ceb3b2ace5a1734a49a3e","repo":{"id":1249725957,"url":"https://api.github.com/repos/hellofrequencylab/frequency-web","name":"frequency-web"}}}]},"jobs":{"total_count":2,"jobs":[{"id":122312513819,"run_id":40537880292,"run_attempt":2,"head_sha":"4460d98124c070da4df1e052e261db79e99bc7dd","name":"migration-readiness-runner","steps":[{"name":"Set up job","status":"completed","conclusion":"success","number":1,"started_at":"2026-10-27T16:15:48Z","completed_at":"2026-10-27T16:15:49Z"},{"name":"Run actions/checkout@v7","status":"completed","conclusion":"success","number":2,"started_at":"2026-10-27T16:15:49Z","completed_at":"2026-10-27T16:16:06Z"},{"name":"Run actions/setup-node@v7","status":"completed","conclusion":"success","number":3,"started_at":"2026-10-27T16:16:06Z","completed_at":"2026-10-27T16:16:07Z"},{"name":"Evaluate migration PR readiness","status":"completed","conclusion":"success","number":4,"started_at":"2026-10-27T16:16:07Z","completed_at":"2026-10-27T16:16:20Z"},{"name":"Post Run actions/setup-node@v7","status":"completed","conclusion":"success","number":7,"started_at":"2026-10-27T16:16:20Z","completed_at":"2026-10-27T16:16:20Z"},{"name":"Post Run actions/checkout@v7","status":"completed","conclusion":"success","number":8,"started_at":"2026-10-27T16:16:20Z","completed_at":"2026-10-27T16:16:20Z"},{"name":"Complete job","status":"completed","conclusion":"success","number":9,"started_at":"2026-10-27T16:16:20Z","completed_at":"2026-10-27T16:16:20Z"}],"runner_id":1000060481,"status":"completed","conclusion":"success","check_run_url":"https://api.github.com/repos/hellofrequencylab/frequency-web/check-runs/122312513819"},{"id":122312752936,"run_id":40537880292,"run_attempt":2,"head_sha":"4460d98124c070da4df1e052e261db79e99bc7dd","name":"migration-readiness","steps":[],"runner_id":null,"status":"completed","conclusion":"success","check_run_url":"https://api.github.com/repos/hellofrequencylab/frequency-web/check-runs/122312752936"}]},"published":{"id":122312752936,"name":"migration-readiness","head_sha":"4460d98124c070da4df1e052e261db79e99bc7dd","status":"completed","conclusion":"success","external_id":"migration-readiness:40537880292:2:4137:a8453827d8b6c5e6c29ceb3b2ace5a1734a49a3e:4460d98124c070da4df1e052e261db79e99bc7dd","output":{"title":"Trusted migration PR readiness passed","summary":"Production application is not performed or claimed.\n\n{\"version\":1,\"pr\":4137,\"head\":\"4460d98124c070da4df1e052e261db79e99bc7dd\",\"base\":\"a8453827d8b6c5e6c29ceb3b2ace5a1734a49a3e\",\"trustedRunId\":\"40537880292\",\"trustedRunAttempt\":\"2\",\"sources\":{\"scripts/migration-pr-readiness.mjs\":\"afcfc2fcc354bf8ebd47074b2753de4cf56bdd7efa9a091f1f750b490f53aaeb\",\"scripts/publish-migration-readiness.mjs\":\"5e503b1a50f6889004f07d51abe0594bd662d4767535f89d81f85ce277f504e7\",\".github/workflows/migration-readiness.yml\":\"68b12ae1d277f44c5b8b1bc8ba6cb1f6653822b139c47b64e451f30109e13278\",\"scripts/migration-readiness-policy.json\":\"3c177ab4fe068547d74aa9b228a028a7be0b69c5b1d0c38190c57b009100eb7f\"},\"verdict\":\"registered_pending_apply\",\"registrationSha256\":\"63982bfd4002bd7c8ef17ce5b1f36c71f3ff4efabb2b81bed6ae83a25c34c7db\",\"stagingRunId\":40537903033,\"stagingAttempt\":1,\"workflowSha256\":\"787ba24583782fd22e2172ba08f6172966d4dc896662faafe233bb113b1b31b5\"}","text":null,"annotations_count":0,"annotations_url":"https://api.github.com/repos/hellofrequencylab/frequency-web/check-runs/122312752936/annotations"},"app":{"id":15368,"slug":"github-actions"}}}
function fixture() {
  const data = structuredClone(observed)
  const repository = 'hellofrequencylab/frequency-web'
  const head = data.run.head_sha, base = data.run.pull_requests[0].base.sha
  const pr = { state: 'open', draft: false, head: { sha: head, repo: { full_name: repository } }, base: { ref: 'main', sha: base, repo: { full_name: repository } } }
  const receipt = JSON.parse(data.published.output.summary.split('\n\n')[1])
  const sources = Object.fromEntries(Object.keys(receipt.sources).map(file => [file, readFileSync(file)]))
  receipt.sources = Object.fromEntries(Object.entries(sources).map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')]))
  const seal = () => { data.published.output.summary = `Production application is not performed or claimed.\n\n${JSON.stringify(receipt)}` }
  seal()
  const check = { app: { id: 15368, slug: 'github-actions' }, head_sha: head, conclusion: 'success' }
  const options = {
    env: { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: repository },
    event: { number: 4137, pull_request: { head: { sha: head } } },
    git: (args: string[]) => args[0] === 'show' ? sources[args[1].slice(base.length + 1)] : `parent ${base}\nparent ${head}\n`,
    api: async (path: string) => {
      if (path.endsWith('/pulls/4137')) return pr
      if (path.endsWith('/branches/main')) return { commit: { sha: base } }
      if (path.endsWith('/actions/workflows/migration-readiness.yml')) return { id: data.run.workflow_id, path: '.github/workflows/migration-readiness.yml' }
      if (path.includes('/runs?')) return { total_count: 1, workflow_runs: [data.run] }
      if (path.includes('/attempts/2/jobs?')) return data.jobs
      if (path.endsWith('/check-runs/122312513819')) return check
      if (path.endsWith('/check-runs/122312752936')) return data.published
      throw Error('Unexpected metadata read')
    },
  }
  return { data, receipt, seal, options, base, head }
}
test('accepts actual two-job shape only after authenticating publisher receipt and current-main sources', async () => {
  const f = fixture()
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true, runId: 40537880292 })
})
const negatives: [string, (f: ReturnType<typeof fixture>) => void][] = [
  ['unknown extra job', f => { f.data.jobs.jobs.push(structuredClone(f.data.jobs.jobs[1])); f.data.jobs.total_count++ }],
  ['truncated inventory', f => { f.data.jobs.total_count++ }],
  ['duplicate real evaluator', f => { f.data.jobs.jobs[1] = structuredClone(f.data.jobs.jobs[0]) }],
  ['wrong real runner name', f => { f.data.jobs.jobs[0].name = 'other' }],
  ['wrong real runner attempt', f => { f.data.jobs.jobs[0].run_attempt++ }],
  ['forged synthetic name', f => { f.data.jobs.jobs[1].name = 'other' }],
  ['synthetic executable steps', f => { f.data.jobs.jobs[1].steps = [{ name: 'unexpected', conclusion: 'success', status: 'completed', number: 1, started_at: '', completed_at: '' }] }],
  ['synthetic real runner', f => { f.data.jobs.jobs[1].runner_id = 12 }],
  ['stale synthetic head', f => { f.data.jobs.jobs[1].head_sha = f.base }],
  ['synthetic different run', f => { f.data.jobs.jobs[1].run_id++ }],
  ['synthetic reused check', f => { f.data.jobs.jobs[1].check_run_url = f.data.jobs.jobs[0].check_run_url }],
  ['forged publisher app', f => { f.data.published.app.id = 1 }],
  ['publisher external binding', f => { f.data.published.external_id += ':other' }],
  ['publisher stale head', f => { f.data.published.head_sha = f.base }],
  ['publisher failure', f => { f.data.published.conclusion = 'failure' }],
  ['malformed receipt', f => { f.data.published.output.summary = 'not JSON' }],
  ['stale receipt base', f => { f.receipt.base = f.head; f.seal() }],
  ['stale receipt attempt', f => { f.receipt.trustedRunAttempt = '1'; f.seal() }],
  ['forged source hash', f => { f.receipt.sources['scripts/migration-pr-readiness.mjs'] = 'a'.repeat(64); f.seal() }],
  ['missing staging proof', f => { delete f.receipt.stagingRunId; f.seal() }],
]
for (const [name, mutate] of negatives) test(`refuses ${name}`, async () => {
  const f = fixture(); mutate(f)
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})

// A PR whose SQL-free receipt was minted at its own base stays valid while main moves on; SQL receipts do not.
const ahead = 'c'.repeat(40)
function moveMain(f: ReturnType<typeof fixture>) {
  const api = f.options.api
  f.options.api = async (path: string) => path.endsWith('/branches/main') ? { commit: { sha: ahead } } : api(path)
  const git = f.options.git
  f.options.git = (args: string[]) => args[0] === 'show' ? git(args) : `parent ${ahead}\nparent ${f.head}\n`
}
function noSql(f: ReturnType<typeof fixture>) {
  f.receipt.verdict = 'not_applicable'
  for (const key of ['registrationSha256', 'stagingRunId', 'stagingAttempt', 'workflowSha256']) delete (f.receipt as Record<string, unknown>)[key]
  f.seal()
}
test('accepts a no-SQL receipt although main moved past the PR base', async () => {
  const f = fixture(); noSql(f); moveMain(f)
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true, base: f.base })
})
test('refuses the same moved-main state for a SQL receipt', async () => {
  const f = fixture(); moveMain(f)
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
for (const [name, mutate] of [
  ['merge tree without the exact head', (f: ReturnType<typeof fixture>) => { f.options.git = (args: string[]) => args[0] === 'show' ? Buffer.alloc(0) : `parent ${ahead}\nparent ${ahead}\n` }],
  ['forged source digest', (f: ReturnType<typeof fixture>) => { f.receipt.sources['scripts/migration-pr-readiness.mjs'] = 'not-a-digest'; f.seal() }],
  ['receipt for another base', (f: ReturnType<typeof fixture>) => { f.receipt.base = ahead; f.seal() }],
] as const) test(`still refuses a no-SQL receipt with ${name}`, async () => {
  const f = fixture(); noSql(f); moveMain(f); mutate(f)
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
