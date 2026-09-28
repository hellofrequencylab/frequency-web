// Non-triviality tests for the shipped-id gate (HYG-124, ADR-1538).
//
// WHY THESE EXIST. A guard that only ever passes is this repo's named failure mode (ADR-1011), and
// this guard's whole subject is a pass that meant nothing: two merged pull requests carried ids the
// one list did not have, and every gate was green. So these do not stop at "it passes on the real
// tree". They drive the exported comparison against fixtures that must FAIL, arm by arm, and then
// run the whole CLI against small git repositories built on the spot — because the thing a workflow
// reads is the exit code, and the exit code is where a guard goes quietly vacuous.

import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  EXCEPTIONS,
  MIN_COMMITS,
  MIN_IDS,
  SEED_COMMIT,
  SEED_DATE,
  chooseRef,
  findUnlisted,
  idPattern,
  idsInSubject,
  main,
  parseLog,
  readCommits,
  rowIds,
  rowPrefixes,
} from './check-shipped-ids.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const GUARD = path.join(ROOT, 'scripts/check-shipped-ids.mjs')

const rows = (...ids: string[]) => new Set(ids)
const commit = (subject: string, sha = 'deadbeef'.repeat(5), date = '2026-09-01') => ({ sha, date, subject })

describe('what counts as an id', () => {
  it('derives the prefixes from the rows themselves, so there is no second list to drift', () => {
    expect([...rowPrefixes(rows('LIVE-1', 'HYG-2', 'PROG-CAL11', 'DEF-ETSY'))].sort()).toEqual(['DEF', 'HYG', 'LIVE', 'PROG'])
  })

  it('matches whole tokens under a known prefix and nothing else', () => {
    const p = idPattern(rowPrefixes(rows('LIVE-1', 'HYG-2', 'PROG-1')))
    expect(idsInSubject('Fix the thing (LIVE-475, HYG-125) and PROG-CAL11 (#2878)', p)).toEqual(['LIVE-475', 'HYG-125', 'PROG-CAL11'])
    // Not ids here: an ADR number, a doc name, a hash algorithm, a lowercase spelling.
    expect(idsInSubject('ADR-1043 supersedes BUILD-SEQUENCE; use SHA-256; live-12 is prose', p)).toEqual([])
    // A possessive or a trailing paren does not swallow the id.
    expect(idsInSubject("LIVE-458's probe reads the mode (LIVE-475)", p)).toEqual(['LIVE-458', 'LIVE-475'])
  })

  it('reads entries[].id and refuses a list that does not parse', () => {
    expect([...rowIds(JSON.stringify({ entries: [{ id: 'A-1' }, { id: 'B-2' }, { title: 'no id' }] }))]).toEqual(['A-1', 'B-2'])
    expect(() => rowIds('{ not json')).toThrow()
  })

  it('parses git log lines with the unit separator, keeping a subject that carries one', () => {
    const parsed = parseLog('abc\x1f2026-09-27\x1fSubject one (HYG-1)\ndef\x1f2026-09-26\x1fTwo\x1fhalves\n')
    expect(parsed).toEqual([
      { sha: 'abc', date: '2026-09-27', subject: 'Subject one (HYG-1)' },
      { sha: 'def', date: '2026-09-26', subject: 'Two\x1fhalves' },
    ])
  })
})

