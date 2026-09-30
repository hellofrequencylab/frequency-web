import { describe, it, expect } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { refuseUnusableBaseUrl } from '../playwright.config'

// ── A GATE MAY NOT REPORT GREEN HAVING TESTED NOTHING ────────────────────────────────────────────
//
// 🔴 THE BUG (2026-08-31, found while investigating why pr-compare was red on #2323 and green on
// everything before it). `pr-compare` polls for the PR's Vercel preview, and on timeout it set
// `ready=false`, every later step was `if: ready == 'true'`, and the job exited 0 — GREEN, having
// photographed nothing.
//
// That is not a hypothetical. On #2322:
//     17:11:52  Vercel Preview check → success
//     17:12:01  pr-compare → "Nothing was tested" → GREEN
// The poll lost a race with the build by NINE SECONDS. The workflow's stated justification for the
// quiet green is "build failures are reported by Vercel's own check" — but that build did not fail,
// so there was no red anywhere, and the visual suite simply never ran. #2322 merged on it.
//
// The repo had already diagnosed this exact shape one arm over. e2e.yml's `preflight` job header
// says it in as many words: "a job that runs and takes no action reports `success`, which is
// indistinguishable from a job that ran and passed. pr-compare used to do exactly that." That fix
// covered the missing-bypass-secret case by SKIPPING the job. The no-preview case was left green on
// the strength of three enumerated cases — a fork, a skipped build, a failed build. A preview that
// merely arrives LATE is a fourth case, and none of the three justifications cover it.
//
// This file is the guard that notices the fail-safe firing, which AGENTS.md names as the rule the
// 2026-08-11 incident was reopened by: "every fail-safe needs a gate that notices it fired."
// It reads the workflow source, so it fails on the SHAPE of the code rather than on a CI run it
// would have to trigger to observe. Every assertion was watched go red with the defect put back.

const wf = readFileSync('.github/workflows/e2e.yml', 'utf8')

/** The preview-resolution shell block, which is deliberately byte-identical in both jobs. */
function pollBlocks(): string[] {
  return [...wf.matchAll(/ {10}url=""\n[\s\S]*?\n {10}fi\n/g)].map((m) => m[0])
}

describe('the preview poll exists once, in two identical copies', () => {
  it('both jobs carry it, and they have not drifted apart', () => {
    // pr-compare and lighthouse each need the preview URL and resolve it the same way. Two copies
    // is the repo's own named failure mode, so if they must be duplicated they must be IDENTICAL —
    // the same rule EventInterior/TemplateGrid are pinned by in event-standard-layout.test.ts.
    const blocks = pollBlocks()
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toBe(blocks[1])
  })
})

describe('🔴 a timed-out poll may not report success while a build is still in flight', () => {
  const block = pollBlocks()[0]

  it('classifies the absence instead of assuming every absence is benign', () => {
    // The whole fix in one assertion: the job asks WHY there is no preview before deciding that a
    // green is honest. Without this read it cannot tell "a fork has no deployment" from "the
    // deployment is 9 seconds away".
    expect(block).toContain('deployments/${dep}/statuses')
    expect(block).toMatch(/pending\|queued\|in_progress/)
  })

  it('EXITS NON-ZERO when a deployment is still building — the case that shipped the vacuous green', () => {
    // A build in flight means we ran out of patience, not out of work. `exit 1` must be reachable
    // from the pending branch; `ready=false` alone would put the job back to green.
    const pendingBranch = block.slice(block.indexOf('pending|queued|in_progress'))
    const greenIdx = pendingBranch.indexOf('ready=false')
    const exitIdx = pendingBranch.indexOf('exit 1')
    expect(exitIdx).toBeGreaterThan(-1)
    // The `exit 1` has to come BEFORE the block ever writes the green output.
    expect(exitIdx).toBeLessThan(greenIdx === -1 ? Number.MAX_SAFE_INTEGER : greenIdx)
  })

  it('🔴 reads the COMMIT STATUS too, because the Deployments API is empty while it builds', () => {
    // The hole the first version of this fix left, and the reason it is worth a named assertion.
    // On #2328 the deployment-status arm matched no pending state across 36 polls while the build
    // was genuinely in flight (verified against Vercel: `readyState: BUILDING` for 26+ minutes,
    // with the `Vercel` commit status at `pending` throughout). The states list came back empty,
    // the pending branch did not fire, and the job fell through to the quiet green meant for a
    // fork or a skipped build: 12 minutes of polling, zero pixels photographed, green check —
    // #2322's vacuous green, reappearing through a hole in its own fix.
    //
    // The exact reason the deployment arm was silent was not established, and is deliberately not
    // asserted here. The invariant that matters is that it CAN be silent mid-build, so a second,
    // independent source has to reach the same classification.
    //
    // So the classifier reads BOTH sources. Deleting either one restores a way for a build in
    // flight to read as "nothing to wait for", which is what this assertion refuses.
    expect(block).toContain('commits/${SHA}/statuses')
    expect(block).toMatch(/context \| ascii_downcase \| test\("vercel"\)/)
    // Both sources must feed the SAME states list the pending branch greps, not a second
    // unchecked variable — the arm is only load-bearing if it reaches the classification.
    //
    // ⚠️ The bound here is the SUBSHELL, not "somewhere before the grep", and that distinction is
    // the whole assertion. A first version sliced from `states=$(` to the grep and passed a
    // mutation that moved the call OUT of the subshell into `unused=$(...)` sitting between the
    // two — captured by nothing, read by nothing, and still inside the slice.
    const open = block.indexOf('states=$(')
    const close = block.indexOf('\n            )\n', open)
    expect(close).toBeGreaterThan(open)
    const subshell = block.slice(open, close)
    expect(subshell).toContain('deployments/${dep}/statuses')
    expect(subshell).toContain('commits/${SHA}/statuses')
  })

  it('keeps the quiet green for the three absences that genuinely justify it', () => {
    // Not a ratchet that turns every fork and skipped build red. When nothing is building there is
    // nothing to wait for, and Vercel's own check owns the build-failure signal.
    expect(block).toContain('ready=false')
    expect(block).toContain('Nothing was tested')
  })

  it('waits longer than the build it is racing', () => {
    // #2322 lost by nine seconds at 30 x 20s. The window is not the fix — the classification above
    // is — but a window narrower than a routine build makes the classification fire constantly.
    const attempts = Number(block.match(/seq 1 (\d+)/)?.[1])
    expect(attempts).toBeGreaterThan(30)
    // ...and not so long that it eats the job's own timeout before the suite can run.
    const budget = Math.min(...[...wf.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1])))
    expect((attempts * 20) / 60).toBeLessThan(budget / 2)
  })
})

