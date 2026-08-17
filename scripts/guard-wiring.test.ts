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

/** Scripts that deliberately run nowhere. Every entry needs a REASON, and the list should shrink.
 *
 *  ✅ EMPTY as of 2026-08-12, and that is the intended steady state. Its only occupant was
 *  `check:research-freshness`, which ran in no workflow and whose own output ended "Nothing a PR
 *  can fix, which is why this exits 0" — it could not fail — while FOUR docs claimed it warned in
 *  CI. It was deleted rather than wired (ADR-1011). Prefer that outcome to a long-lived entry
 *  here: a guard nobody runs is a claim nobody checks. */
const UNWIRED: Record<string, string> = {}

/** ── THE FOURTH HOME: enforced by a vitest test (ADR-1011) ────────────────────────────────────
 *
 *  Six guards left ci.yml's `guards=( )` array on 2026-08-12 because each only READS SOURCE FILES
 *  AND ASSERTS A WIRING PROPERTY — which is a vitest test. The point is not tidiness: vitest
 *  AUTO-DISCOVERS `*.test.ts`, so a guard that is a test cannot be forgotten in an array, which is
 *  exactly how `check:studio` came to enforce nothing for the whole life of PR #2098. They also
 *  inherit the `test` context, which branch protection already requires.
 *
 *  Their `package.json` scripts STAY: a dozen docs cite `pnpm check:vocab` and friends as the local
 *  command, the CLI prints the friendly report with the fix instructions, and deleting an alias to
 *  tidy a list would break every one of those instructions. So this map is what tells the meta-guard
 *  their absence from the array is deliberate.
 *
 *  ⚠️ IT IS A DECLARATION, NOT A HEURISTIC, and that is on purpose. "Some test file imports this
 *  script" would be too weak: several guards have sibling tests that only exercise pure classifiers
 *  against fixtures and never touch the real tree, so dropping one from the array would silently
 *  still pass. Naming the file here is a deliberate, reviewable act; the test below then checks the
 *  named file EXISTS and actually imports the script, so the claim cannot rot into a lie. */
const VITEST_ENFORCED: Record<string, string> = {
  'check:crm-parity': 'scripts/check-crm-parity.test.ts',
  'check:vocab': 'scripts/check-vocab.test.ts',
  'check:studio': 'scripts/check-studio.test.ts',
  'check:elements': 'scripts/check-elements.test.ts',
  'check:render-path': 'scripts/check-render-path.test.ts',
  'check:creates': 'scripts/check-creates.test.ts',
  // Added 2026-08-17 (HYG-004). Reads docs/ARCHITECTURE.md + the real tree and asserts every
  // path/route/cron the doc names exists — pure source reading, so vitest is its home by the
  // rule above rather than a 23rd entry in the ci.yml array.
  'check:arch-doc': 'scripts/check-arch-doc.test.ts',
  // Added 2026-08-17 (LIVE-020). The function sibling of check:grants: it replays
  // supabase/migrations/ and compares against scripts/function-grants.txt — source reading only,
  // so vitest is its home by the rule above. Its sibling test does BOTH halves: broken fixtures
  // asserting each arm FAILS (including that `revoke ... from public` does not satisfy an
  // `internal` verdict, which is the whole point of the guard), plus real-tree assertions
  // including that the guard exits 0 on the tree as committed.
  'check:function-grants': 'scripts/check-function-grants.test.ts',
}

function packageScripts(): Record<string, string> {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts
}

/** Every workflow file, with COMMENT LINES STRIPPED.
 *
 *  ⚠️ Stripping comments is load-bearing, and this test found out the hard way. Both `ci.yml` and
 *  `maintenance.yml` MENTION guards by name in prose explaining why advisory findings should not
 *  block a merge — `check:research-freshness` was named in both while running nowhere, and a naive
 *  substring search over the raw YAML reported it as wired. The first version of this test passed
 *  it. A guard being *discussed* in a comment is the opposite of it being wired, and a meta-guard
 *  that cannot tell those apart is itself the vacuous-pass bug it was written to prevent.
 *
 *  ci.yml still names the seven guards that MOVED to vitest, in the comment explaining why the
 *  array is 20 and not 28 — so this stripping is what keeps those mentions from reading as wiring. */
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
    //
    // ⚠️ REVIEWED 2026-08-12 and DELIBERATELY LEFT AT 25. The CI reshuffle that day removed exactly
    // one `check:*` script — check:research-freshness, deleted (ADR-1011) — taking the inventory
    // 32 -> 31. The other seven that changed only changed WHERE they run: six moved to vitest and
    // collective moved to maintenance.yml, and all seven KEPT their package.json scripts, because a
    // dozen docs cite `pnpm check:vocab` and friends and the CLIs print the friendly report. So the
    // floor still sits six below the real count and needed no edit.
    //
    // What this floor is for: catching a package.json this test could not READ, which would make
    // the loop below iterate zero times and report success. It is not an inventory to freeze —
    // lower it only alongside a real deletion, and name the deletion. Never to make a run green.
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

    // 4. a declared vitest home, verified: the named test must exist AND import the guard module,
    //    so a stale declaration fails here rather than quietly standing in for enforcement.
    let inVitest = false
    if (VITEST_ENFORCED[name]) {
      const testPath = path.join(ROOT, VITEST_ENFORCED[name])
      const src = (() => { try { return readFileSync(testPath, 'utf8') } catch { return '' } })()
      const moduleName = path.basename(runsFile ?? '')
      expect(src.length, `${name}: VITEST_ENFORCED names ${VITEST_ENFORCED[name]}, which does not exist.`).toBeGreaterThan(0)
      expect(
        src.includes(`./${moduleName}`),
        `${name}: ${VITEST_ENFORCED[name]} exists but does not import ./${moduleName}, so it cannot be enforcing this guard.`,
      ).toBe(true)
      inVitest = true
    }
    if (inVitest) return

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
        `    · give it a sibling *.test.ts that asserts against the REAL TREE and declare it in\n` +
        `      VITEST_ENFORCED in this file — the preferred home for a guard that only reads\n` +
        `      source and asserts a wiring property, because vitest auto-discovers tests\n` +
        `    · add it to UNWIRED in this file WITH a reason, if it genuinely should not run`,
    ).toBe(true)
  })
})
