import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { publishReadiness } from './publish-migration-readiness.mjs'
const repo = 'hellofrequencylab/frequency-web', base = 'a'.repeat(40), head = 'b'.repeat(40)
const hash = value => createHash('sha256').update(value).digest('hex')
function fixture(status = 'not_applicable') {
  const files = { 'scripts/migration-pr-readiness.mjs': 'trusted collector', 'scripts/publish-migration-readiness.mjs': 'trusted publisher', '.github/workflows/migration-readiness.yml': 'trusted workflow', 'scripts/migration-readiness-policy.json': 'reviewed registration' }
  const pr = { state: 'open', draft: false, base: { ref: 'main', sha: base, repo: { full_name: repo } }, head: { sha: head, repo: { full_name: repo } } }
  const writes = [], events = [], main = { commit: { sha: base } }
  const proof = { headSha: head, baseSha: base, collectorSha256: hash(files['scripts/migration-pr-readiness.mjs']), policySha256: hash(files['scripts/migration-readiness-policy.json']), registrationSha256: 'c'.repeat(64), workflowSha256: 'd'.repeat(64), stagingRunId: 71, stagingAttempt: 2, extra: 'DO_NOT_SERIALIZE_SECRET' }
  const f = { pr, main, writes, events, proof, evaluateCalls: 0, failSuccessWrite: false, moveAfterSuccess: false }
  f.options = {
    env: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_REPOSITORY: repo, GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/migration-readiness.yml@refs/heads/main`, GITHUB_SHA: base, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' },
    event: { number: 44, pull_request: { head: { sha: head } } }, publisherSha256: hash(files['scripts/publish-migration-readiness.mjs']),
    git(args) { if (args[0] === 'rev-parse') return base; assert.equal(args[0], 'show'); return Buffer.from(files[args[1].slice(41)]) },
    async api(path, options) {
      if (!options) { events.push('read'); if (path.endsWith('/pulls/44')) return structuredClone(pr); if (path.endsWith('/branches/main')) return structuredClone(main); throw Error('unexpected read') }
      const payload = JSON.parse(options.body); writes.push({ path, payload }); events.push(payload.conclusion ?? 'in_progress')
      if (f.failSuccessWrite && payload.conclusion === 'success') throw Error('network SECRET')
      if (f.moveAfterSuccess && payload.conclusion === 'success') pr.head.sha = 'e'.repeat(40)
      return { id: 500, head_sha: payload.head_sha ?? head, name: 'migration-readiness', app: { id: 15368, slug: 'github-actions' }, ...payload }
    },
    async evaluate() { f.evaluateCalls++; events.push('evaluate'); return { ok: true, status, proof, raw: 'DO_NOT_SERIALIZE_SECRET' } },
  }
  return f
}
test('no-SQL success is posted to candidate head with trusted base/source identity and explicit no-ledger wording', async () => {
  const f = fixture(); await publishReadiness(f.options)
  assert.equal(f.writes[0].payload.head_sha, head)
  assert.equal(f.writes[0].payload.name, 'migration-readiness')
  assert.ok(f.events.indexOf('in_progress') < f.events.indexOf('evaluate'))
  const completed = f.writes.at(-1).payload
  assert.equal(completed.conclusion, 'success')
  assert.match(completed.output.summary, /No production ledger comparison was needed/)
  const receipt = JSON.parse(completed.output.summary.split('\n\n')[1])
  assert.equal(receipt.head, head); assert.equal(receipt.base, base); assert.equal(receipt.trustedRunId, '123')
  assert.equal(receipt.sources['scripts/publish-migration-readiness.mjs'], f.options.publisherSha256)
  assert.ok(!JSON.stringify(f.writes).includes('DO_NOT_SERIALIZE_SECRET'))
})
test('registered migration result binds policy, registration and staging run/attempt to exact candidate-head check', async () => {
  const f = fixture('registered_pending_apply'); await publishReadiness(f.options)
  const receipt = JSON.parse(f.writes.at(-1).payload.output.summary.split('\n\n')[1])
  assert.equal(receipt.stagingRunId, 71); assert.equal(receipt.stagingAttempt, 2)
  assert.equal(receipt.registrationSha256, f.proof.registrationSha256)
  assert.match(f.writes.at(-1).payload.output.summary, /Production application is not performed or claimed/)
})
for (const [name, mutate] of [
  ['candidate event', f => { f.options.env.GITHUB_EVENT_NAME = 'pull_request' }],
  ['fork', f => { f.pr.head.repo.full_name = 'outsider/fork' }],
  ['draft', f => { f.pr.draft = true }],
  ['closed PR', f => { f.pr.state = 'closed' }],
  ['stale event head', f => { f.options.event.pull_request.head.sha = 'e'.repeat(40) }],
  ['stale main checkout', f => { f.options.env.GITHUB_SHA = 'e'.repeat(40) }],
  ['publisher source mismatch', f => { f.options.publisherSha256 = 'e'.repeat(64) }],
  ['unrecognized workflow ref', f => { f.options.env.GITHUB_WORKFLOW_REF = `${repo}/.github/workflows/migration-readiness.yml@refs/heads/candidate` }],
]) test(`refuses ${name} before provider facts or check publication`, async () => { const f = fixture(); mutate(f); await assert.rejects(() => publishReadiness(f.options)); assert.equal(f.evaluateCalls, 0); assert.equal(f.writes.length, 0) })
for (const [name, mutate] of [
  ['different proof head', f => { f.proof.headSha = 'e'.repeat(40) }],
  ['different proof base', f => { f.proof.baseSha = 'e'.repeat(40) }],
  ['collector source mismatch', f => { f.proof.collectorSha256 = 'e'.repeat(64) }],
  ['missing proof', f => { f.options.evaluate = async () => ({ ok: true, status: 'not_applicable' }) }],
  ['raw evaluation failure', f => { f.options.evaluate = async () => { throw Error('DO_NOT_SERIALIZE_SECRET') } }],
  ['negative evaluation', f => { f.options.evaluate = async () => ({ ok: false, status: 'failed' }) }],
  ['head change during evaluation', f => { const evaluate = f.options.evaluate; f.options.evaluate = async () => { const result = await evaluate(); f.pr.head.sha = 'e'.repeat(40); return result } }],
  ['main change during evaluation', f => { const evaluate = f.options.evaluate; f.options.evaluate = async () => { const result = await evaluate(); f.main.commit.sha = 'e'.repeat(40); return result } }],
  ['failed success API write', f => { f.failSuccessWrite = true }],
  ['head movement during success write', f => { f.moveAfterSuccess = true }],
]) test(`marks candidate-head check failure for ${name} without leaking provider/error content`, async () => { const f = fixture(); mutate(f); await assert.rejects(() => publishReadiness(f.options)); assert.equal(f.writes.at(-1).payload.conclusion, 'failure'); assert.ok(!JSON.stringify(f.writes).includes('DO_NOT_SERIALIZE_SECRET')) })
test('registered result without exact policy/staging binding fails closed', async () => {
  const f = fixture('registered_pending_apply'); f.proof.policySha256 = 'e'.repeat(64)
  await assert.rejects(() => publishReadiness(f.options)); assert.equal(f.writes.at(-1).payload.conclusion, 'failure')
})
test('workflow grants check write only to isolated runner, preserves evaluator name and runs no candidate code', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../.github/workflows/migration-readiness.yml', import.meta.url), 'utf8')
  assert.match(source, /jobs:\n  migration-readiness-runner:\n    permissions:[\s\S]*?checks: write/)
  assert.match(source, /- name: Evaluate migration PR readiness/)
  assert.ok(!/pnpm|npm install|pull_request.head.sha/.test(source))
})
