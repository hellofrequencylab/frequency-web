import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ── THE META-GUARD: a guard that is not wired into anything enforces nothing ─────────────────
//
// 🔴 THE FAILURE THIS CLOSES, which already happened. `check:studio` and `check:creates` shipped
// as package.json scripts in PR #2098 and were never added to the CI guards array. The Studio
// contract — the thing AGENTS.md calls "machine-enforced" — was enforced by NOTHING for the whole
// life of that PR. Adding a `check:*` script is two edits, and until now the second one was a
// thing you had to remember. `ci.yml` gained a warning comment about it afterwards. A comment is
// not a mechanism; this file is.
//
// ⚠️ IT IS A VITEST TEST, NOT ANOTHER `check:*` SCRIPT, AND THAT IS THE WHOLE POINT. Vitest
// auto-discovers `*.test.ts`, so this meta-guard cannot itself become unwired — which is exactly
// the trap a `check:guard-wiring` script would fall into. It also runs inside `test`, a context
// branch protection already requires.

const ROOT = path.join(import.meta.dirname, '..')
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows')

/** Scripts that deliberately run nowhere. Every entry needs a REASON, and the list should shrink. */
const UNWIRED: Record<string, string> = {
  // Audited 2026-08-12: runs in no workflow, and its own output ends "Nothing a PR can fix, which
  // is why this exits 0" — so it cannot fail. Meanwhile docs/FINALIZE-PLAN.md, UX-MATURITY-PLAN.md
  // and docs/research/PROTOCOL.md all claim it "warns in CI". Three docs describing a guard that
  // does not run is worse than no guard. Delete it or wire it; do not leave it here indefinitely.
  'check:research-freshness':
    'Advisory-only and structurally unable to fail. Slated for deletion — see the CI audit.',
}

function packageScripts(): Record<string, string> {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts
}

/** Every workflow file, with COMMENT LINES STRIPPED.
 *
 *  ⚠️ Stripping comments is load-bearing, and this test found out the hard way. `ci.yml:164` and
 *  `maintenance.yml:127` both MENTION `check:research-freshness` in prose explaining why advisory
 *  findings should not block a merge. A naive substring search over the raw YAML therefore reported
 *  it as wired, and the first version of this test passed it. It runs nowhere. A guard being
 *  *discussed* in a comment is the opposite of it being wired, and a meta-guard that cannot tell
 *  those apart is itself the vacuous-pass bug it was written to prevent. */
function workflowText(): string {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

describe('every check:* script is wired somewhere', () => {
  const scripts = packageScripts()
  const names = Object.keys(scripts).filter((k) => k.startsWith('check:'))

  it('found the scripts, so an empty list cannot pass this suite vacuously', () => {
    // The non-triviality control. Without it, a package.json that failed to parse into scripts
    // would make the loop below iterate zero times and report success — the exact "I never looked"
    // vs "I looked and it was fine" confusion this whole file exists to remove.
    expect(names.length).toBeGreaterThanOrEqual(25)
  })

  it.each(names)('%s runs in CI, in postbuild, or is a declared exception', (name) => {
    const guard = name.slice('check:'.length)
    const wf = workflowText()

    // Three legitimate homes:
    //   1. the `guards=( ... )` array in ci.yml, which runs them by BARE NAME (`authz`, not
    //      `check:authz`) — so match the bare token inside that array specifically, not anywhere.
    //   2. `postbuild`, where the two ARTIFACT gates deliberately live because CI never builds
    //      (ADR-1003) — Vercel does.
    //   3. any other workflow invoking `pnpm check:<name>` directly.
    const arrayBlock = /guards=\(([\s\S]*?)\)/.exec(wf)?.[1] ?? ''
    const inGuardsArray = new RegExp(`(^|\\s)${guard}(\\s|$)`).test(arrayBlock)

    // ⚠️ Match on the FILE the script actually runs, not on the script's name. `check:cron-freshness`
    // runs `node scripts/cron-freshness.mjs` — no `check-` prefix — and `maintenance.yml` invokes
    // that file directly rather than going through pnpm. Both a `check-${guard}.mjs` guess and a
    // `pnpm ${name}` search miss it, and the first version of this test wrongly called it unwired.
    // The script body is the only thing that knows which file a script is.
    const runsFile = /scripts\/[\w.-]+\.(mjs|mts|ts|js)/.exec(scripts[name] ?? '')?.[0]
    const inPostbuild = runsFile ? (scripts.postbuild ?? '').includes(runsFile) : false
    const inAnyWorkflow = wf.includes(name) || (runsFile ? wf.includes(runsFile) : false)

    if (UNWIRED[name]) {
      // A declared exception must ALSO still be genuinely unwired. If someone wires it and forgets
      // to remove the entry, the list rots into a lie about what runs — the same class of stale
      // claim as the three docs that say check:research-freshness runs in CI when it does not.
      expect(
        inGuardsArray || inPostbuild || inAnyWorkflow,
        `${name} is listed in UNWIRED but IS wired now. Remove its entry.`,
      ).toBe(false)
      return
    }

    expect(
      inGuardsArray || inPostbuild || inAnyWorkflow,
      `${name} exists in package.json but runs NOWHERE.\n` +
        `  A guard that is not wired enforces nothing, silently — this is what let check:studio\n` +
        `  and check:creates ship un-enforced through all of PR #2098.\n` +
        `  Fix by one of:\n` +
        `    · add "${guard}" to the guards=( ) array in .github/workflows/ci.yml\n` +
        `    · add it to the postbuild script, if it must measure the built ARTIFACT\n` +
        `    · invoke "pnpm ${name}" from another workflow\n` +
        `    · add it to UNWIRED in this file WITH a reason, if it genuinely should not run`,
    ).toBe(true)
  })
})
