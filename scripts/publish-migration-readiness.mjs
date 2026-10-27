// Imported only by main's metadata-only pull_request_target evaluator. No candidate execution.
import { createHash } from 'node:crypto'
const repo = 'hellofrequencylab/frequency-web'
const sha = /^[a-f0-9]{40}$/, digest = /^[a-f0-9]{64}$/
const hash = value => createHash('sha256').update(value).digest('hex')
const requireFact = (condition, message) => { if (!condition) throw Error(message) }
const files = ['scripts/migration-pr-readiness.mjs', 'scripts/publish-migration-readiness.mjs', '.github/workflows/migration-readiness.yml', 'scripts/migration-readiness-policy.json']
export async function publishReadiness({ env, event, api, git, publisherSha256, evaluate }) {
  requireFact(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'pull_request_target' && env.GITHUB_REPOSITORY === repo && env.GITHUB_WORKFLOW_REF === `${repo}/.github/workflows/migration-readiness.yml@refs/heads/main`, 'trusted workflow required')
  requireFact(Number.isSafeInteger(event?.number) && event.number > 0 && sha.test(event.pull_request?.head?.sha) && /^\d+$/.test(env.GITHUB_RUN_ID ?? '') && /^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'unknown PR/run identity')
  const read = async () => {
    const [pr, main] = await Promise.all([api(`/repos/${repo}/pulls/${event.number}`), api(`/repos/${repo}/branches/main`)])
    requireFact(pr?.state === 'open' && !pr.draft && pr.base?.ref === 'main' && pr.base.repo?.full_name === repo && pr.head?.repo?.full_name === repo && sha.test(pr.head.sha) && sha.test(main?.commit?.sha) && pr.head.sha === event.pull_request.head.sha && pr.base.sha === main.commit.sha, 'current ready same-repository PR required')
    return { head: pr.head.sha, base: main.commit.sha }
  }
  const binding = await read()
  requireFact(env.GITHUB_SHA === binding.base && String(git(['rev-parse', 'HEAD'])).trim() === binding.base, 'current main checkout required')
  const sources = Object.fromEntries(files.map(file => [file, hash(git(['show', `${binding.base}:${file}`], true))]))
  requireFact(digest.test(publisherSha256 ?? '') && sources[files[1]] === publisherSha256, 'publisher differs from trusted main')
  const current = async () => { const value = await read(); requireFact(value.head === binding.head && value.base === binding.base, 'binding moved'); return value }
  const details = `https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
  const externalId = `migration-readiness:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}:${event.number}:${binding.base}:${binding.head}`
  await current()
  const check = await api(`/repos/${repo}/check-runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'migration-readiness', head_sha: binding.head, status: 'in_progress', external_id: externalId, details_url: details, output: { title: 'Trusted migration readiness is running', summary: 'Main-owned metadata evaluation only. No production SQL is applied.' } }) })
  requireFact(Number.isSafeInteger(check?.id) && check.id > 0 && check.head_sha === binding.head && check.name === 'migration-readiness' && check.app?.id === 15368 && check.app.slug === 'github-actions', 'candidate-head check creation failed')
  const finish = async (conclusion, output) => {
    const updated = await api(`/repos/${repo}/check-runs/${check.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed', conclusion, external_id: externalId, details_url: details, output }) })
    requireFact(updated?.id === check.id && updated.head_sha === binding.head && updated.name === 'migration-readiness' && updated.conclusion === conclusion && updated.app?.id === 15368, 'candidate-head check completion failed')
  }
  try {
    const result = await evaluate()
    requireFact(result?.ok === true && ['not_applicable', 'strict_parity', 'registered_pending_apply'].includes(result.status), 'evaluation refused')
    const proof = result.proof
    requireFact(proof?.baseSha === binding.base && proof.headSha === binding.head && proof.collectorSha256 === sources[files[0]], 'unbound evaluator result')
    if (result.status === 'registered_pending_apply') requireFact(proof.policySha256 === sources[files[3]] && digest.test(proof.registrationSha256 ?? '') && digest.test(proof.workflowSha256 ?? '') && Number.isSafeInteger(proof.stagingRunId) && proof.stagingRunId > 0 && Number.isSafeInteger(proof.stagingAttempt) && proof.stagingAttempt > 0, 'incomplete registered staging proof')
    const receipt = { version: 1, pr: event.number, head: binding.head, base: binding.base, trustedRunId: env.GITHUB_RUN_ID, trustedRunAttempt: env.GITHUB_RUN_ATTEMPT, sources, verdict: result.status, ...(result.status === 'registered_pending_apply' ? { registrationSha256: proof.registrationSha256, stagingRunId: proof.stagingRunId, stagingAttempt: proof.stagingAttempt, workflowSha256: proof.workflowSha256 } : {}) }
    await current()
    await finish('success', { title: result.status === 'not_applicable' ? 'No SQL change: trusted fallback' : 'Trusted migration PR readiness passed', summary: `${result.status === 'not_applicable' ? 'No production ledger comparison was needed.' : 'Production application is not performed or claimed.'}\n\n${JSON.stringify(receipt)}` })
    // A branch movement during the API write invalidates even the old-head result.
    await current()
    return result
  } catch {
    await finish('failure', { title: 'Trusted migration readiness failed closed', summary: 'Evaluation, identity or proof was refused, unavailable or moved. No production SQL was applied. Rerun against the current PR head and main.' })
    throw Error('trusted candidate-head readiness failed')
  }
}
