import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { collectReadiness } from './migration-pr-readiness.mjs'

const hash = text => createHash('sha256').update(text).digest('hex')
const repository = 'hellofrequencylab/frequency-web', base = 'a'.repeat(40), head = 'b'.repeat(40)
const core = ['Start local Supabase (applies all migrations)', 'Run pgTAP RLS/RPC tests', 'Refuse an unstated permanent skip in the TAP output', 'Always destroy dispatched staging containers and volumes']
const apiStep = 'Real local service, anon and authenticated room API acceptance'
function fixture() {
  const source = 'trusted collector', sql = 'create table public.fixture(id int);', workflow = 'reviewed full staging workflow'
  const added = 'supabase/migrations/20261027033306_atomic_manual_room_writes.sql'
  const names = Array.from({ length: 400 }, (_, i) => `supabase/migrations/${20240101000000 + i}_old_${i}.sql`)
  const registration = { pullRequest: 44, expiresAt: '2030-01-01T00:00:00Z', migrations: [{ file: added, sha256: hash(sql) }], reviewedChanges: [{ file: added, status: 'added', sha256: hash(sql), baseMode: '000000', headMode: '100644' }], workflowPath: '.github/workflows/db-tests.yml', workflowSha256: hash(workflow), requiredSteps: [...core, apiStep], apiAcceptanceStep: apiStep }
  const pr = { state: 'open', draft: false, base: { ref: 'main', sha: base, repo: { full_name: repository } }, head: { sha: head, repo: { full_name: repository } } }
  const run = { id: 100, run_attempt: 1, repository: { full_name: repository }, head_sha: head, event: 'workflow_dispatch', workflow_id: 22, status: 'completed', conclusion: 'success' }
  const job = { head_sha: head, status: 'completed', conclusion: 'success', check_run_url: 'https://api.github.com/repos/test/check-runs/300', steps: [...core, apiStep].map(name => ({ name, conclusion: 'success' })) }
  const live = names.map(file => { const m = /\/(\d+)_(.*)\.sql$/.exec(file); return { version: m[1], name: m[2] } })
  const calls = [], blobs = new Map()
  for (const rev of [base, head]) for (const file of names) blobs.set(`${rev}:${file}`, 'unchanged SQL')
  blobs.set(`${head}:${added}`, sql)
  blobs.set(`${head}:.github/workflows/db-tests.yml`, workflow)
  blobs.set(`${base}:scripts/migration-pr-readiness.mjs`, source)
  const f = { registration, pr, run, job, live, calls, blobs, names, added, source, mainReads: 0, moveOnFinalRead: false, alteredCollector: false }
  f.options = {
    env: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_SHA: base, GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/migration-readiness.yml@refs/heads/main`, GITHUB_REPOSITORY: repository }, event: { number: 44, pull_request: { head: { sha: head } } }, collectorSha256: hash(source), now: Date.parse('2026-10-27T00:00:00Z'),
    git(args, binary, input) {
      calls.push(['git', ...args])
      if (args[0] === 'fetch') return ''
      if (args[0] === 'cat-file' && args[1] === '--batch') return Buffer.concat(input.trimEnd().split('\n').map(key => { const body = Buffer.from(blobs.get(key)); return Buffer.concat([Buffer.from(`${'d'.repeat(40)} blob ${body.length}\n`), body, Buffer.from('\n')]) }))
      if (args[0] === 'rev-parse') return base
      if (args[0] === 'ls-tree' && args.includes('-z')) {
        const revision = args[3], requested = args.slice(args.indexOf('--') + 1)
        const entries = [...names, ...(revision === head ? [added] : [])].filter(file => requested.some(path => file === path || file.startsWith(path)))
        return entries.map(file => `${f.sqlMode ?? '100644'} blob ${'d'.repeat(40)}\t${file}\0`).join('')
      }
      if (args[0] === 'ls-tree') return [...names, ...(args[3] === head ? [added] : [])].join('\n')
      if (args[0] === 'diff') return `A\0${added}\0`
      if (args[0] === 'show') {
        if (args[1] === `${base}:scripts/migration-readiness-policy.json`) return JSON.stringify({ version: 1, registrations: [registration] })
        assert.ok(blobs.has(args[1]), `unexpected blob ${args[1]}`)
        return Buffer.from(blobs.get(args[1]))
      }
      throw Error('unexpected Git operation')
    },
    async ledger() { calls.push(['ledger']); return live },
    async api(path) {
      calls.push(['api', path])
      if (path.endsWith('/pulls/44')) return structuredClone(pr)
      if (path.endsWith('/branches/main')) { f.mainReads++; return { commit: { sha: f.moveOnFinalRead && f.mainReads > 1 ? 'c'.repeat(40) : base } } }
      if (path.endsWith('/actions/workflows/db-tests.yml')) return { id: 22, path: '.github/workflows/db-tests.yml' }
      if (path.includes('/actions/workflows/22/runs?')) return { total_count: 1, workflow_runs: [run] }
      if (path.includes('/actions/runs/100/attempts/1/jobs?')) return { total_count: 1, jobs: [job] }
      if (path.endsWith('/check-runs/300')) return { app: { slug: 'github-actions', id: 15368 }, head_sha: head, status: 'completed', conclusion: 'success' }
      throw Error('unexpected API operation')
    },
  }
  return f
}
test('collector independently binds current main policy, Git SQL bytes, live set and actual Actions job proof', async () => {
  const f = fixture(), result = await collectReadiness(f.options)
  assert.equal(result.status, 'registered_pending_apply')
  assert.deepEqual(result.pending, ['20261027033306'])
  assert.equal(f.mainReads, 2)
  assert.ok(f.calls.some(c => c[0] === 'ledger'))
  assert.ok(f.calls.some(c => c[1]?.includes('/check-runs/300')))
  assert.ok(!f.calls.some(c => c[0] === 'git' && ['checkout', 'merge', 'reset'].includes(c[1])))
})
for (const [name, mutate] of [
  ['fork PR', f => { f.pr.head.repo.full_name = 'outsider/fork' }],
  ['stale event head', f => { f.options.event.pull_request.head.sha = 'c'.repeat(40) }],
  ['moving base after IO', f => { f.moveOnFinalRead = true }],
  ['candidate-edited collector', f => { f.options.collectorSha256 = hash('untrusted') }],
  ['unregistered PR', f => { f.registration.pullRequest = 45 }],
  ['expired registration', f => { f.registration.expiresAt = '2025-01-01' }],
  ['changed candidate workflow', f => { f.registration.workflowSha256 = hash('not these bytes') }],
  ['omitted API proof contract', f => { delete f.registration.apiAcceptanceStep }],
  ['omitted cleanup contract', f => { f.registration.requiredSteps = f.registration.requiredSteps.filter(x => !x.startsWith('Always destroy')) }],
  ['missing actual API step', f => { f.job.steps.pop() }],
  ['skipped actual cleanup', f => { f.job.steps[3].conclusion = 'skipped' }],
  ['failed exact-head run', f => { f.run.conclusion = 'failure' }],
  ['stale run head', f => { f.run.head_sha = 'c'.repeat(40) }],
  ['wrong workflow identity', f => { f.run.workflow_id = 23 }],
  ['failed job hidden by successful run', f => { f.job.conclusion = 'failure' }],
]) test(`collector rejects ${name}`, async () => { const f = fixture(); mutate(f); await assert.rejects(() => collectReadiness(f.options)) })
for (const [name, mutate] of [
  ['historical SQL edited', f => { f.blobs.set(`${head}:${f.names[0]}`, 'changed applied SQL') }],
  ['orphan live version', f => { f.live.push({ version: '20990101000000', name: 'orphan' }) }],
  ['live name mismatch', f => { f.live[0].name = 'renamed' }],
  ['unrelated pending base SQL', f => { f.live.pop() }],
  ['SQL content changed since review', f => { f.blobs.set(`${head}:${f.added}`, 'different SQL') }],
]) test(`collector keeps strict rejection for ${name}`, async () => { const f = fixture(); mutate(f); let refused = false; try { refused = !(await collectReadiness(f.options)).ok } catch { refused = true }; assert.equal(refused, true) })
test('a forged check publisher cannot authorize a bare success badge', async () => {
  const f = fixture(), api = f.options.api
  f.options.api = async path => path.endsWith('/check-runs/300') ? { app: { slug: 'other', id: 1 }, head_sha: head, status: 'completed', conclusion: 'success' } : api(path)
  await assert.rejects(() => collectReadiness(f.options))
})
test('unavailable live ledger is a failure, never a readiness skip', async () => {
  const f = fixture(); f.options.ledger = async () => { throw Error('offline') }
  await assert.rejects(() => collectReadiness(f.options))
})
test('a ledger change during proof collection refuses the pending decision', async () => {
  const f = fixture(); let reads = 0
  f.options.ledger = async () => { reads++; return reads === 1 ? structuredClone(f.live) : [...f.live, { version: '20990101000000', name: 'concurrent_sql' }] }
  await assert.rejects(() => collectReadiness(f.options))
})
test('CI fallback is confined to migration PR failure and loads its collector from main', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.match(source, /if \[ "\$guard" = migrations \] && \[ "\$GITHUB_EVENT_NAME" = pull_request \] &&/)
  assert.match(source, /node scripts\/verify-migration-readiness\.mjs/)
  const contractStep = source.slice(source.indexOf('- name: Contract guards'), source.indexOf('          guards=('))
  assert.ok(!contractStep.includes('continue-on-error: true'))
})
test('unchanged SQL can prove strict parity without a registration or staging exception', async () => {
  const f = fixture(), git = f.options.git
  f.options.git = (args, binary, input) => args[0] === 'diff' ? '' : args[0] === 'ls-tree' && !args.includes('-z') ? f.names.join('\n') : git(args, binary, input)
  const result = await collectReadiness(f.options)
  assert.equal(result.status, 'not_applicable')
  assert.ok(!f.calls.some(c => c[0] === 'api' && c[1].includes('/actions/')))
})
test('a historical SQL edit is refused even when all live version/name pairs still match', async () => {
  const f = fixture(), git = f.options.git
  f.blobs.set(`${head}:${f.names[0]}`, 'edited applied body')
  f.options.git = (args, binary, input) => args[0] === 'diff' ? `M\0${f.names[0]}\0` : args[0] === 'ls-tree' && !args.includes('-z') ? f.names.join('\n') : git(args, binary, input)
  await assert.rejects(() => collectReadiness(f.options), /historical SQL changed/)
})
test('real disposable Git main checkout and candidate blob reads produce a pending decision without network or SQL execution', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  const dir = mkdtempSync(join(tmpdir(), 'frequency-migration-policy-'))
  const command = args => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text) }
  try {
    const f = fixture()
    command(['init', '-q']); command(['config', 'user.name', 'Offline fixture']); command(['config', 'user.email', 'fixture@example.invalid'])
    for (const file of f.names) write(file, 'unchanged SQL')
    write('scripts/migration-pr-readiness.mjs', f.source)
    write('scripts/migration-readiness-policy.json', JSON.stringify({ version: 1, registrations: [f.registration] }))
    write('.github/workflows/db-tests.yml', 'reviewed full staging workflow')
    command(['add', '.']); command(['commit', '-qm', 'base'])
    const actualBase = command(['rev-parse', 'HEAD']).trim()
    command(['checkout', '-qb', 'candidate']); write(f.added, 'create table public.fixture(id int);')
    command(['add', '.']); command(['commit', '-qm', 'new SQL'])
    const actualHead = command(['rev-parse', 'HEAD']).trim()
    command(['checkout', '--detach', actualBase])
    f.options.env.GITHUB_SHA = actualBase
    f.options.event.pull_request.head.sha = actualHead
    const api = f.options.api
    f.options.api = async path => {
      const normalized = path.replaceAll(actualHead, head)
      const result = await api(normalized)
      return JSON.parse(JSON.stringify(result).replaceAll(base, actualBase).replaceAll(head, actualHead))
    }
    f.options.git = (args, binary, input) => args[0] === 'fetch' ? '' : execFileSync('git', ['--no-replace-objects', ...args], { cwd: dir, input, encoding: binary ? undefined : 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    assert.equal((await collectReadiness(f.options)).status, 'registered_pending_apply')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
test('candidate runner context cannot execute the secret-bearing collector', async () => {
  const f = fixture(); f.options.env.GITHUB_EVENT_NAME = 'pull_request'
  await assert.rejects(() => collectReadiness(f.options))
  assert.equal(f.calls.length, 0)
})
test('a newer failed staging dispatch appearing during IO invalidates the earlier green result', async () => {
  const f = fixture(), api = f.options.api; let reads = 0
  f.options.api = async path => {
    if (path.includes('/actions/workflows/22/runs?')) { reads++; if (reads > 1) return { total_count: 1, workflow_runs: [{ ...f.run, id: 101, conclusion: 'failure' }] } }
    return api(path)
  }
  await assert.rejects(() => collectReadiness(f.options), /staging changed/)
})
test('trusted workflow installs and executes no candidate program before reading production facts', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../.github/workflows/migration-readiness.yml', import.meta.url), 'utf8')
  assert.match(source, /pull_request_target:/)
  assert.match(source, /ref: \$\{\{ github.event.pull_request.base.sha \}\}/)
  assert.match(source, /persist-credentials: false/)
  assert.match(source, /run: node scripts\/migration-pr-readiness.mjs/)
  assert.ok(!/pnpm|npm install|pull_request.head.sha|curl |eval /.test(source))
})

import { verifyReadiness } from './verify-migration-readiness.mjs'
function consumerFixture() {
  const f = fixture()
  const proof = { id: 200, run_attempt: 1, workflow_id: 55, head_sha: base, event: 'pull_request_target', repository: { full_name: repository }, status: 'completed', conclusion: 'success', pull_requests: [{ number: 44, head: { sha: head }, base: { sha: base } }] }
  const job = { head_sha: base, status: 'completed', conclusion: 'success', check_run_url: 'https://api.github.com/repos/test/check-runs/600', steps: [{ name: 'Evaluate migration PR readiness', conclusion: 'success' }] }
  const check = { app: { id: 15368, slug: 'github-actions' }, head_sha: base, conclusion: 'success' }
  const oldApi = f.options.api
  f.options.env.GITHUB_EVENT_NAME = 'pull_request'
  f.options.git = () => `tree abc\nparent ${base}\nparent ${head}\n\nCI merge`
  f.options.api = async path => {
    if (path.endsWith('/actions/workflows/migration-readiness.yml')) return { id: 55, path: '.github/workflows/migration-readiness.yml' }
    if (path.includes('/actions/workflows/55/runs?')) return { total_count: 1, workflow_runs: [proof] }
    if (path.includes('/actions/runs/200/attempts/1/jobs?')) return { total_count: 1, jobs: [job] }
    if (path.endsWith('/check-runs/600')) return check
    return oldApi(path)
  }
  return { f, proof, job, check }
}
test('candidate consumer accepts only completed independent current-main/current-head proof', async () => {
  const { f } = consumerFixture()
  assert.equal((await verifyReadiness(f.options)).runId, 200)
  assert.ok(!f.calls.some(call => call[0] === 'ledger'))
})
for (const [name, mutate] of [
  ['candidate workflow event', x => { x.proof.event = 'pull_request' }],
  ['stale main', x => { x.proof.head_sha = 'c'.repeat(40) }],
  ['old candidate head', x => { x.proof.pull_requests[0].head.sha = 'c'.repeat(40) }],
  ['another PR', x => { x.proof.pull_requests[0].number = 45 }],
  ['unassociated run', x => { x.proof.pull_requests = [] }],
  ['failed proof', x => { x.proof.conclusion = 'failure' }],
  ['running proof', x => { x.proof.status = 'in_progress' }],
  ['skipped evaluator', x => { x.job.steps[0].conclusion = 'skipped' }],
  ['wrong check app', x => { x.check.app.id = 1 }],
  ['forged job head', x => { x.job.head_sha = head }],
  ['stale CI merge tree', x => { x.f.options.git = () => `parent ${base}\nparent ${'c'.repeat(40)}\n` }],
]) test(`candidate consumer rejects ${name}`, async () => { const x = consumerFixture(); mutate(x); await assert.rejects(() => verifyReadiness(x.f.options)) })
test('no-SQL trusted fallback needs no production credential/read or registration', async () => {
  const f = fixture(), git = f.options.git
  f.options.git = (args, binary, input) => args[0] === 'diff' ? `M\0README.md\0` : args[0] === 'show' && args[1] === `${head}:README.md` ? Buffer.from('reviewed documentation') : git(args, binary, input)
  f.options.ledger = async () => { throw Error('production must not be read') }
  assert.equal((await collectReadiness(f.options)).status, 'not_applicable')
})
test('SQL symlinks cannot substitute a target-path blob for the SQL staging executes', async () => {
  const f = fixture(); f.sqlMode = '120000'
  await assert.rejects(() => collectReadiness(f.options), /regular file/)
})
test('candidate Git mode changes must match the reviewed complete diff', async () => {
  const f = fixture(); f.registration.reviewedChanges[0].headMode = '100755'
  assert.equal((await collectReadiness(f.options)).ok, false)
})
