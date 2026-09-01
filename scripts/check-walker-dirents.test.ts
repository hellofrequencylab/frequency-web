import { describe, it, expect } from 'vitest'
import { checkThenUseWalkers, scanRepo, cannotOffend } from './walker-dirents.mjs'

// The detector itself lives in scripts/walker-dirents.mjs, imported by BOTH this gate and
// HYG-041's backlog probe (`node scripts/walker-dirents.mjs`), so the two can never drift.
// The full rationale — CodeQL's alert, why the invariant is function-scoped, and the two ways
// this row's first probe under-counted — is in that module's header.

// ── A TREE WALKER ASKS THE FILESYSTEM ONCE ──────────────────────────────────────────────────────
//
// 🔴 WHERE THIS CAME FROM. CodeQL raised two high-severity `js/file-system-race` alerts on
// scripts/check-metadata-images.test.ts the day it shipped (#2337). Both walks did this:
//
//     const full = path.join(d, entry)
//     if (statSync(full).isDirectory()) { walk(full); continue }
//     const src = readFileSync(full, 'utf8')
//
// The path is resolved once to ask "is this a directory?" and again to open it, and nothing holds
// the answer still between the two. `readdirSync(d, { withFileTypes: true })` returns the entry
// TYPE from the same syscall that returned the NAME, so there is no window because there is no
// second question ([ADR-1185](../docs/DECISIONS.md)).
//
// ⚠️ THE REASON THIS GATE EXISTS RATHER THAN JUST THE SWEEP: CodeQL only alerts on files a PR
// CHANGED. Every unconverted walker was silent until someone edited it, and would then have failed
// a PR about something else entirely, for a walker its author did not write. That is a gate the
// repo can run on every PR instead.
//
// ── THE INVARIANT, and why it is shaped this way ────────────────────────────────────────────────
//
// No FUNCTION may contain both a bare `readdirSync` (one without `withFileTypes`) and a `statSync`.
// If you have the dirents, the type is already in hand; a `statSync` beside them is the
// check-then-use shape by definition. Function scope is what makes this measure the walker rather
// than the file — `scripts/check-backlog.mjs` legitimately stats a CALLER-NAMED root that may be a
// file or a directory, and then walks with dirents from a nested function. One stat on a path this
// repo names is not a race; a stat on a path `readdir` just handed you is.
//
// 🔴 THE FIRST PROBE FOR THIS ROW (HYG-041) UNDER-COUNTED TWICE, and that is why the invariant is
// AST-shaped rather than a regex:
//   · `/statSync\([^)]*\)\.isDirectory\(\)/` missed `statSync(join(ROOT, rel)).isDirectory()` —
//     `[^)]*` cannot cross a nested paren. One walker was invisible.
//   · It also missed the VARIABLE form entirely — `let s; try { s = statSync(p) } catch { continue }`
//     then `if (s.isDirectory())`. Seven more walkers were invisible, in check-canon, check-labels,
//     check-a11y-names, check-collective, check-crm-parity, check-admin-client and dead-exports.
//   The row said "twelve". The true count was TWENTY-ONE, and the text probe found 12 of them.

// The THOROUGH arm: every file carrying both tokens is parsed, with no pre-filter in the way.
// Top-level await — `describe`'s callback is synchronous, so this cannot live inside it.
const thorough = await scanRepo()

describe('a tree walker asks the filesystem once', () => {
  const { scanned, findings } = thorough

  it('no function pairs a bare readdirSync with a statSync', () => {
    expect(
      findings,
      'this function readdirs and then stats what it found — pass { withFileTypes: true } and read entry.isDirectory() instead (ADR-1185)',
    ).toEqual([])
  })

  it('walks a real corpus, so an empty scan cannot pass as compliance', () => {
    // Reading on 2026-09-01: 1,976 files under scripts/ + lib/.
    expect(scanned).toBeGreaterThan(1200)
  })

  it('FIRES on the inline form (positive control)', async () => {
    expect(
      await checkThenUseWalkers(`
        function walk(d) {
          for (const e of readdirSync(d)) {
            const p = join(d, e)
            if (statSync(p).isDirectory()) walk(p)
          }
        }
      `),
    ).toHaveLength(1)
  })

  it('FIRES on the NESTED-PAREN form a [^)]* regex cannot match', async () => {
    expect(
      await checkThenUseWalkers(`
        function walk(dir) {
          for (const f of readdirSync(join(ROOT, dir))) {
            const rel = join(dir, f)
            if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
          }
        }
      `),
    ).toHaveLength(1)
  })

  it('FIRES on the VARIABLE form the first probe missed entirely', async () => {
    expect(
      await checkThenUseWalkers(`
        function walk(dir, out) {
          for (const entry of readdirSync(dir)) {
            const p = join(dir, entry)
            let s
            try { s = statSync(p) } catch { continue }
            if (s.isDirectory()) walk(p, out)
            else out.push(p)
          }
        }
      `),
    ).toHaveLength(1)
  })

  it('does NOT fire on a withFileTypes walk', async () => {
    expect(
      await checkThenUseWalkers(`
        function walk(d, out) {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name)
            if (e.isDirectory()) walk(p, out)
            else out.push(p)
          }
        }
      `),
    ).toEqual([])
  })

  it('does NOT fire when one stat is on a CALLER-NAMED root and the walk uses dirents', async () => {
    // scripts/check-backlog.mjs and lib/marketing/marketing-figures.test.ts both take a root that
    // may legitimately be a file OR a directory. Statting that one path is not a race; the walk
    // beneath it takes every type from the dirent, so the nested function is clean.
    expect(
      await checkThenUseWalkers(`
        function filesUnder(target, acc) {
          if (statSync(target).isFile()) { acc.push(target); return acc }
          const walk = (dir) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              const p = join(dir, entry.name)
              if (entry.isDirectory()) walk(p)
              else acc.push(p)
            }
          }
          walk(target)
          return acc
        }
      `),
    ).toEqual([])
  })

  it("the probe's fast path and the gate's thorough path agree on the real tree", async () => {
    // 🔴 THE PROBE SKIPS FILES A CHEAP REGEX RULES OUT, so that the clean state never loads the
    // TypeScript compiler — 525ms of import against 176ms of actual work, doubled by
    // backlog-contract's with-and-without-ripgrep test, which already fills 78% of its 60s timeout
    // on an idle machine. That shortcut is only safe while it agrees with the arm that enforces.
    // If it ever does not, THIS fails rather than the probe quietly going green on a dirty tree.
    const fast = await scanRepo({ fast: true })
    expect(fast.findings).toEqual(thorough.findings)
    expect(fast.scanned).toBe(thorough.scanned)
  })

  it('the pre-filter is a SUPERSET: it never rules out a real offender', async () => {
    // The one shape that could bite: a fixture inside a template literal is dropped by the
    // pre-filter (this very file is full of them), so prove dropping templates cannot hide a
    // real call sitting outside one.
    const offender = `
      const sample = \`for (const e of readdirSync(d)) { statSync(e) }\`
      function walk(d) {
        for (const e of readdirSync(d)) {
          if (statSync(join(d, e)).isDirectory()) walk(join(d, e))
        }
      }
    `
    expect(cannotOffend(offender), 'a real call outside a template must survive the pre-filter').toBe(false)
    expect(await checkThenUseWalkers(offender)).toHaveLength(1)
  })
})
