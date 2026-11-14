#!/usr/bin/env node
import assert from 'node:assert/strict'
import { stagingJobInventory } from '../lib/staging-job-inventory.mjs'
const repo = 'hellofrequencylab/frequency-web', head = 'a'.repeat(40), base = 'b'.repeat(40)
const jobs = [1, 2, 3].map(id => ({ id, name: id === 1 ? 'db-tests' : 'migration-readiness', run_id: 10, run_attempt: 1, runner_id: id === 1 ? 42 : null, head_sha: head, status: 'completed', conclusion: id === 1 ? 'success' : 'failure', steps: id === 1 ? [{ name: 'API acceptance', conclusion: 'success' }] : [], check_run_url: `https://api.github.com/repos/${repo}/check-runs/${id}` }))
const api = async path => {
  if (path.endsWith('/actions/workflows/migration-readiness.yml')) return { id: 50, path: '.github/workflows/migration-readiness.yml' }
  if (path.includes('/check-runs/')) { const job = jobs.find(j => path.endsWith(`/check-runs/${j.id}`)); return { ...job, app: { id: 15368, slug: 'github-actions' }, external_id: `migration-readiness:20:1:7:${base}:${head}`, details_url: `https://github.com/${repo}/runs/${job.id}` } }
  return { id: 20, run_attempt: 1, workflow_id: 50, path: '.github/workflows/migration-readiness.yml', event: 'pull_request_target', head_sha: head, repository: { full_name: repo }, head_repository: { full_name: repo } }
}
const options = { inventory: { total_count: 3, jobs }, run: { id: 10, run_attempt: 1 }, pr: 7, base, head, api }
assert.deepEqual((await stagingJobInventory(options)).steps, jobs[0].steps)
jobs[1].runner_id = 99
await assert.rejects(() => stagingJobInventory(options))
console.log('Real staging execution remains required; authenticated non-executing publisher metadata cannot poison or satisfy staging proof')
