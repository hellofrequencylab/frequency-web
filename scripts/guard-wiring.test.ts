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
const UNWIRED: Record<string, string> = {
  // LIVE-035. Both are ARTIFACT gates: they read `.next` from a real build, so the CI array is the
  // wrong home (CI never builds — DEPLOY-SAFETY.md, ADR-1003) and `postbuild` is the right one.
  // Neither is there, and on 2026-08-18 `check:cache-budget` was wired in and then TAKEN BACK OUT
  // before merge, because a preview build printed what no amount of reading could:
  //
  //     ⚠️  check:cache-budget — TRIMMED the build cache before Vercel could reject it.
  //        What the build was about to hand back measured 2.40 GiB, over the 1.38 GiB trim point.
  //        drops the cheap half instead: .next/cache/turbopack (1520 MiB).
  //
  // The gate compared RAW bytes on disk against Vercel's PACKED ceiling, ~2:1 apart rather than the
  // ~3% its header assumed, and its trim dropped directories biggest-first, which is how it reached
  // the incremental fetch cache and hung the next two builds for 46 minutes each. BOTH are fixed
  // (ADR-1086, LIVE-048): the trim iterates a named compiler-cache list, and the threshold converts
  // through PACKED_PER_RAW. It stays here anyway, because a fixed gate is still a gate that has
  // never run on a real artifact, and that is the whole reason this list exists.
  //
  // `check:shell-weight` has never printed at all. Its one reading exited 1 naming
  // lib/pricing/feature-meters.ts, on an artifact built plausibly BEFORE settings-panel.tsx moved
  // five editor bodies behind `dynamic()`, so it is unconfirmed in BOTH directions.
  //
  // ── AND IT LEFT THIS LIST TOO, on 2026-08-19, by the same route its sibling took ────────────
  // It is now in `postbuild` as `--warn-only`. That is what breaks the deadlock: a gate whose only
  // reading is unconfirmed in both directions can only be settled by running on a real artifact,
  // and running it BLOCKING to find out is the incident this list exists to prevent. In warn-only
  // it measures, prints, and cannot exit non-zero on any arm, on a missing manifest, or on its own
  // crash -- proven by mutation in scripts/check-shell-weight-warn-only.test.ts, which also caught
  // a real hole while it was being written (the crash handler was installed too late to catch a
  // top-level throw, and that ordering is now asserted).
  //
  // ✅ AND PROMOTED, 2026-08-19, exactly that way. The gate printed green on two production
  // artifacts (17:14Z and 18:13Z: 1010 KB of the 1400 KB budget across 21 chunks, all 8 admin
  // module bodies lazy, positive control present), the owner said "promote it", and the promotion
  // change carried the preview build whose postbuild printed it BLOCKING-green. The two warn-only
  // pins inverted in that same change, so a re-added flag now fails as a silent demotion.
  //
  // The rule these two keep proving: DEPLOY-SAFETY.md opens with an outage caused by gates that
  // passed while the artifact was broken, and wiring an UNPROVEN gate into postbuild is that failure
  // reversed. One green build decides it, and the wiring lands in the SAME commit as that build.
  //
  // ── check:cache-budget LEFT THIS LIST on 2026-08-19 (LIVE-035, owner-approved) ───────────────
  // It is now in `postbuild` as `--warn-only`, which breaks the deadlock rather than ignoring it.
  // The deadlock was real: the only thing that settles PACKED_PER_RAW is a reading from a real
  // production artifact, and the only way to take that reading was to run on a real build. In
  // warn-only the script measures and prints, never trims, and cannot exit non-zero -- not on the
  // node_modules floor and not on its own crash, which is proven by mutation in this repo rather
  // than asserted. So it cannot repeat what it did on 2026-08-18 while it earns its number.
  //
  // ⚠️ WARN-ONLY IS A STAGE, NOT A DESTINATION. A gate that only warns is one everyone learns to
  // scroll past (ADR-970; check:adoption sat red on main for two days proving it again the same
  // week). LIVE-029 stayed OPEN through the warn-only stage, because until promotion nothing
  // prevented a cache overflow.
  //
  // ✅ AND PROMOTED, 2026-08-19, by the same route as its sibling. The warn-only run printed the
  // paired reading (raw measure beside the same build's "Uploading build cache" line) that settled
  // PACKED_PER_RAW at 0.53 (measured 0.5254, rounded toward firing early), the trim was proven by
  // mutation to reach ONLY the named compiler caches (scripts/check-cache-budget-trim.test.ts,
  // including a reconstruction of the 2026-08-18 size-sorted mutant that a discriminating fixture
  // catches), the owner said "implement best practice", and the promotion change carried the
  // preview build whose postbuild printed it BLOCKING-green. The warn-only pin inverted in that
  // same change, so a re-added flag now fails as a silent demotion.

  // ── check:mail-dns — NOT A GATE, and must never become one (OWN-020, 2026-08-25) ─────────────
  'check:mail-dns':
    'It measures LIVE PUBLIC DNS for the sending domain (SPF on send.frequencylocal.com, the ' +
    'Resend DKIM key length, apex DMARC), which is state NO pull request can change. Wiring it ' +
    'into the guards array would fail builds on the contents of a GoDaddy zone, so a red run ' +
    'would carry no information about the diff that triggered it — the inverse of ADR-970: not a ' +
    'gate that cannot fire honestly, but one that fires on something the change never touched. ' +
    'It is also non-hermetic (an offline runner would read a missing record as a failure, which ' +
    'is why the script itself exits 2 rather than 1 when the resolver is unreachable). Its home ' +
    'is an operator command and the evidence line on OWN-020, which is a `manual` row precisely ' +
    'because nothing in the repo can close it. Run `pnpm check:mail-dns` when the row is worked.',
}

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
  // Added 2026-08-17 (LIVE-028, ADR-1055). Its CLI half is pure node and cannot read the TSX
  // block registry, so the ENFORCING arm — "every block type in stored page data resolves against
  // the live config.components" — has to run under vitest, where the registry is importable. The
  // sibling test drives the shared classifier against broken fixtures for every arm (including
  // the real census with its quarantine stripped, which must still name all five orphans) as well
  // as against the real tree, so neither half can go quietly vacuous.
  'check:stored-blocks': 'scripts/check-stored-blocks.test.ts',
  // Added 2026-08-25. Measures whether design_handoff/dawn/ is the round design_handoff/CHANGES.md
  // describes. Pure file reading, so vitest is its home; and its sibling test calls run() directly
  // rather than spawning node, because a probe that spawns a runner is what LIVE-034 exists about.
  // The guard fails BOTH ways on purpose: a re-exported bundle that leaves the divergence ledger
  // and PROD-AHEAD.md behind is the dangerous direction, since a refreshed colors.css silently
  // closes five declared divergences and the sheet would go on asking DAWN to apply them.
  'check:dawn-bundle': 'scripts/check-dawn-bundle.test.ts',
  // Added 2026-08-25 (PROG-E0, ADR-1129). The entity-block twin of check:stored-blocks and the
  // same split for the same reason: the CLI half is pure node and cannot import the TSX entity
  // registry, so the ENFORCING arm — every stored EntityLayout type resolves against the live
  // registry, kind legality included — runs under vitest, where the registry is importable. The
  // sibling test drives both halves against broken fixtures AND the frozen structural corpus of
  // the 37 production documents, with non-vacuity proofs on each arm.
  'check:entity-layouts': 'scripts/check-entity-layouts.test.ts',
  // Added 2026-08-17 (LIVE-023, ADR-1058). Reads test/e2e/a11y-baselines.json and asserts the
  // ratchet's numbers are what they claim to be: a bare integer is a READING checked with
  // equality, and anything weaker is a declared ceiling carrying a written reason and provenance.
  // Pure file reading, so vitest is its home by the rule above. Its sibling test drives every arm
  // with a fixture that must FAIL — including the hand-edit guard in both directions — as well as
  // the real tree, so it cannot go quietly vacuous.
  'check:a11y-baselines': 'scripts/check-a11y-baselines.test.ts',
  // Added 2026-08-17 (LIVE-013). Same split as check:stored-blocks, for the same reason: the CLI
  // half is pure node and can only PARSE the render registry (lib/store/cosmetics.ts is
  // TypeScript), so the enforcing arm — "every purchasable cosmetic/title SKU on the live shelf
  // resolves to something the product paints" — runs under vitest where the registry is
  // importable. Its sibling test cross-checks the parser against the live module (the parser
  // shipped a real false-positive on its first run, reading a type annotation as the record) and
  // drives every arm against fixtures that must FAIL, plus the real shelf census.
  'check:cosmetic-renders': 'scripts/check-cosmetic-renders.test.ts',
  // Added 2026-08-24 (LIVE-067). It reads lib/widgets/modules.ts, lib/widgets/registry.tsx and the
  // whole app/ tree and asserts a wiring property — every registered layout module is one a page
  // mounts or imports — so vitest is its home by the rule above. Its sibling test drives every arm
  // against fixtures that must FAIL, including a reconstruction of the pre-retirement tree, and
  // cross-checks both source parsers against the real TypeScript modules so a parser that stops
  // matching cannot turn the guard green.
  'check:module-reachability': 'scripts/check-module-reachability.test.ts',
  // Added 2026-08-31 (HYG-036, ADR-1178). It walks app/ and components/ for a <Link> whose
  // className carries `truncate` without an explicit display class — an inline <a> on which two
  // thirds of `truncate` do not apply and the surviving `white-space: nowrap` widens the
  // min-content floor of every flex/grid track above it. Source-only, so vitest is its home by the
  // rule above. Its sibling test drives the detector against fixtures that must FAIL, including
  // flex-1 / flex-col / flex-wrap — the three tokens whose misreading as `display: flex` made the
  // FIRST version of this audit report all six broken files as fine.
  'check:link-truncate': 'scripts/check-link-truncate.test.ts',
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