// ── THE TURNSTILE (LIVE-330): captures serialise by WAITING, never by being cancelled ────────────
//
// ADR-1328 serialised pr-compare and lighthouse through repository-wide `concurrency` groups.
// GitHub keeps ONE pending job per group and cancels the older pending job when a newer one
// arrives (#2583's pr-compare read cancelled at 19:56:25Z, one minute after it queued, because
// #2584's arrived). An advisory check shrugs that off; a REQUIRED check cannot, because a
// cancelled required context blocks the PR until a new push re-requests it. The groups were
// therefore replaced by a turnstile step that waits inside the runner. These assertions pin the
// mechanism's shape so a well-meant "tidy" cannot put the group back or let the two copies drift.

describe('the turnstile replaces the job-level concurrency groups', () => {
  /** The job block from its name to its preview resolve, where the turnstile must sit. */
  function jobHead(job: 'pr-compare' | 'lighthouse'): string {
    const start = wf.indexOf(`\n  ${job}:\n`)
    const end = wf.indexOf("      - name: Resolve the PR's Vercel preview URL", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    return wf.slice(start, end)
  }

  it('neither preview-backed job declares a job-level concurrency group', () => {
    // A group with cancel-in-progress false still cancels a superseded PENDING job. The only
    // group left is the workflow-level per-PR one, which supersedes pushes to the same PR on
    // purpose.
    for (const job of ['pr-compare', 'lighthouse'] as const) {
      expect(jobHead(job)).not.toMatch(/^\s+concurrency:/m)
    }
    expect(wf).toMatch(/^concurrency:\n(?:  #.*\n)*  group: e2e-pr-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true/m)
  })

  it('each job carries a turnstile keyed by ITS OWN name, before the preview resolve, with the API read it needs', () => {
    for (const job of ['pr-compare', 'lighthouse'] as const) {
      const head = jobHead(job)
      expect(head).toMatch(/^\s+id: turnstile$/m)
      expect(head).toContain(`TURNSTILE_JOB: ${job}`)
      // The turnstile reads this workflow's runs and jobs; nothing else on the job is widened.
      expect(head).toMatch(/^\s+actions: read$/m)
      expect(head).not.toMatch(/^\s+\w+: write$/m)
    }
  })

  it('the two turnstile scripts are byte-identical, and never fail the job on their own', () => {
    const scripts = [...wf.matchAll(/ {12}\/\/ THE TURNSTILE\.[\s\S]*?core\.setOutput\('waited_minutes'[^\n]*\n/g)].map((m) => m[0])
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toBe(scripts[1])
    const script = scripts[0]
    // Rule 1: its own run is skipped. Rule 2: a completed job holds nothing.
    expect(script).toContain('run.id === context.runId')
    expect(script).toContain("job.status === 'completed'")
    // Rule 3: the lower run number goes first, so two waiting runs cannot starve each other.
    expect(script).toContain('run.run_number < context.runNumber')
    // Rule 5: the bound proceeds; there is no core.setFailed and no throw on the wait path.
    expect(script).not.toContain('setFailed')
    expect(script).not.toMatch(/^\s+throw /m)
    expect(script).toContain('proceeds anyway')
  })

  it('the wait bound fits inside the job timeout with the capture budget intact', () => {
    // timeout-minutes is the capture's own budget PLUS the bound. If someone lowers the timeout
    // without lowering TURNSTILE_MAX_MINUTES, a full wait leaves the suite no time at all, and
    // the job fails on the clock rather than on the pixels.
    for (const job of ['pr-compare', 'lighthouse'] as const) {
      const head = jobHead(job)
      const timeout = Number(head.match(/timeout-minutes: (\d+)/)?.[1])
      const bound = Number(head.match(/TURNSTILE_MAX_MINUTES: '(\d+)'/)?.[1])
      expect(bound).toBeGreaterThan(0)
      expect(timeout - bound).toBeGreaterThanOrEqual(30)
    }
  })
})

// ── THE MAINTAINER CAPTURE IS IN THE SAME QUEUE (LIVE-332) ───────────────────────────────────────
//
// 🔴 THE DEFECT, measured on 2026-09-14. ADR-1331's turnstile covered e2e.yml only. e2e-manual.yml
// carried NO turnstile — all four of its jobs opened with `actions/checkout` — and its
// `concurrency` group is keyed by ref, which holds the RUN and not the job. So the four jobs of ONE
// dispatch all started together, each minting a member session and capturing the whole surface
// list. The 23:28Z recapture (run 34909054841, against production) ran beside two PRs' pr-compare
// captures; the REST edge answered 503 to 11,042 requests on /rest/v1/* over the nine minutes that
// followed, and the baselines that dispatch committed were photographed inside that window.
//
// Two mechanisms, and the assertions below pin both, because they cover different overlaps: the
// turnstile handles other RUNS (in either workflow), and `needs:` handles this run's own jobs —
// which the turnstile deliberately cannot, since rule 1 skips siblings so e2e.yml's two overlap.

const manual = readFileSync('.github/workflows/e2e-manual.yml', 'utf8')

/** Every capture job of the maintainer workflow, in the order they must now run. */
const MANUAL_CHAIN = ['smoke', 'update-baselines', 'update-a11y', 'visual'] as const

const TURNSTILE_RE = / {12}\/\/ THE TURNSTILE\.[\s\S]*?core\.setOutput\('waited_minutes'[^\n]*\n/g

describe('the maintainer capture waits its turn too', () => {
  /** One job of e2e-manual.yml: its header plus its steps, up to the next top-level job. */
  function manualJob(job: (typeof MANUAL_CHAIN)[number]): string {
    const start = manual.indexOf(`\n  ${job}:\n`)
    expect(start, `${job} is gone from e2e-manual.yml`).toBeGreaterThan(-1)
    const rest = manual.slice(start + 1)
    const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
    return next < 0 ? rest : rest.slice(0, next)
  }

  /** The head of one preview-backed job in e2e.yml, for the reverse direction. */
  function prJob(job: 'pr-compare' | 'lighthouse'): string {
    const start = wf.indexOf(`\n  ${job}:\n`)
    const end = wf.indexOf("      - name: Resolve the PR's Vercel preview URL", start)
    expect(end).toBeGreaterThan(start)
    return wf.slice(start, end)
  }

  it('every capture job opens with the turnstile, keyed by its own name, before any checkout', () => {
    for (const job of MANUAL_CHAIN) {
      const block = manualJob(job)
      const turnstile = block.indexOf('      - name: Turnstile')
      const checkout = block.indexOf('      - uses: actions/checkout')
      expect(turnstile, `${job} carries no turnstile step`).toBeGreaterThan(-1)
      expect(block).toMatch(/^ {8}id: turnstile$/m)
      expect(block).toContain(`TURNSTILE_JOB: ${job}`)
      // FIRST, not merely present: a wait that starts after the install has already paid for the
      // runner, and the point is to spend the waiting time before the capture starts.
      expect(checkout, `${job} checks out before its turnstile`).toBeGreaterThan(turnstile)
    }
  })

  it('every capture job polls BOTH workflows, and a lane that spans both', () => {
    for (const job of MANUAL_CHAIN) {
      const block = manualJob(job)
      // An empty or single-file list is the defect this row was filed for: a manual capture that
      // cannot see a PR capture waits on nobody. The script warns at run time when the list is
      // empty; this is the guard that stops it reaching a runner at all.
      expect(block).toContain('TURNSTILE_WORKFLOWS: e2e.yml,e2e-manual.yml')
      const peers = block.match(/TURNSTILE_PEERS: ([^\n]+)/)?.[1].split(',') ?? []
      for (const name of [...MANUAL_CHAIN, 'pr-compare', 'lighthouse']) {
        expect(peers, `${job} does not queue behind ${name}`).toContain(name)
      }
    }
  })

  it('and the PR gate waits for the maintainer capture in return', () => {
    // The fix is symmetric, and half of it lives in the other file: without these a manual
    // dispatch would yield to a PR capture while a PR capture walked straight past a manual one.
    // lighthouse stays out of pr-compare's lane and vice versa, so one run's two jobs still
    // overlap (ADR-936 split them for that wall clock).
    for (const job of ['pr-compare', 'lighthouse'] as const) {
      const head = prJob(job)
      expect(head).toContain('TURNSTILE_WORKFLOWS: e2e.yml,e2e-manual.yml')
      const peers = head.match(/TURNSTILE_PEERS: ([^\n]+)/)?.[1].split(',') ?? []
      for (const name of MANUAL_CHAIN) expect(peers).toContain(name)
      expect(peers).toContain(job)
      expect(peers).not.toContain(job === 'pr-compare' ? 'lighthouse' : 'pr-compare')
    }
  })

  it('the four capture jobs are a CHAIN, so one dispatch never captures twice at once', () => {
    // The defect itself, in one assertion. A `needs:` edge is the only ordering here GitHub
    // enforces absolutely: the turnstile's bound can expire and proceed, and its rule 1 ignores
    // siblings on purpose.
    for (let i = 1; i < MANUAL_CHAIN.length; i += 1) {
      expect(manualJob(MANUAL_CHAIN[i]), `${MANUAL_CHAIN[i]} does not wait for ${MANUAL_CHAIN[i - 1]}`).toMatch(
        new RegExp(`^ {4}needs: ${MANUAL_CHAIN[i - 1]}$`, 'm'),
      )
    }
    // The head of the chain must be unconditional, or a dispatch that skips it skips everything.
    expect(manualJob('smoke')).not.toMatch(/^ {4}(needs|if):/m)
  })

  it('a skipped job in the chain does not silently cancel the captures behind it', () => {
    // GitHub prepends an implicit `success()` to a job `if:` that names no status function, so
    // `if: ${{ inputs.update_a11y }}` beside `needs: update-baselines` would ALSO require
    // update-baselines to have run AND passed. A dispatch asking for a11y counts alone would then
    // capture nothing whatsoever and report it as tidy "skipped" rows.
    for (const job of MANUAL_CHAIN.slice(1)) {
      const cond = manualJob(job).match(/^ {4}if: ([^\n]+)$/m)?.[1] ?? ''
      expect(cond, `${job} has no condition`).not.toBe('')
      expect(cond, `${job}'s condition names no status function, so a skipped need skips it`).toMatch(
        /!cancelled\(\)|always\(\)/,
      )
      // always() would capture straight through a cancellation, the one moment nobody wants load.
      expect(cond).not.toContain('always()')
    }
  })

  it('the turnstile reads the Actions API, which a workflow-level permissions block must grant', () => {
    // `permissions:` REPLACES the default set rather than adding to it. With only
    // `contents: write` (what this file carried) every turnstile would see zero runs, wait on
    // nobody, and clear on poll 1 — a green step that measured nothing.
    expect(manual).toMatch(/^permissions:\n(?:.*\n)*?  actions: read$/m)
  })

  it('every wait bound fits inside its job timeout with the capture budget intact', () => {
    for (const job of MANUAL_CHAIN) {
      const block = manualJob(job)
      const timeout = Number(block.match(/timeout-minutes: (\d+)/)?.[1])
      const bound = Number(block.match(/TURNSTILE_MAX_MINUTES: '(\d+)'/)?.[1])
      expect(bound).toBeGreaterThan(0)
      expect(timeout - bound, `${job} has no room left for its own suite`).toBeGreaterThanOrEqual(30)
    }
  })

  it('all six turnstile scripts, across both files, are byte-identical', () => {
    // Six copies of one script is six chances to drift, and the script IS the mechanism. Same
    // rule the two-copy assertion above enforces, extended to the file that joined the lane.
    const scripts = [...wf.matchAll(TURNSTILE_RE), ...manual.matchAll(TURNSTILE_RE)].map((m) => m[0])
    expect(scripts).toHaveLength(6)
    for (const script of scripts) expect(script).toBe(scripts[0])
  })
})

// ── 🔴 A CAPTURE TAKEN INSIDE A 5xx WINDOW MAY NOT BE COMMITTED (LIVE-333, ADR-1351) ────────────
//
// The 2026-09-14 recapture (run 34909054841) photographed 89 PNGs while the REST edge answered 503
// to 11,042 requests, PASSED, committed, merged as #2594, and the next three pr-compare runs failed
// 62 public comparisons at 1 to 2 percent against baselines that depicted a degraded shell.
//
// The row that filed this assumed the step order already refused the commit — "the runner exits
// non-zero before the commit step". IT DOES NOT, and the assertion below is why the row was wrong:
// `update-baselines`' commit step is `if: always()`, deliberately (ADR-1273 — one flaky surface
// must not discard the other captures), so a non-zero capture runs it anyway. The two cases are
// told apart by a MARKER the capture writes, and this is the guard that notices the fail-safe
// exists. Both assertions were watched go red with the defect put back.

describe('the maintainer capture refuses to commit a degraded run', () => {
  /** The `Commit baselines to the branch` step of one job, header and shell body. */
  function commitStep(after: string): string {
    const from = manual.indexOf(`\n  ${after}:\n`)
    expect(from, `${after} is gone from e2e-manual.yml`).toBeGreaterThan(-1)
    const start = manual.indexOf('      - name: Commit baselines to the branch', from)
    expect(start, `${after} has no commit step`).toBeGreaterThan(-1)
    const end = manual.indexOf('\n      - name: ', start + 10)
    return manual.slice(start, end < 0 ? manual.length : end)
  }

  it('reads the refusal marker and EXITS NON-ZERO before it stages anything', () => {
    const step = commitStep('update-baselines')
    // The `always()` is still there and still right; this assertion pins the reason it is safe.
    expect(step, "the always() this guard exists because of has gone — re-read LIVE-333").toContain(
      'if: always()',
    )
    const marker = step.indexOf('test/e2e/.degraded-capture.jsonl')
    const refuse = step.indexOf('exit 1')
    const stage = step.indexOf('git add ')
    expect(marker, 'the commit step does not look for a refused capture').toBeGreaterThan(-1)
    // `-s`, not `-f`: an EMPTY marker is a clean run, and a capture that opened the file without
    // refusing anything must not block a commit.
    expect(step).toContain('if [ -s test/e2e/.degraded-capture.jsonl ]; then')
    expect(refuse, 'a refused capture must exit non-zero').toBeGreaterThan(marker)
    expect(stage, 'the refusal must come BEFORE git add, or a partial lands anyway').toBeGreaterThan(refuse)
    // And it prints what it found: a run refused with "something failed" costs a whole dispatch.
    expect(step).toContain('cat test/e2e/.degraded-capture.jsonl')
  })

  it('stands down with exit 0 when the job never checked out (HYG-094)', () => {
    // always() still fires after the protected-ref guard refuses. Checkout is skipped, so
    // the first git call used to die with "fatal: not in a git directory". The stand-down
    // is a filesystem test on .git (dir or file), not a message that mentions a refusal,
    // and it must run BEFORE git config / git add so a refused dispatch is one red step,
    // not two.
    const step = commitStep('update-baselines')
    expect(step, 'the always() this stand-down exists because of has gone').toContain('if: always()')
    const standDown = step.indexOf('if [ ! -d .git ] && [ ! -f .git ]; then')
    const quiet = step.indexOf('exit 0')
    const firstGit = step.search(/^\s*git /m)
    expect(standDown, 'the commit step has no work-tree stand-down').toBeGreaterThan(-1)
    expect(quiet, 'a job that never checked out must exit 0, not 128').toBeGreaterThan(standDown)
    expect(firstGit, 'the stand-down must come BEFORE the first git command').toBeGreaterThan(quiet)
  })

  it('the a11y commit step is protected by step ORDER, so it must never gain always()', () => {
    // The other half of the reading, and the honest part: this step needs no marker check because
    // GitHub prepends an implicit success() to a step with no `if:`. Asserting the absence is what
    // stops somebody "fixing" it into always() by symmetry with the job above.
    const step = commitStep('update-a11y')
    expect(step).not.toContain('if: always()')
    expect(step.match(/^ {8}if: /m), 'the a11y commit step must stay unconditional').toBeNull()
  })

  it('the debug artifact carries the marker, which is the only place the URLs survive', () => {
    const upload = manual.slice(manual.indexOf('      - name: Upload baselines (debug copy)'))
    expect(upload.slice(0, 600)).toContain('test/e2e/.degraded-capture.jsonl')
    // A dotfile needs this or upload-artifact silently drops it — a swallowed fail-safe.
    expect(upload.slice(0, 600)).toContain('include-hidden-files: true')
  })
})

// ── 🔴 A DISPATCH THAT CANNOT COMMIT MAY NOT SPEND THE CAPTURE FIRST (HYG-089, ADR-1352) ────────
//
// Run 34904181882 (2026-09-14, 22:27:16Z to 22:34:07Z) was dispatched on `main` with
// update_baselines on. Seven minutes and a 110 MB artifact later the commit step failed with
// "Changes must be made through a pull request" — `main` is protected and GITHUB_TOKEN is not
// exempt — so the whole capture was spent to reach a push that could never land.
//
// THE RULE IS NARROWER THAN THE ROW ASKED FOR, and deliberately so. The row wanted "a first step
// in both jobs that fails when github.ref is refs/heads/main". A blanket refusal would also have
// refused run 34940970232, the READ-ONLY dispatch on `main` that is ADR-1346's control — and
// `workflow_dispatch` runs the workflow file as it exists on the dispatched ref, so a rule that
// has just merged can be exercised on NO OTHER REF. What is refused is a dispatch that would
// COMMIT; a read-only one is allowed on any ref.
//
// The assertions below pin the rule, its POSITION (before the turnstile, whose wait is up to 90
// minutes and which holds the capture lane shut while it waits), and its FORM (a failing step, not
// a job-level `if:` — a skipped job reports `skipped`, the one word ADR-1346's control reads).
// Every one was watched go red against `git show origin/main:` of the workflow.

describe('a dispatch that cannot commit is refused before it spends anything', () => {
  /** One job of e2e-manual.yml, header through its last step. */
  function job(name: string): string {
    const start = manual.indexOf(`\n  ${name}:\n`)
    expect(start, `${name} is gone from e2e-manual.yml`).toBeGreaterThan(-1)
    const rest = manual.slice(start + 1)
    const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
    return next < 0 ? rest : rest.slice(0, next)
  }

  /** Every job the file declares, read from source so a NEW one cannot dodge these assertions. */
  function jobNames(): string[] {
    const from = manual.indexOf('\njobs:\n')
    expect(from, 'e2e-manual.yml declares no jobs').toBeGreaterThan(-1)
    return [...manual.slice(from).matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1])
  }

  const GUARD = '      - name: Refuse a committing dispatch on a protected ref'

  /** The guard step of one job: header, env and shell body. */
  function guardStep(name: string): string {
    const block = job(name)
    const start = block.indexOf(GUARD)
    expect(start, `${name} carries no protected-ref guard`).toBeGreaterThan(-1)
    const end = block.indexOf('\n      - ', start + 10)
    return block.slice(start, end < 0 ? block.length : end)
  }

  /** A job's lines with every comment dropped, YAML and shell alike.
   *
   *  ⚠️ NOT cosmetic, and it cost the first draft of these assertions a false positive: the
   *  guard's own comment QUOTES the push it exists to protect, so a plain `includes('git push')`
   *  read `smoke` as a committing job and the derivation below silently measured three jobs
   *  instead of two. A text test that reads prose as code is the same class of bug
   *  check-workflows.mjs grew `stripBlockScalars` for. */
  function codeOf(block: string): string {
    return block
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n')
  }

  // Derived, never hardcoded: the jobs that actually push are the jobs that need the guard. A
  // fifth committing job added without one fails here rather than on a wasted dispatch.
  const commits = jobNames().filter((name) => codeOf(job(name)).includes('git push origin'))

  it('the jobs that PUSH are the jobs the incident names, and there are exactly two', () => {
    // If this ever reads differently, the assertions below are measuring the wrong set.
    expect(commits).toEqual(['update-baselines', 'update-a11y'])
  })

  it('every committing job AND the head of the chain refuse a committing dispatch on a protected ref', () => {
    // The head of the chain matters as much as the two that push. `update-baselines` is
    // `needs: smoke`, so a guard living only in the committing jobs would still let `smoke` run
    // its turnstile and its whole suite first — up to 120 minutes to reach a refusal.
    for (const name of [...commits, 'smoke']) {
      expect(job(name), `${name} carries no protected-ref guard`).toContain(GUARD)
    }
  })

  it('the guard is the FIRST step, ahead of the turnstile and any checkout', () => {
    for (const name of [...commits, 'smoke']) {
      const block = job(name)
      const steps = block.indexOf('    steps:\n')
      expect(steps, `${name} has no steps:`).toBeGreaterThan(-1)
      const first = block.indexOf('\n      - ', steps)
      expect(block.slice(first + 1), `${name}'s first step is not the guard`).toMatch(
        /^ {6}- name: Refuse a committing dispatch on a protected ref$/m,
      )
      // Explicitly ahead of BOTH costs, because they are different costs: the turnstile's wait
      // also makes every other capture in both workflows queue behind this run.
      const guard = block.indexOf(GUARD)
      for (const [what, at] of [
        ['turnstile', block.indexOf('      - name: Turnstile')],
        ['checkout', block.indexOf('      - uses: actions/checkout')],
      ] as const) {
        expect(at, `${name} has no ${what}`).toBeGreaterThan(-1)
        expect(at, `${name} reaches its ${what} before the guard`).toBeGreaterThan(guard)
      }
    }
  })

  it('it refuses the CONJUNCTION — a protected ref AND a dispatch that would commit', () => {
    const step = guardStep('smoke')
    // The branch is named in one place, as data, so a second protected ref is one line.
    expect(step).toMatch(/^ {10}PROTECTED_BRANCH: main$/m)
    // Both halves of the conjunction, on the value the push itself targets.
    expect(step).toContain('"${GITHUB_REF_NAME:-}" = "${PROTECTED_BRANCH}"')
    expect(step).toContain('"${WOULD_COMMIT}" = "true"')
    expect(step, 'the two halves must be an AND, or a read-only dispatch is refused too').toContain(
      '] && [',
    )
    // And it actually stops: a guard that prints and continues is the vacuous pass.
    const refuse = step.indexOf('exit 1')
    expect(refuse, 'the guard does not exit non-zero').toBeGreaterThan(-1)
    expect(step.indexOf('::error'), 'a refusal must name itself').toBeGreaterThan(-1)
    expect(step.indexOf('::error')).toBeLessThan(refuse)
  })

  it('🔴 a READ-ONLY dispatch on a protected ref is still allowed, which is what the control needs', () => {
    // The row asked for a blanket refusal on refs/heads/main. This is the assertion that says no:
    // run 34940970232 took ADR-1346's control on `main` because workflow_dispatch runs the file as
    // it exists on the dispatched ref, and a just-merged rule exists nowhere else.
    const step = guardStep('smoke')
    // WOULD_COMMIT is the only thing standing between this guard and refusing every main dispatch.
    expect(step, 'the guard no longer asks whether the dispatch would commit').toContain(
      'WOULD_COMMIT:',
    )
    // A bare ref test, with no input in the condition, is the blunt version this rejects.
    expect(step).not.toMatch(/if \[ "\$\{GITHUB_REF_NAME:-\}" = "\$\{PROTECTED_BRANCH\}" \]; then/)
  })

  it('WOULD_COMMIT names every input that gates a job which pushes', () => {
    // The drift assertion. Each committing job runs only when its own input is set, which is why
    // the guard can be one identical step everywhere — but only while WOULD_COMMIT lists them all.
    const would = guardStep('smoke').match(/WOULD_COMMIT: ([^\n]+)/)?.[1] ?? ''
    for (const name of commits) {
      const cond = job(name).match(/^ {4}if: ([^\n]+)$/m)?.[1] ?? ''
      const input = cond.match(/inputs\.([a-z_]+)/)?.[1]
      expect(
        input,
        `${name} is gated on no input, so the guard cannot infer it would commit`,
      ).toBeTruthy()
      expect(would, `WOULD_COMMIT does not cover ${name} (inputs.${input})`).toContain(
        `inputs.${input}`,
      )
    }
  })

  it('🔴 it is a STEP that fails, never a job-level if: that skips', () => {
    // Not a style rule. A job-level guard makes the job report `skipped`, and `skipped` is the
    // exact word ADR-1346's control reads to tell "the chain let me run" from "a skipped need
    // skipped me" — on run 34940970232, update-baselines `skipped` while update-a11y RAN. A
    // failing first step leaves every job-level reading intact and spends only seconds.
    for (const name of [...commits, 'smoke']) {
      const block = job(name)
      const header = block.slice(0, block.indexOf('    steps:'))
      expect(header, `${name} moved the protected-ref test into a job-level if:`).not.toMatch(
        /GITHUB_REF_NAME|github\.ref|PROTECTED_BRANCH/,
      )
    }
    // And the head of the chain still declares no job-level condition at all.
    expect(job('smoke')).not.toMatch(/^ {4}(needs|if):/m)
    // The guard itself must be unconditional: a step-level `if:` that mis-evaluates is a guard
    // that silently does not run, which is the swallowed fail-safe this suite exists to catch.
    expect(guardStep('smoke').match(/^ {8}if: /m), 'the guard must not be conditional').toBeNull()
  })

  it('the job that cannot commit does NOT carry it, so a read-only compare is never blocked', () => {
    // Scope control. `visual` compares against COMMITTED baselines and pushes nothing, so a visual
    // compare against production from any ref stays legal. A guard here would refuse work that
    // can always land.
    expect(codeOf(job('visual')), 'visual has grown a push — re-read HYG-089').not.toContain(
      'git push origin',
    )
    expect(job('visual'), 'visual cannot commit, so it must not carry the refusal').not.toContain(
      GUARD,
    )
  })

  it('all three guard copies are byte-identical', () => {
    // Three copies of one rule is three chances to drift, exactly as the turnstile's six are.
    const copies = [
      ...manual.matchAll(
        / {6}- name: Refuse a committing dispatch[\s\S]*?\n {10}echo "ref=[^\n]*\n/g,
      ),
    ].map((m) => m[0])
    expect(copies).toHaveLength(3)
    for (const copy of copies) expect(copy).toBe(copies[0])
  })
})

// ── 🔴 THE API QUOTA IS SHARED, AND A REFUSED READ IS NOT AN ANSWER (HYG-151, ADR-1669) ────────
//
// 2026-09-29: the repository's GITHUB_TOKEN core quota (1,000 requests an hour) read 0 twice in
// two hours. The turnstile was the largest consumer: one paginated runs read per workflow file
// plus one jobs read for EVERY in-progress run, every 30 s, in every waiting job. And the preview
// resolver swallowed every refusal with `|| true` while `gh api` prints the error BODY to stdout,
// so #3066's pr-compare (run 36636201158, job 109638485701) resolved its preview URL to
// {"message":"Not Found",...} and ran every suite against it: "Cannot navigate to invalid URL",
// four @visual reds the PR did not cause.
//
// These assertions RUN the two scripts rather than read them: the resolver under bash with a fake
// `gh` on PATH (it answers like the real one, error body on stdout), the turnstile as the async
// function github-script wraps it in, with a fake Octokit and a fake clock. Every arm was watched go
// red against main's workflow.

/** The resolver step's shell body in one job, dedented to column 0. */
function resolverScript(job: 'pr-compare' | 'lighthouse'): string {
  const start = wf.indexOf(`\n  ${job}:\n`)
  const step = wf.indexOf("      - name: Resolve the PR's Vercel preview URL", start)
  const body = wf.indexOf('        run: |\n', step) + '        run: |\n'.length
  const end = wf.indexOf('\n      - uses: actions/checkout@v7', body)
  expect(start).toBeGreaterThan(-1)
  expect(step).toBeGreaterThan(start)
  return wf
    .slice(body, end)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
}

type GhAnswer = { code?: number; out?: string; err?: string }
type GhRoute = { m: string; r: GhAnswer[] }

const NOT_FOUND = '{"message":"Not Found","documentation_url":"https://docs.github.com/rest","status":"404"}'
const RATE_LIMITED: GhAnswer = {
  code: 1,
  out: '{"message":"API rate limit exceeded for installation ID 1.","documentation_url":"https://docs.github.com/rest/overview/rate-limits-for-the-rest-api","status":"403"}',
  err: 'gh: API rate limit exceeded for installation ID 1. (HTTP 403)',
}

// Answers like the real gh: on a failure the error BODY goes to stdout and the exit code is 1.
// A path no route claims is a 404, which is what #3066's word-split "deployment ids" hit.
const FAKE_GH = `#!/usr/bin/env node
const fs = require('fs')
const path = process.argv[3] || ''
const file = process.env.FAKE_GH
fs.appendFileSync(file + '.log', path + '\\n')
const routes = JSON.parse(fs.readFileSync(file, 'utf8'))
const route = routes.find((r) => path.includes(r.m))
if (!route) {
  process.stdout.write(${JSON.stringify(NOT_FOUND + '\n')})
  process.stderr.write('gh: Not Found (HTTP 404)\\n')
  process.exit(1)
}
const seen = fs.existsSync(file + '.n') ? JSON.parse(fs.readFileSync(file + '.n', 'utf8')) : {}
const i = seen[route.m] || 0
seen[route.m] = i + 1
fs.writeFileSync(file + '.n', JSON.stringify(seen))
const a = route.r[Math.min(i, route.r.length - 1)]
if (a.out !== undefined && a.out !== '') process.stdout.write(a.out + '\\n')
if (a.err) process.stderr.write(a.err + '\\n')
process.exit(a.code || 0)
`

/** Run the resolver against scripted API answers. Routes match by substring, first wins. */
function runResolver(routes: GhRoute[], job: 'pr-compare' | 'lighthouse' = 'pr-compare') {
  const dir = mkdtempSync(join(tmpdir(), 'hyg151-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), FAKE_GH)
  // `sleep` records its argument instead of sleeping, so a 12-minute window runs in a second.
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\necho "$1" >> "$FAKE_GH.sleeps"\n')
  chmodSync(join(bin, 'gh'), 0o755)
  chmodSync(join(bin, 'sleep'), 0o755)
  const fake = join(dir, 'routes.json')
  writeFileSync(fake, JSON.stringify(routes))
  const script = join(dir, 'resolve.sh')
  writeFileSync(script, resolverScript(job))
  for (const f of ['output', 'summary']) writeFileSync(join(dir, f), '')
  // The runner's own invocation for a `run:` step: bash --noprofile --norc -eo pipefail {0}.
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_GH: fake,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: join(dir, 'output'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      REPO: 'o/r',
      SHA: 'abc123',
    },
  })
  const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '')
  return {
    status: r.status,
    log: `${r.stdout}${r.stderr}`,
    output: read('output'),
    summary: read('summary'),
    sleeps: read('routes.json.sleeps').split('\n').filter(Boolean).map(Number),
  }
}

const nowSec = () => Math.floor(Date.now() / 1000)

describe('🔴 the preview resolver tells "the API refused" from "there is no deployment" (HYG-151)', () => {
  it('replays #3066: a spent quota fails the job loudly and never hands Playwright an error body', () => {
    const r = runResolver([
      { m: 'rate_limit', r: [{ out: `0 ${nowSec() + 3000}` }] },
      { m: 'deployments?', r: [RATE_LIMITED] },
    ])
    expect(r.status, r.log).toBe(1)
    // The consequence #3066 lacked: no URL and no ready flag reach the suites.
    expect(r.output).not.toMatch(/^url=/m)
    expect(r.output).not.toContain('ready=true')
    expect(r.log).toContain('::error title=GitHub API refused the preview lookup::')
    expect(r.log).toMatch(/quota is spent until \d\d:\d\d:\d\dZ/)
    expect(r.summary).toContain('did NOT run: the GitHub API refused')
  })

  it('both copies behave the same, because they are one definition', () => {
    const routes: GhRoute[] = [
      { m: 'rate_limit', r: [{ out: `0 ${nowSec() + 3000}` }] },
      { m: 'deployments?', r: [RATE_LIMITED] },
    ]
    expect(runResolver(routes, 'lighthouse').status).toBe(1)
  })

  it('waits out a quota that comes back inside the 12-minute window, then resolves', () => {
    const r = runResolver([
      { m: 'rate_limit', r: [{ out: `0 ${nowSec() + 60}` }] },
      { m: 'commits/', r: [{ out: '' }] },
      { m: '/statuses', r: [{ out: 'https://frequency-abc.vercel.app' }] },
      { m: 'deployments?', r: [RATE_LIMITED, { out: '11' }] },
    ])
    expect(r.status, r.log).toBe(0)
    expect(r.output).toContain('ready=true')
    expect(r.output).toContain('url=https://frequency-abc.vercel.app')
    // It slept until the reset (plus five seconds), not the 20 s poll.
    expect(r.sleeps[0]).toBeGreaterThanOrEqual(55)
    expect(r.sleeps[0]).toBeLessThanOrEqual(66)
    expect(r.log).toContain('::warning title=GitHub API quota spent::')
  })

  it('retries a refusal that is not the quota (a 5xx) on the normal 20 s cadence', () => {
    const r = runResolver([
      { m: 'rate_limit', r: [{ out: `4000 ${nowSec() + 3000}` }] },
      { m: '/statuses', r: [{ out: 'https://frequency-abc.vercel.app' }] },
      { m: 'deployments?', r: [{ code: 1, out: '{"message":"Server Error"}', err: 'gh: HTTP 502' }, { out: '11' }] },
    ])
    expect(r.status, r.log).toBe(0)
    expect(r.output).toContain('url=https://frequency-abc.vercel.app')
    expect(r.sleeps).toEqual([20])
  })

  it('a refusal that outlasts the window fails, even when the quota is not the reason', () => {
    const r = runResolver([
      { m: 'rate_limit', r: [{ out: `4000 ${nowSec() + 3000}` }] },
      { m: 'deployments?', r: [{ code: 1, out: '{"message":"Server Error"}', err: 'gh: HTTP 502' }] },
    ])
    expect(r.status, r.log).toBe(1)
    expect(r.output).not.toContain('ready=')
    expect(r.log).toContain('refused the last read')
  })

  it('a classification the API refused to answer is not "nothing is building"', () => {
    const r = runResolver([
      { m: 'rate_limit', r: [{ out: `4000 ${nowSec() + 3000}` }] },
      { m: 'commits/', r: [RATE_LIMITED] },
      { m: 'deployments?', r: [{ out: '' }] },
    ])
    expect(r.status, r.log).toBe(1)
    // The quiet green is exactly what a refused classification must not reach.
    expect(r.output).not.toContain('ready=false')
    expect(r.log).toContain('checking whether a build is still in flight')
  })

  it('keeps the quiet green when the API answered and there is genuinely nothing', () => {
    const r = runResolver([
      { m: 'commits/', r: [{ out: '' }] },
      { m: 'deployments?', r: [{ out: '' }] },
    ])
    expect(r.status, r.log).toBe(0)
    expect(r.output).toContain('ready=false')
    expect(r.sleeps).toHaveLength(36)
    expect(r.sleeps.every((s) => s === 20)).toBe(true)
  })

  it('still fails a build in flight, from the commit status alone', () => {
    const r = runResolver([
      { m: 'commits/', r: [{ out: 'pending' }] },
      { m: 'deployments?', r: [{ out: '' }] },
    ])
    expect(r.status, r.log).toBe(1)
    expect(r.log).toContain('::error title=Preview never resolved::')
  })

  it('only a URL is a URL: an environment_url that is not one fails the step', () => {
    const r = runResolver([
      { m: '/statuses', r: [{ out: NOT_FOUND }] },
      { m: 'deployments?', r: [{ out: '11' }] },
    ])
    expect(r.status, r.log).toBe(1)
    expect(r.output).not.toContain('ready=true')
    expect(r.log).toContain('::error title=Preview URL is not a URL::')
  })

  it('no gh read in either copy can swallow its own failure', () => {
    // The shape of the defect: `gh api … || true`. Every read now goes through read_api.
    for (const job of ['pr-compare', 'lighthouse'] as const) {
      const lines = resolverScript(job).split('\n').filter((line) => /\bgh api\b/.test(line) && !/^\s*#/.test(line))
      for (const line of lines) expect(line).not.toMatch(/\|\|\s*true/)
    }
  })
})

describe('🔴 Playwright refuses to start without a usable base URL (HYG-151)', () => {
  it('refuses an error body, a bare path and a scheme-less host, anywhere', () => {
    for (const base of [NOT_FOUND, '/discover', 'frequency-abc.vercel.app', 'https://']) {
      expect(() => refuseUnusableBaseUrl({ PW_BASE_URL: base })).toThrow(/not an http\(s\) URL/)
    }
  })

  it('refuses an empty base on GitHub Actions, where it came from a step output that was empty', () => {
    expect(() => refuseUnusableBaseUrl({ PW_BASE_URL: '', GITHUB_ACTIONS: 'true' })).toThrow(/HYG-151/)
  })

  it('leaves the local skip alone, and accepts a real preview or dev server', () => {
    expect(() => refuseUnusableBaseUrl({})).not.toThrow()
    expect(() => refuseUnusableBaseUrl({ PW_BASE_URL: '' })).not.toThrow()
    expect(() => refuseUnusableBaseUrl({ PW_BASE_URL: 'https://frequency-abc.vercel.app', GITHUB_ACTIONS: 'true' })).not.toThrow()
    expect(() => refuseUnusableBaseUrl({ PW_BASE_URL: 'http://localhost:3000' })).not.toThrow()
  })

  it('and the lighthouse step refuses an unusable PREVIEW_URL before it audits', () => {
    const step = wf.slice(wf.indexOf('      - name: Lighthouse (synthetic speed)'))
    const guard = step.indexOf('[[ "${PREVIEW_URL}" =~ ^https://')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(step.indexOf('npx --yes @lhci/cli'))
  })
})

// ── The turnstile, run for real against a fake Actions API ──────────────────────────────────────

type FakeRun = { id: number; run_number: number; path: string; head_branch: string }
type FakeJob = { name: string; status: string; steps?: { name: string; status: string }[] }

function turnstileBody(): string {
  const script = [...wf.matchAll(TURNSTILE_RE)][0][0]
  return script
    .split('\n')
    .map((line) => line.slice(12))
    .join('\n')
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<void>

/** Look `looks` times (or until the script ends) and report what each look cost. */
async function runTurnstile(opts: {
  runs: FakeRun[]
  jobs: Record<number, FakeJob[]>
  looks: number
  refuse?: (call: string) => unknown
}) {
  let clock = 1_790_000_000_000
  const calls: string[][] = [[]]
  const gaps: number[] = []
  const info: string[] = []
  const warnings: string[] = []
  const github = {
    rest: { actions: { listWorkflowRunsForRepo: 'repoRuns', listWorkflowRuns: 'fileRuns', listJobsForWorkflowRun: 'jobs' } },
    paginate: async (kind: string, params: { run_id?: number; workflow_id?: string }) => {
      calls[calls.length - 1].push(kind === 'jobs' ? `jobs:${params.run_id}` : kind)
      const refusal = opts.refuse?.(kind)
      if (refusal) throw refusal
      if (kind === 'jobs') return opts.jobs[params.run_id as number] ?? []
      if (kind === 'fileRuns') return opts.runs.filter((run) => run.path.endsWith(`/${params.workflow_id}`))
      return opts.runs
    },
  }
  const core = {
    info: (m: string) => info.push(m),
    warning: (m: string) => warnings.push(m),
    setOutput: () => {},
    summary: { addRaw() { return this }, write: async () => {} },
  }
  const fakeSetTimeout = (resolve: () => void, ms: number) => {
    gaps.push(ms)
    clock += ms
    if (gaps.length >= opts.looks) throw new Error('STOP')
    calls.push([])
    resolve()
  }
  const env = {
    TURNSTILE_JOB: 'pr-compare',
    TURNSTILE_PEERS: 'pr-compare,smoke,update-baselines,update-a11y,visual',
    TURNSTILE_WORKFLOWS: 'e2e.yml,e2e-manual.yml',
    TURNSTILE_MAX_MINUTES: wf.match(/TURNSTILE_MAX_MINUTES: '(\d+)'/)?.[1] ?? '',
    TURNSTILE_POLL_SECONDS: wf.match(/TURNSTILE_POLL_SECONDS: '(\d+)'/)?.[1] ?? '',
  }
  const fn = new AsyncFunction('github', 'context', 'core', 'process', 'setTimeout', 'Date', turnstileBody())
  let ended = true
  try {
    await fn(github, { repo: { owner: 'o', repo: 'r' }, runId: 1000, runNumber: 100 }, core, { env }, fakeSetTimeout, { now: () => clock })
  } catch (error) {
    if ((error as Error).message !== 'STOP') throw error
    ended = false
  }
  return { calls, gaps, info, warnings, ended }
}

const E2E = '.github/workflows/e2e.yml'
const run = (n: number, path = E2E): FakeRun => ({ id: n * 10, run_number: n, path, head_branch: `b${n}` })
const job = (turnstile: 'completed' | 'in_progress', name = 'pr-compare'): FakeJob => ({
  name,
  status: 'in_progress',
  steps: [{ name: `Turnstile (wait for other ${name} captures)`, status: turnstile }],
})

/** One capture (#90) and nine older waiters ahead of #100, three newer behind it, and CI noise. */
function queue() {
  const runs = [run(90), ...[91, 92, 93, 94, 95, 96, 97, 98, 99].map((n) => run(n)), run(100), run(101), run(102), run(103), run(400, '.github/workflows/ci.yml')]
  const jobs: Record<number, FakeJob[]> = { 900: [job('completed'), job('completed', 'lighthouse')] }
  for (const n of [91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102, 103]) jobs[n * 10] = [job('in_progress')]
  return { runs, jobs }
}

describe('🔴 the turnstile spends a fraction of the quota it used to (HYG-151)', () => {
  it('one look costs one runs read and one jobs read, however long the queue', async () => {
    const r = await runTurnstile({ ...queue(), looks: 1 })
    // Before: a runs read per workflow file plus a jobs read for all 13 other in-progress runs.
    expect(r.calls[0]).toEqual(['repoRuns', 'jobs:900'])
    expect(r.info[0]).toContain('pr-compare run #90 (b90: capturing)')
  })

  it('the gap between looks stretches with the queue: 2 minutes next in line, 6 minutes far back', async () => {
    const far = await runTurnstile({ ...queue(), looks: 1 })
    expect(far.gaps[0]).toBe(360_000)
    const next = await runTurnstile({ runs: [run(90), run(100)], jobs: { 900: [job('completed')] }, looks: 1 })
    expect(next.gaps[0]).toBe(120_000)
  })

  it('the arithmetic in the ADR: ten waiters cost about 250 requests an hour, not 14,400', async () => {
    let perHour = 0
    for (let ahead = 1; ahead <= 10; ahead += 1) {
      const runs = [run(90), ...Array.from({ length: ahead - 1 }, (_, i) => run(91 + i)), run(100)]
      const jobs: Record<number, FakeJob[]> = { 900: [job('completed')] }
      for (let i = 0; i < ahead - 1; i += 1) jobs[(91 + i) * 10] = [job('in_progress')]
      const r = await runTurnstile({ runs, jobs, looks: 1 })
      perHour += r.calls[0].length * (3_600_000 / r.gaps[0])
    }
    expect(perHour).toBe(250)
  })

  it('a newer run seen waiting twice is not read again; a newer run capturing keeps being read', async () => {
    const runs = [run(100), run(101), run(102)]
    const jobs = { 1010: [job('in_progress')], 1020: [job('completed')] }
    const r = await runTurnstile({ runs, jobs, looks: 3 })
    expect(r.calls[0]).toEqual(['repoRuns', 'jobs:1010', 'jobs:1020'])
    expect(r.calls[1]).toEqual(['repoRuns', 'jobs:1010', 'jobs:1020'])
    expect(r.calls[2]).toEqual(['repoRuns', 'jobs:1020'])
    // Rule 3 unchanged: a newer run that is already capturing is still ahead.
    expect(r.info[0]).toContain('run #102 (b102: capturing)')
  })

  it('clears when nothing is ahead, and still ignores its own run and other workflows', async () => {
    const r = await runTurnstile({ runs: [run(100), run(400, '.github/workflows/ci.yml')], jobs: { 4000: [job('completed')] }, looks: 5 })
    expect(r.ended).toBe(true)
    expect(r.calls[0]).toEqual(['repoRuns'])
    expect(r.info.at(-1)).toContain('clear on poll 1')
  })

  it('rule 6: a spent quota is waited out until its reset, not asked again at full rate', async () => {
    const reset = Math.floor(1_790_000_000_000 / 1000) + 1800
    const r = await runTurnstile({
      runs: [],
      jobs: {},
      looks: 1,
      refuse: () => ({ status: 403, message: 'API rate limit exceeded', response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } } }),
    })
    expect(r.gaps[0]).toBe(1_805_000)
    expect(r.info[0]).toContain('API quota spent')
  })

  it('rule 6 honours retry-after (the secondary limit) the same way', async () => {
    const r = await runTurnstile({ runs: [], jobs: {}, looks: 1, refuse: () => ({ status: 429, message: 'slow down', response: { headers: { 'retry-after': '600' } } }) })
    expect(r.gaps[0]).toBe(600_000)
  })

  it('rule 5 still ends the wait on time when the quota reset lies beyond the bound', async () => {
    const reset = Math.floor(1_790_000_000_000 / 1000) + 7200
    const r = await runTurnstile({
      runs: [],
      jobs: {},
      looks: 10,
      refuse: () => ({ status: 403, message: 'API rate limit exceeded', response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } } }),
    })
    const bound = Number(env('TURNSTILE_MAX_MINUTES')) * 60_000
    expect(r.ended).toBe(true)
    expect(r.gaps.reduce((a, b) => a + b, 0)).toBe(bound)
    expect(r.warnings.join('\n')).toContain('proceeds anyway')
  })

  it('every turnstile, in both files, looks at most every 2 minutes at the head of the queue', () => {
    const polls = [...`${wf}\n${manual}`.matchAll(/TURNSTILE_POLL_SECONDS: '(\d+)'/g)].map((m) => Number(m[1]))
    expect(polls).toHaveLength(6)
    for (const p of polls) expect(p).toBe(120)
  })
})

function env(name: string): string {
  return wf.match(new RegExp(`${name}: '(\\d+)'`))?.[1] ?? ''
}
