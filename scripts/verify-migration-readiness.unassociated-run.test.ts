import { expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { verifyReadiness } from './verify-migration-readiness.mjs'

type Job = { id: number; run_id: number; run_attempt: number; head_sha: string; name: string; runner_id: number | null; status: string; conclusion: string; check_run_url: string; steps: Array<{ name: string; status: string; conclusion: string }> }
type Receipt = { version: number; pr: number; head: string; base: string; trustedRunId: string; trustedRunAttempt: string; sources: Record<string, string>; verdict: string; registrationSha256?: string; workflowSha256?: string; stagingRunId?: number; stagingAttempt?: number }

// Public metadata shape observed on actual successful target run43638345158:
// empty PR association, one real runner job, separately published receipt check.
// Source bytes below are the current fixture checkout; SQL staging facts are synthetic.
function fixture() {
  const repository = 'hellofrequencylab/frequency-web'
  const head = '381d4aa76d2ce00e88be1b51330bfaea7256345d'
  const base = 'bce47c132c879ccc31e29a32bd0ad67ff8c2d7ec'
  const pr = { state: 'open', draft: false, head: { sha: head, repo: { full_name: repository } }, base: { ref: 'main', sha: base, repo: { full_name: repository } } }
  const main = { commit: { sha: base } }
  const run = { id: 43638345158, run_attempt: 1, workflow_id: 398404199, head_sha: head, event: 'pull_request_target', repository: { full_name: repository }, status: 'completed', conclusion: 'success', pull_requests: [] as Array<{ number: number; head: { sha: string }; base: { sha: string } }> }
  const job: Job = { id: 132580028951, run_id: run.id, run_attempt: 1, head_sha: head, name: 'migration-readiness-runner', runner_id: 1000081901, status: 'completed', conclusion: 'success', check_run_url: 'https://api.github.com/repos/hellofrequencylab/frequency-web/check-runs/132580028951', steps: [{ name: 'Evaluate migration PR readiness', status: 'completed', conclusion: 'success' }] }
  const evaluator = { id: job.id, name: job.name, app: { id: 15368, slug: 'github-actions' }, head_sha: head, status: 'completed', conclusion: 'success' }
  const sourceFiles = ['scripts/migration-pr-readiness.mjs', 'scripts/publish-migration-readiness.mjs', '.github/workflows/migration-readiness.yml', 'scripts/migration-readiness-policy.json']
  const sources = Object.fromEntries(sourceFiles.map(file => [file, readFileSync(file)]))
  const receipt: Receipt = { version: 1, pr: 4977, head, base, trustedRunId: String(run.id), trustedRunAttempt: '1', sources: Object.fromEntries(Object.entries(sources).map(([file, bytes]) => [file, createHash('sha256').update(bytes).digest('hex')])), verdict: 'not_applicable' }
  const published = { id: 132580134012, name: 'migration-readiness', head_sha: head, status: 'completed', conclusion: 'success', external_id: `migration-readiness:${run.id}:1:4977:${base}:${head}`, app: { id: 15368, slug: 'github-actions' }, output: { summary: '' } }
  const seal = () => { published.output.summary = `Production application is not performed or claimed.\n\n${JSON.stringify(receipt)}` }
  seal()
  const jobs = { total_count: 1, jobs: [job] }
  const checkInventory = { total_count: 1, check_runs: [published] }
  const paths: string[] = []
  const options = {
    env: { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: repository },
    event: { number: 4977, pull_request: { head: { sha: head } } },
    git: (args: string[]) => args[0] === 'show' ? sources[args[1].slice(base.length + 1)] : `parent ${main.commit.sha}\nparent ${head}\n`,
    api: async (path: string) => {
      paths.push(path)
      if (path.endsWith('/pulls/4977')) return pr
      if (path.endsWith('/branches/main')) return main
      if (path.endsWith('/actions/workflows/migration-readiness.yml')) return { id: run.workflow_id, path: '.github/workflows/migration-readiness.yml' }
      if (path.includes('/actions/workflows/') && path.includes('/runs?')) return { total_count: 1, workflow_runs: [run] }
      if (path.includes('/attempts/1/jobs?')) return jobs
      if (path.includes(`/commits/${head}/check-runs?`)) return checkInventory
      if (path.endsWith(`/check-runs/${job.id}`)) return evaluator
      if (path.endsWith(`/check-runs/${published.id}`)) return published
      throw Error('Unexpected metadata read: ' + path)
    },
  }
  const sql = () => { Object.assign(receipt, { verdict: 'registered_pending_apply', registrationSha256: 'c'.repeat(64), workflowSha256: 'd'.repeat(64), stagingRunId: 43638345159, stagingAttempt: 1 }); seal() }
  const twoJobs = () => { jobs.jobs.push({ ...job, id: published.id, name: 'migration-readiness', runner_id: null, steps: [], check_run_url: `https://api.github.com/repos/hellofrequencylab/frequency-web/check-runs/${published.id}` }); jobs.total_count = 2 }
  return { options, pr, main, run, job, evaluator, receipt, published, jobs, checkInventory, paths, seal, sql, twoJobs, head, base }
}

test('accepts the real empty-association one-runner shape only with the bound publisher receipt', async () => {
  const f = fixture()
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true, runId: f.run.id, head: f.head, base: f.base })
  expect(f.paths.some(path => path.includes(`/commits/${f.head}/check-runs?`))).toBe(true)
})
test('accepts an empty-association SQL receipt bound to current main and exact staging identity', async () => {
  const f = fixture(); f.sql()
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true, head: f.head, base: f.base })
})
test('retains strict synthetic-job authentication for the empty-association two-job shape', async () => {
  const f = fixture(); f.sql(); f.twoJobs()
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true })
})
test('allows only a no-SQL receipt to retain its older base while main moves', async () => {
  const f = fixture(); f.main.commit.sha = 'c'.repeat(40)
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true, base: f.base })
})

