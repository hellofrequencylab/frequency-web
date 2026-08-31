import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

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