describe('findUnlisted: the comparison, arm by arm', () => {
  const list = rows('LIVE-1', 'LIVE-2', 'HYG-3')

  it('passes a window whose every id is a row', () => {
    const r = findUnlisted({ commits: [commit('a (LIVE-1)'), commit('b (HYG-3, LIVE-2)')], rows: list, exceptions: {} })
    expect(r.missing).toEqual([])
    expect(r.staleExceptions).toEqual([])
    expect(r.idCount).toBe(3)
  })

  it('FAILS an id a subject names that is on no row, and says which commit shipped it', () => {
    const r = findUnlisted({
      commits: [commit('newest (LIVE-1)', 'aaa', '2026-09-28'), commit('shipped it (HYG-125)', 'bbb', '2026-09-27')],
      rows: list,
      exceptions: {},
    })
    expect(r.missing).toEqual([{ id: 'HYG-125', sha: 'bbb', date: '2026-09-27', subject: 'shipped it (HYG-125)' }])
  })

  it('keeps the OLDEST commit for an id named twice, since log order is newest first', () => {
    const r = findUnlisted({
      commits: [commit('again (HYG-125)', 'newer', '2026-09-28'), commit('first (HYG-125)', 'older', '2026-09-20')],
      rows: list,
      exceptions: {},
    })
    expect(r.missing.map((m) => m.sha)).toEqual(['older'])
  })

  it('lets a STATED exception through', () => {
    const r = findUnlisted({ commits: [commit('Retract LIVE-044')], rows: list, exceptions: { 'LIVE-044': 'retracted' } })
    expect(r.missing).toEqual([])
    expect(r.staleExceptions).toEqual([])
  })

  it('FAILS an exception that has rotted: its id is a row now', () => {
    const r = findUnlisted({ commits: [commit('x (LIVE-1)')], rows: list, exceptions: { 'LIVE-1': 'was not a row' } })
    expect(r.staleExceptions).toEqual(['LIVE-1'])
  })

  it('ignores a token whose prefix no row uses, so retired systems cannot fail the gate', () => {
    const r = findUnlisted({ commits: [commit('fix(audit): SEC-9/BUG-4 + PERF-3 (LIVE-1)')], rows: list, exceptions: {} })
    expect(r.missing).toEqual([])
    expect(r.idCount).toBe(1)
  })

  it('reports the counts a caller needs to refuse an empty window', () => {
    const r = findUnlisted({ commits: [], rows: list, exceptions: {} })
    expect(r.commitCount).toBe(0)
    expect(r.idCount).toBe(0)
  })
})

describe('the real tree', () => {
  it('CONTROL: the exceptions are ids that are NOT rows, and the seed is the commit that made the list', () => {
    const real = rowIds(readFileSync(path.join(ROOT, 'docs/BUILD-BACKLOG.json'), 'utf8'))
    for (const id of Object.keys(EXCEPTIONS)) {
      expect(real.has(id), `${id} is a row now; remove it from EXCEPTIONS`).toBe(false)
      expect(EXCEPTIONS[id].length, `${id} needs a reason`).toBeGreaterThan(40)
    }
    expect(real.has('HYG-124')).toBe(true)
    expect(real.has('HYG-125')).toBe(true)
    expect(real.has('LIVE-475')).toBe(true)
    expect(SEED_COMMIT).toMatch(/^[0-9a-f]{40}$/)
  })

  it('the workflow deepens the base branch to the same date the guard falls back to', () => {
    // Two files, one fact. The `--shallow-since` in ci.yml must reach the seed commit or the guard
    // reads a partial window and, in CI, fails on purpose. The workflow date is one day EARLIER than
    // SEED_DATE so a timezone cannot shave the seed off the boundary.
    const ci = readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    const m = /--filter=tree:0 --shallow-since=(\d{4}-\d{2}-\d{2})/.exec(ci)
    expect(m, 'ci.yml no longer deepens the base branch for check:shipped-ids').not.toBeNull()
    expect(Date.parse(m![1])).toBeLessThan(Date.parse(SEED_DATE))
    expect(Date.parse(SEED_DATE) - Date.parse(m![1])).toBeLessThanOrEqual(2 * 24 * 3600 * 1000)
    // And the guard is in the array, by bare name, outside any comment.
    const array = /guards=\(([\s\S]*?)\)/.exec(ci.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'))?.[1] ?? ''
    expect(/(^|\s)shipped-ids(\s|$)/.test(array)).toBe(true)
  })

  it('chooseRef reads the base branch on a pull request and HEAD otherwise', () => {
    expect(chooseRef({}, ROOT)).toEqual({ ref: 'HEAD', why: expect.stringContaining('HEAD') })
    // A base that is not fetched is a null ref with the reason, never a silent HEAD.
    expect(chooseRef({ GITHUB_BASE_REF: 'no-such-branch-xyz' }, ROOT).ref).toBeNull()
  })
})

// ── THE CLI, against repositories built on the spot ─────────────────────────────────────────────

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/** A repository whose first commit is the "seed" and whose later subjects name `subjects`. The
 *  backlog carries `rowList`. Returns the dir and the seed sha. Every fixture pads the window past
 *  the floors with commits that each name a listed id, so a case fails for its own reason. */
function repo(subjects: string[], rowList: string[]): { dir: string; seed: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'shipped-ids-'))
  temps.push(dir)
  git(dir, 'init', '-q')
  mkdirSync(path.join(dir, 'docs'))
  const entries = rowList.map((id) => ({ id, title: id, status: 'open', verify: { kind: 'manual', evidence: 'x', checked: '2026-09-28' } }))
  writeFileSync(path.join(dir, 'docs/BUILD-BACKLOG.json'), JSON.stringify({ meta: {}, entries }, null, 2))
  writeFileSync(path.join(dir, 'f'), '0')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'There is one list now (ADR-1043)')
  const seed = git(dir, 'rev-parse', 'HEAD').trim()
  let n = 0
  const pad = Array.from({ length: Math.max(MIN_COMMITS, MIN_IDS) + 2 }, (_, i) => `pad ${i} (${rowList[i % rowList.length]})`)
  for (const s of [...pad, ...subjects]) {
    n += 1
    writeFileSync(path.join(dir, 'f'), String(n))
    git(dir, 'commit', '-q', '-am', s)
  }
  return { dir, seed }
}

