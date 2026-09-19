import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Guards the Dependabot refresh for the committed MapLibre worker pair (HYG-090, ADR-1424).
//
// The STALE pin in copy-maplibre-worker.test.ts is still the right guard. This file pins the
// automation that used to be missing: a workflow that regenerates public/maplibre on a
// Dependabot bump and, because a GITHUB_TOKEN push starts no CI, dispatches the required
// checks onto the new SHA. PR #2582 (2026-09-14) is the reading the row was filed from.

const WORKFLOW = '.github/workflows/maplibre-worker.yml'
const SCRIPT = 'scripts/copy-maplibre-worker.mjs'

function stripComments(text: string): string {
  return text.replace(/^\s*#.*$/gm, '')
}

function workflowFiles(): string[] {
  const dir = '.github/workflows'
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => join(dir, f))
}

describe('a Dependabot maplibre-gl bump refreshes the committed worker pair (HYG-090)', () => {
  it('the workflow file exists', () => {
    expect(existsSync(WORKFLOW), `${WORKFLOW} is missing`).toBe(true)
  })

  it('a workflow (comments stripped) runs the copy script — the backlog probe', () => {
    // Byte-identical to the HYG-090 verify.cmd so a comment-only mention (codeql.yml today)
    // cannot pass it.
    const hit = workflowFiles().some((f) =>
      /copy-maplibre-worker\.mjs/.test(stripComments(readFileSync(f, 'utf8'))),
    )
    expect(hit, 'no workflow runs the maplibre worker copy on a bump').toBe(true)
  })

  it('the run line is this workflow, not a leftover comment in another file', () => {
    const body = stripComments(readFileSync(WORKFLOW, 'utf8'))
    expect(body).toMatch(/run:\s+node scripts\/copy-maplibre-worker\.mjs/)
    expect(existsSync(SCRIPT)).toBe(true)
  })

  it('is gated on the dependabot actor, same-repo, and never on main', () => {
    const wf = readFileSync(WORKFLOW, 'utf8')
    const body = stripComments(wf)
    expect(body).toContain("github.actor == 'dependabot[bot]'")
    expect(body).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(body).toContain("github.event.pull_request.head.ref != 'main'")
    expect(body).not.toMatch(/^\s*on:\s*$[\s\S]*?^\s+push:/m)
    expect(body).not.toContain('pull_request_target')
  })

  it('checks out the PR HEAD so the commit lands on the branch, not the merge commit', () => {
    const wf = readFileSync(WORKFLOW, 'utf8')
    expect(wf).toMatch(/ref:\s+\$\{\{\s*github\.head_ref\s*\}\}/)
    expect(wf).toContain('contents: write')
  })

  it('commits only the two public/maplibre files the copy script writes', () => {
    const wf = readFileSync(WORKFLOW, 'utf8')
    expect(wf).toContain(
      'git add public/maplibre/maplibre-gl-worker.mjs public/maplibre/maplibre-gl-shared.mjs',
    )
    expect(wf).toMatch(/git commit -m /)
    expect(wf).toMatch(/git push origin/)
  })

  it('dispatches the required Action checks because a GITHUB_TOKEN push starts no CI', () => {
    const body = stripComments(readFileSync(WORKFLOW, 'utf8'))
    expect(body).toContain('actions: write')
    expect(body).toContain('gh workflow run ci.yml --ref')
    expect(body).toContain('gh workflow run codeql.yml --ref')
    expect(body).toContain('gh workflow run db-tests-fallback.yml --ref')
    expect(body).toContain('pushed=true')
    // The dispatch step must not run when nothing was pushed (a no-op copy would otherwise
    // kick a second CI on the same SHA for no reason).
    expect(body).toMatch(/if: steps\.commit\.outputs\.pushed == 'true'/)
  })
})
