// Non-triviality tests for the capture follow-up gate (HYG-115).
//
// The gate exists because a capture job walked away from its push without looking, and the three
// things that can happen to the checks behind that push were indistinguishable downstream. So the
// verdict is driven, arm by arm, by fixtures in the shape the REST API returns: parked runs FIRE,
// no runs FIRE, running or concluded runs stay quiet; and the CLI is driven with an injected fetch
// and no wait, so its exit code and its job summary are proven without a network.

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DEFAULT_WAIT_MS, WATCHED, fetchRunsForHead, followUpVerdict, main, readVerdict, shapeRun } from './check-capture-followup.mjs'

const HEAD = 'b5241b6ffffffffffffffffffffffffffffffffff'
const run = (name: string, status: string, conclusion: string | null = null, head_sha = HEAD) => ({ name, status, conclusion, head_sha, html_url: `https://github.com/x/y/actions/runs/${name}` })

describe('followUpVerdict', () => {
  it('watches ci and e2e, the two workflows a capture exists to satisfy', () => {
    expect(WATCHED).toEqual(['ci', 'e2e'])
  })

  it('FIRES on runs parked at action_required, the PR #2841 shape', () => {
    const v = followUpVerdict({ headSha: HEAD, runs: [run('ci', 'completed', 'action_required'), run('e2e', 'completed', 'action_required')] })
    expect(v.ok).toBe(false)
    expect(v.state).toBe('parked')
    expect(v.lines.join(' ')).toContain('PARKED at action_required')
  })

  it('FIRES on a head with no ci or e2e run at all, the PR #2855 shape', () => {
    const v = followUpVerdict({ headSha: HEAD, runs: [] })
    expect(v.ok).toBe(false)
    expect(v.state).toBe('none')
    expect(v.lines.join(' ')).toContain('judged by nothing')
  })

  it('stays quiet on runs that are queued, running or concluded, whatever they concluded', () => {
    expect(followUpVerdict({ headSha: HEAD, runs: [run('ci', 'in_progress'), run('e2e', 'completed', 'success')] }).ok).toBe(true)
    expect(followUpVerdict({ headSha: HEAD, runs: [run('ci', 'queued'), run('e2e', 'queued')] }).ok).toBe(true)
    // A failed run is a JUDGED run: the checklist shows it, which is the whole point.
    expect(followUpVerdict({ headSha: HEAD, runs: [run('ci', 'completed', 'failure'), run('e2e', 'completed', 'failure')] }).ok).toBe(true)
  })

  it('one parked run fires even when the other ran', () => {
    const v = followUpVerdict({ headSha: HEAD, runs: [run('ci', 'completed', 'success'), run('e2e', 'completed', 'action_required')] })
    expect(v.ok).toBe(false)
    expect(v.state).toBe('parked')
  })

  it('passes with only ci present but names the missing e2e, since a branch with no PR has no e2e', () => {
    const v = followUpVerdict({ headSha: HEAD, runs: [run('ci', 'in_progress')] })
    expect(v.ok).toBe(true)
    expect(v.lines.join(' ')).toContain('No e2e run')
  })

  it('reads only the watched workflows and only the pushed head', () => {
    // A Vercel bot check or an e2e-manual run of its own is not a judgement of the baselines, and a
    // run on another SHA is not this capture's.
    const v = followUpVerdict({ headSha: HEAD, runs: [run('e2e (manual)', 'in_progress'), run('ci', 'in_progress', null, 'other-sha')] })
    expect(v.ok).toBe(false)
    expect(v.state).toBe('none')
  })

  it('treats a run with no head_sha as this head, so a trimmed listing still counts', () => {
    expect(followUpVerdict({ headSha: HEAD, runs: [{ name: 'ci', status: 'in_progress', conclusion: null }] }).ok).toBe(true)
  })

  it('does not throw on garbage', () => {
    expect(followUpVerdict({ headSha: HEAD, runs: undefined as unknown as [] }).state).toBe('none')
    expect(followUpVerdict({ headSha: HEAD, runs: [null as unknown as { name: string }] }).state).toBe('none')
  })
})

// ── THE CLI, with an injected fetch ─────────────────────────────────────────────────────────────

function fetchWith(pages: unknown[]): { impl: typeof fetch; calls: number } {
  const state = { calls: 0 }
  const impl = (async () => {
    const body = pages[Math.min(state.calls, pages.length - 1)]
    state.calls += 1
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
  return { impl, get calls() { return state.calls } }
}

const temps: string[] = []
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true })
})

function summaryFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'capture-followup-'))
  temps.push(dir)
  return path.join(dir, 'summary.md')
}

const ENV = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'x/y', HEAD_SHA: HEAD }

describe('main(): exit code and job summary', () => {
  it('exits 1 and writes the summary when the runs are parked', async () => {
    const summary = summaryFile()
    const f = fetchWith([{ workflow_runs: [run('ci', 'completed', 'action_required'), run('e2e', 'completed', 'action_required')] }])
    const code = await main(['--wait-ms', '0'], { ...ENV, GITHUB_STEP_SUMMARY: summary }, f.impl)
    expect(code).toBe(1)
    expect(readFileSync(summary, 'utf8')).toContain('has NOT been judged (parked)')
  })

  it('exits 1 when no run exists after the wait, and re-reads while it waits', async () => {
    const summary = summaryFile()
    const f = fetchWith([{ workflow_runs: [] }])
    const sleeps: number[] = []
    const code = await main(['--wait-ms', '30000'], { ...ENV, GITHUB_STEP_SUMMARY: summary }, f.impl, { pollMs: 10_000, sleep: async (ms: number) => { sleeps.push(ms) } })
    expect(code).toBe(1)
    expect(f.calls).toBe(4)
    expect(sleeps).toEqual([10_000, 10_000, 10_000])
    expect(readFileSync(summary, 'utf8')).toContain('(none)')
  })

  it('stops waiting the moment a run appears, and exits 0 when it is running', async () => {
    const f = fetchWith([{ workflow_runs: [] }, { workflow_runs: [run('ci', 'queued'), run('e2e', 'queued')] }])
    const code = await main(['--wait-ms', '30000'], ENV, f.impl, { pollMs: 10_000, sleep: async () => {} })
    expect(code).toBe(0)
    expect(f.calls).toBe(2)
  })

  it('exits 1, not 0, when the listing cannot be read: armed and could not look', async () => {
    const impl = (async () => ({ ok: false, status: 403, json: async () => ({}) }) as Response) as unknown as typeof fetch
    expect(await main(['--wait-ms', '0'], ENV, impl)).toBe(1)
  })

  it('skips loudly with exit 0 when it is not armed', async () => {
    const impl = (async () => { throw new Error('must not be called') }) as unknown as typeof fetch
    expect(await main([], { HEAD_SHA: HEAD }, impl)).toBe(0)
  })

  it('exits 1 with no head to check', async () => {
    const impl = (async () => { throw new Error('must not be called') }) as unknown as typeof fetch
    // HEAD_SHA unset and --head absent: falls back to git, which in this repo DOES answer, so pass an empty --head.
    expect(await main(['--head', ''], { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'x/y' }, impl)).toBe(1)
  })
})

describe('fetchRunsForHead and readVerdict', () => {
  it('maps the API shape from known vocabularies and a number, never response text, and throws on a non-2xx page', async () => {
    const f = fetchWith([{ workflow_runs: [
      { id: 7, name: 'ci', status: 'queued', conclusion: null, head_sha: HEAD, html_url: 'https://evil.example/<script>', extra: 1 },
      { id: 'x', name: 'ci\n### injected', status: 'weird', conclusion: 'weirder', head_sha: 42, html_url: 'u' },
    ] }])
    const runs = await fetchRunsForHead({ repo: 'x/y', headSha: HEAD, token: 't', fetchImpl: f.impl })
    expect(runs).toEqual([
      { name: 'ci', status: 'queued', conclusion: null, head_sha: HEAD, html_url: 'https://github.com/x/y/actions/runs/7' },
      { name: null, status: 'unknown', conclusion: null, head_sha: '?', html_url: null },
    ])
    expect(JSON.stringify(runs)).not.toContain('evil')
    expect(shapeRun({ id: 3, name: 'e2e', status: 'completed', conclusion: 'action_required', head_sha: HEAD }, 'x/y').conclusion).toBe('action_required')
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch
    await expect(fetchRunsForHead({ repo: 'x/y', headSha: HEAD, token: 't', fetchImpl: bad })).rejects.toThrow('HTTP 500')
  })

  it('a parked answer is final on the first read', async () => {
    const f = fetchWith([{ workflow_runs: [run('ci', 'completed', 'action_required')] }])
    const v = await readVerdict({ repo: 'x/y', headSha: HEAD, token: 't', fetchImpl: f.impl, waitMs: DEFAULT_WAIT_MS, sleep: async () => { throw new Error('must not wait') } })
    expect(v.state).toBe('parked')
    expect(f.calls).toBe(1)
  })
})