function run(dir: string, args: string[], env: Record<string, string> = {}): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [GUARD, ...args], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, GITHUB_ACTIONS: '', GITHUB_BASE_REF: '', ...env },
    })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const LISTED = [...Array.from({ length: 12 }, (_, i) => `LIVE-${100 + i}`), 'HYG-1']
// `HYG-1` is there so HYG is a prefix the fixture's rows use: an id under a prefix NO row uses is not an
// id to this gate (that is how the retired systems stay out), so a fixture's unlisted id must sit
// under a prefix the fixture knows.

describe('the CLI on a fixture repository', () => {
  it('exits 0 when every id since the seed is a row', () => {
    const { dir, seed } = repo(['close it (LIVE-100)', 'and this (HYG-9) (LIVE-101)'], [...LISTED, 'HYG-9'])
    const r = run(dir, ['--seed', seed])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toContain('every id a merged subject names is a row')
  })

  it('exits 1 naming the commit when a subject ships an id that is no row', () => {
    const { dir, seed } = repo(['shipped with no row (HYG-125) (#2911)'], LISTED)
    const r = run(dir, ['--seed', seed])
    expect(r.code).toBe(1)
    expect(r.out).toContain('HYG-125')
    expect(r.out).toContain('shipped with no row (HYG-125) (#2911)')
    expect(r.out).toContain('NO row')
  })

  it('does not look before the seed: an id in the seed commit itself, or older, is nobody\'s claim', () => {
    // The seed's own subject is excluded by `seed..ref`, and so is everything older. This is what
    // keeps the forty-six retired-system ids before 2026-08-17 out of the gate without exemptions.
    const { dir, seed } = repo([], LISTED)
    const older = git(dir, 'rev-parse', `${seed}`).trim()
    // Rewrite nothing; instead point --seed at a LATER commit so the earlier ones (which name only
    // listed ids anyway) drop out, and add an unlisted id BEFORE that boundary.
    writeFileSync(path.join(dir, 'f'), 'x')
    git(dir, 'commit', '-q', '-am', 'before the boundary (BUG-4) (LIVE-7777)')
    const boundary = git(dir, 'rev-parse', 'HEAD').trim()
    for (let i = 0; i < MIN_COMMITS + 2; i += 1) {
      writeFileSync(path.join(dir, 'f'), `after ${i}`)
      git(dir, 'commit', '-q', '-am', `after the boundary ${i} (${LISTED[i % LISTED.length]})`)
    }
    expect(run(dir, ['--seed', older]).code, 'LIVE-7777 is after the old seed and must fail there').toBe(1)
    const r = run(dir, ['--seed', boundary])
    expect(r.code, r.out).toBe(0)
  })

  it('refuses a window under the floors rather than printing a tick over nothing', () => {
    const { dir } = repo(['x (LIVE-100)'], LISTED)
    // Point the seed at the tip's parent: one commit in the window.
    const parent = git(dir, 'rev-parse', 'HEAD~1').trim()
    const r = run(dir, ['--seed', parent])
    expect(r.code).toBe(1)
    expect(r.out).toContain(`under the floors of ${MIN_COMMITS} and ${MIN_IDS}`)
  })

  it('reads PARTIAL when the seed is not in the clone: a loud note locally, exit 1 on GitHub Actions', () => {
    const { dir } = repo(['x (LIVE-100)'], LISTED)
    const missingSeed = '0123456789abcdef0123456789abcdef01234567'
    const local = run(dir, ['--seed', missingSeed, '--since', '2020-01-01'])
    expect(local.code, local.out).toBe(0)
    expect(local.out).toContain('PARTIAL')
    const ci = run(dir, ['--seed', missingSeed, '--since', '2020-01-01'], { GITHUB_ACTIONS: 'true' })
    expect(ci.code).toBe(1)
    expect(ci.out).toContain('Fetch base history for check:shipped-ids')
  })

  it('on a pull_request run reads origin/<base>, never the checkout\'s own commits', () => {
    const { dir, seed } = repo(['merged (LIVE-100)'], LISTED)
    // origin/main = the current tip. Then a "PR" commit on top names an id it has not added yet.
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    writeFileSync(path.join(dir, 'f'), 'pr')
    git(dir, 'commit', '-q', '-am', 'about to add it (HYG-999)')
    expect(run(dir, ['--seed', seed]).code, 'HEAD includes the PR commit and must fail').toBe(1)
    const asPr = run(dir, ['--seed', seed], { GITHUB_BASE_REF: 'main' })
    expect(asPr.code, asPr.out).toBe(0)
    expect(asPr.out).toContain('origin/main')
  })

  it('exits 1 when the base ref a pull request names was not fetched', () => {
    const { dir, seed } = repo(['x (LIVE-100)'], LISTED)
    const r = run(dir, ['--seed', seed], { GITHUB_BASE_REF: 'never-fetched' })
    expect(r.code).toBe(1)
    expect(r.out).toContain('never-fetched is not fetched')
  })

  it('exits 1 on a backlog it cannot read', () => {
    const { dir, seed } = repo([], LISTED)
    const r = run(dir, ['--seed', seed, '--backlog', 'docs/nope.json'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('could not read docs/nope.json')
  })

  it('main() is importable and returns the exit code rather than calling process.exit', () => {
    const { dir, seed } = repo(['x (LIVE-100)'], LISTED)
    const code = main(['--seed', seed], { GITHUB_ACTIONS: '' }, dir)
    expect(code).toBe(0)
    expect(readCommits({ ref: 'HEAD', seed, cwd: dir }).partial).toBe(false)
  })
})

/** Is the seed commit in THIS clone? CI's `test` job checks out at depth 1 and never runs the
 *  history fetch step (that step arms the `checks` job, where the guard runs), so there the answer is
 *  no. The cases below say what they proved on each kind of clone rather than assuming history. */
function seedReachable(): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${SEED_COMMIT}^{commit}`], { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('the CLI on THIS repository', () => {
  it('reads an exact window from the seed and passes, or on a shallow clone says PARTIAL and refuses the floors', () => {
    // The first version of this case expected exit 0 unconditionally and went red on CI's depth-1
    // `test` checkout: one commit reachable, zero ids, and the guard rightly refused to call that
    // clean. That refusal IS the behaviour under test on a shallow clone, so it is asserted rather
    // than worked around.
    const r = run(ROOT, [])
    if (seedReachable()) {
      expect(r.code, r.out).toBe(0)
      expect(r.out).toContain(`since the one list was seeded (${SEED_COMMIT.slice(0, 9)})`)
      expect(r.out).not.toContain('PARTIAL')
    } else {
      expect(r.out).toContain('PARTIAL')
      // Under the floors it must refuse; above them (a deeper-than-seed shallow clone cannot exist,
      // but a clone cut between the seed and today can) it passes with the partial note.
      if (r.code !== 0) expect(r.out).toContain(`under the floors of ${MIN_COMMITS} and ${MIN_IDS}`)
      else expect(r.out).toContain('partial window')
    }
  })

  it('MUTATION: with HYG-125 or LIVE-475 removed from the list, the real history fails the gate', () => {
    const real = JSON.parse(readFileSync(path.join(ROOT, 'docs/BUILD-BACKLOG.json'), 'utf8'))
    for (const victim of ['HYG-125', 'LIVE-475']) {
      const dir = mkdtempSync(path.join(tmpdir(), 'shipped-ids-mut-'))
      temps.push(dir)
      const entries = real.entries.filter((e: { id: string }) => e.id !== victim)
      writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ entries }))
      const r = run(ROOT, ['--backlog', path.join(dir, 'b.json')])
      // On a clone too shallow to reach either commit the mutation cannot bite; the case above has
      // already asserted what such a clone proves, so this one only skips it, never passes it.
      const reachable = r.out.includes(victim)
      if (!reachable && r.out.includes('PARTIAL')) continue
      expect(r.code, `${victim} removed and the gate still passed:\n${r.out}`).toBe(1)
      expect(r.out).toContain(victim)
    }
  })
})