const negatives: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
  ['missing publisher receipt', f => { f.checkInventory.check_runs = []; f.checkInventory.total_count = 0 }],
  ['truncated publisher inventory', f => { f.checkInventory.total_count++ }],
  ['malformed association', f => { Reflect.deleteProperty(f.run, 'pull_requests') }],
  ['wrong PR association', f => { f.run.pull_requests.push({ number: 1, head: { sha: f.head }, base: { sha: f.base } }) }],
  ['stale association base', f => { f.run.pull_requests.push({ number: 4977, head: { sha: f.head }, base: { sha: 'c'.repeat(40) } }) }],
  ['failed trusted run', f => { f.run.conclusion = 'failure' }],
  ['wrong evaluator name', f => { f.job.name = 'other' }],
  ['wrong evaluator run', f => { f.job.run_id++ }],
  ['wrong evaluator attempt', f => { f.job.run_attempt++ }],
  ['synthetic evaluator runner', f => { f.job.runner_id = null }],
  ['wrong evaluator check publisher', f => { f.evaluator.app.id = 1 }],
  ['unfinished evaluator check', f => { f.evaluator.status = 'in_progress' }],
  ['wrong publisher app', f => { f.published.app.id = 1 }],
  ['wrong publisher head', f => { f.published.head_sha = f.base }],
  ['wrong publisher run binding', f => { f.published.external_id += ':other' }],
  ['pending publisher', f => { f.published.status = 'in_progress'; f.published.conclusion = '' }],
  ['failed publisher', f => { f.published.conclusion = 'failure' }],
  ['stale receipt PR', f => { f.receipt.pr++; f.seal() }],
  ['stale receipt base', f => { f.receipt.base = f.head; f.seal() }],
  ['stale receipt run', f => { f.receipt.trustedRunId = '1'; f.seal() }],
  ['stale receipt attempt', f => { f.receipt.trustedRunAttempt = '2'; f.seal() }],
  ['malformed source binding', f => { f.receipt.sources['scripts/migration-pr-readiness.mjs'] = 'invalid'; f.seal() }],
  ['missing source binding', f => { delete f.receipt.sources['scripts/migration-pr-readiness.mjs']; f.seal() }],
  ['malformed receipt', f => { f.published.output.summary = 'no receipt' }],
  ['unfinished evaluator job', f => { f.job.status = 'in_progress' }],
]
for (const [name, mutate] of negatives) test(`refuses empty-association proof with ${name}`, async () => {
  const f = fixture(); mutate(f)
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
for (const [name, mutate] of [
  ['missing staging proof', (f: ReturnType<typeof fixture>) => { delete f.receipt.stagingRunId; f.seal() }],
  ['changed current-main source', (f: ReturnType<typeof fixture>) => { f.receipt.sources['scripts/migration-pr-readiness.mjs'] = 'a'.repeat(64); f.seal() }],
  ['moving main', (f: ReturnType<typeof fixture>) => { f.main.commit.sha = 'c'.repeat(40) }],
] as const) test(`refuses an empty-association SQL proof with ${name}`, async () => {
  const f = fixture(); f.sql(); mutate(f)
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
test('does not hide a newer pending matching publisher behind an older green publisher', async () => {
  const f = fixture(); const older = structuredClone(f.published); older.id--
  f.published.status = 'in_progress'; f.published.conclusion = ''
  f.checkInventory.check_runs.unshift(older); f.checkInventory.total_count++
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
test('still rejects a forged synthetic job in the empty-association two-job shape', async () => {
  const f = fixture(); f.twoJobs(); f.jobs.jobs[1].runner_id = 1
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
