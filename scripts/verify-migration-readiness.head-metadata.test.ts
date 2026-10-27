import { expect, test } from 'vitest'
import { verifyReadiness } from './verify-migration-readiness.mjs'

// Actions live run40530545572 associates run/job/check metadata with candidate04b14b,
// while pull_requests.base and the isolated checkout identify trusted mainba2608.
function fixture() {
  const repository = 'hellofrequencylab/frequency-web'
  const head = 'a'.repeat(40), base = 'b'.repeat(40)
  const pr = { state: 'open', draft: false, head: { sha: head, repo: { full_name: repository } }, base: { ref: 'main', sha: base, repo: { full_name: repository } } }
  const run = { id: 200, run_attempt: 1, workflow_id: 55, head_sha: head, event: 'pull_request_target', repository: { full_name: repository }, status: 'completed', conclusion: 'success', pull_requests: [{ number: 44, head: { sha: head }, base: { sha: base } }] }
  const job = { head_sha: head, status: 'completed', conclusion: 'success', check_run_url: 'https://api.github.com/repos/test/check-runs/600', steps: [{ name: 'Evaluate migration PR readiness', conclusion: 'success' }] }
  const check = { app: { id: 15368, slug: 'github-actions' }, head_sha: head, conclusion: 'success' }
  const paths: string[] = []
  const options = {
    env: { GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: repository },
    event: { number: 44, pull_request: { head: { sha: head } } },
    git: () => `parent ${base}\nparent ${head}\n`,
    api: async (path: string) => {
      paths.push(path)
      if (path.endsWith('/pulls/44')) return pr
      if (path.endsWith('/branches/main')) return { commit: { sha: base } }
      if (path.endsWith('/actions/workflows/migration-readiness.yml')) return { id: 55, path: '.github/workflows/migration-readiness.yml' }
      if (path.includes('/actions/workflows/55/runs?')) return { total_count: 1, workflow_runs: [run] }
      if (path.includes('/actions/runs/200/attempts/1/jobs?')) return { total_count: 1, jobs: [job] }
      if (path.endsWith('/check-runs/600')) return check
      throw Error('Unexpected metadata request')
    },
  }
  return { options, paths, pr, run, job, check, head, base }
}

test('uses observed Actions candidate metadata without losing trusted base association', async () => {
  const f = fixture()
  await expect(verifyReadiness(f.options)).resolves.toMatchObject({ ok: true, head: f.head, base: f.base })
  expect(f.paths.some(path => path.includes(`head_sha=${f.head}`))).toBe(true)
  expect(f.paths.some(path => path.includes(`head_sha=${f.base}`))).toBe(false)
})

for (const target of ['run', 'job', 'check'] as const) {
  test(`refuses base SHA masquerading as candidate ${target} metadata`, async () => {
    const f = fixture()
    f[target].head_sha = f.base
    await expect(verifyReadiness(f.options)).rejects.toThrow()
  })
}
test('refuses correct candidate metadata associated with stale trusted base', async () => {
  const f = fixture()
  f.run.pull_requests[0].base.sha = 'c'.repeat(40)
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
test('refuses correct candidate metadata when CI tree used stale main', async () => {
  const f = fixture()
  f.options.git = () => `parent ${'c'.repeat(40)}\nparent ${f.head}\n`
  await expect(verifyReadiness(f.options)).rejects.toThrow()
})
