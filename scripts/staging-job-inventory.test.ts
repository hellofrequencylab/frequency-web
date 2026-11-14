import { it, expect } from 'vitest'
import { stagingJobInventory } from './lib/staging-job-inventory.mjs'
const repo = 'hellofrequencylab/frequency-web', head = 'a'.repeat(40), base = 'b'.repeat(40)
function fixture() {
  const run = { id: 43642752486, run_attempt: 1 }
  const common = { run_id: run.id, run_attempt: 1, head_sha: head }
  const job = (id: number, name: string, runner_id: number | null, steps: { name: string; conclusion: string }[]) => ({ ...common, id, name, runner_id, steps, status: 'completed', conclusion: runner_id ? 'success' : 'failure', check_run_url: `https://api.github.com/repos/${repo}/check-runs/${id}` })
  const jobs = [job(132593713117, 'db-tests', 1000082047, [{ name: 'actual API acceptance', conclusion: 'success' }]), job(132593802844, 'migration-readiness', null, []), job(132599075686, 'migration-readiness', null, [])]
  const checks = jobs.map((value, index) => ({ ...value, app: { id: 15368, slug: 'github-actions' }, external_id: `migration-readiness:${index === 1 ? 43642755127 : 43644453727}:1:4930:${base}:${head}`, details_url: `https://github.com/${repo}/runs/${value.id}` }))
  const publisher = { id: 43644453727, run_attempt: 1, workflow_id: 398404199, path: '.github/workflows/migration-readiness.yml', event: 'pull_request_target', head_sha: head, repository: { full_name: repo }, head_repository: { full_name: repo } }
  const options = { inventory: { total_count: 3, jobs }, run, pr: 4930, base, head, api: async (path: string) => {
    if (path.endsWith('/actions/workflows/migration-readiness.yml')) return { id: publisher.workflow_id, path: publisher.path }
    if (path.includes('/check-runs/')) return checks.find(value => path.endsWith(`/check-runs/${value.id}`))
    return { ...publisher, id: path.includes('43642755127') ? 43642755127 : publisher.id }
  } }
  return { options, jobs, checks, publisher }
}
it('accepts the actual three-job API shape while only the real runner supplies steps', async () => {
  const f = fixture(), result = await stagingJobInventory(f.options)
  expect(result.jobs.map((job: { id: number }) => job.id)).toEqual([132593713117])
  expect(result.steps).toEqual(f.jobs[0].steps)
})
for (const [name, mutate] of Object.entries({
  'metadata external head': (f: ReturnType<typeof fixture>) => { f.checks[1].external_id = f.checks[1].external_id.replace(head, 'd'.repeat(40)) },
  'metadata external attempt': (f: ReturnType<typeof fixture>) => { f.checks[1].external_id = f.checks[1].external_id.replace(':1:4930:', ':2:4930:') },
  'trusted head': (f: ReturnType<typeof fixture>) => { f.publisher.head_sha = 'd'.repeat(40) },
  'trusted attempt': (f: ReturnType<typeof fixture>) => { f.publisher.run_attempt = 2 },
  'trusted path': (f: ReturnType<typeof fixture>) => { f.publisher.path = '.github/workflows/other.yml' },
  'host run': (f: ReturnType<typeof fixture>) => { f.jobs[1].run_id = 11 },
  'host attempt': (f: ReturnType<typeof fixture>) => { f.jobs[1].run_attempt = 2 },
  'duplicate id': (f: ReturnType<typeof fixture>) => { f.jobs[1].id = f.jobs[0].id },
  'incomplete inventory': (f: ReturnType<typeof fixture>) => { f.options.inventory.total_count = 4 },
  'failed real check': (f: ReturnType<typeof fixture>) => { f.checks[0].conclusion = 'failure' },
  'publisher app': (f: ReturnType<typeof fixture>) => { f.checks[1].app.id = 1 },
  'foreign PR': (f: ReturnType<typeof fixture>) => { f.checks[1].external_id = f.checks[1].external_id.replace(':4930:', ':4931:') },
  'foreign base': (f: ReturnType<typeof fixture>) => { f.checks[1].external_id = f.checks[1].external_id.replace(base, 'c'.repeat(40)) },
  'metadata runner': (f: ReturnType<typeof fixture>) => { f.jobs[1].runner_id = 8 },
  'metadata steps': (f: ReturnType<typeof fixture>) => { f.jobs[1].steps.push({ name: 'hidden execution', conclusion: 'success' }) },
  'metadata name': (f: ReturnType<typeof fixture>) => { f.jobs[1].name = 'other-job'; f.checks[1].name = 'other-job' },
  'failed real runner': (f: ReturnType<typeof fixture>) => { f.jobs[0].conclusion = 'failure' },
  'foreign trusted workflow': (f: ReturnType<typeof fixture>) => { f.publisher.event = 'push' },
  'foreign repository': (f: ReturnType<typeof fixture>) => { f.publisher.head_repository.full_name = 'attacker/repo' },
  'foreign details': (f: ReturnType<typeof fixture>) => { f.checks[1].details_url = 'https://example.com/' },
  'missing execution steps': (f: ReturnType<typeof fixture>) => { f.jobs[0].steps = [] },
})) it(`refuses ${name}`, async () => { const f = fixture(); mutate(f); await expect(stagingJobInventory(f.options)).rejects.toThrow() })
