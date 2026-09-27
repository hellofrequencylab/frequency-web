// ─────────────────────────────────────────────────────────────────────────────────────────────────
// "WAS I RUN, OR WAS I IMPORTED?" — ONE ANSWER, FOR EVERY SCRIPT IN scripts/ (backlog HYG-125).
//
// Most gates in scripts/ are BOTH a module and a command: their sibling `*.test.ts` imports the pure
// functions, and `package.json` runs the same file as a command. The guard at the bottom of each one
// decides which of those is happening, and when it decides WRONG the script's `main()` simply does
// not run: no output, exit 0. For a check script, that reads as a PASS.
//
// 🔴 TWO WAYS THE OLD SPELLINGS GOT IT WRONG, both measured rather than reasoned about.
//
// 1. SYMLINKS. `import.meta.url` is the path Node RESOLVED the module through — the realpath, with
//    every symlink already followed. `process.argv[1]` is whatever was typed, symlinks intact. So
//    `path.resolve(argv[1]) === fileURLToPath(import.meta.url)` is false whenever anything above the
//    script is a link. On macOS `/var` is a symlink to `/private/var`, so ANY script run out of a
//    `mkdtemp` directory compares `/var/folders/.../x.mjs` against `/private/var/folders/.../x.mjs`
//    and never matches. This is not hypothetical: six cases of check-shell-weight's own mutation test
//    were green because the script under test never executed a line.
//
// 2. URL ENCODING. The `` import.meta.url === `file://${process.argv[1]}` `` spelling builds a URL by
//    string concatenation and then compares an ENCODED url against a raw path. One space or one
//    non-ASCII character anywhere above the repo makes it permanently false.
//
// ⚪ WHAT THIS IS NOT, and the row was corrected on this point after measurement: it is NOT a live
// production hole. On Vercel the build path carries no symlink and is ASCII, so these gates do fire
// there. The cost is that none of them can be exercised by a mutation test, and that a developer
// whose checkout sits under a symlink or under a path with a space in it gets a silent pass from all
// of them at once.
//
// ── THE FIX, and why it is shaped this way ───────────────────────────────────────────────────────
//
// Compare REALPATHS on both sides, and decode the URL with `fileURLToPath` rather than string
// surgery — which handles encoding for free. `realpathSync` THROWS on a path that does not exist,
// which happens for real in fixtures and in `--root` style invocations, so each side falls back to
// `path.resolve`; a missing path resolving to itself is still the right comparison.
//
// ⚠️ THIS MUST NOT CHANGE *WHEN* main() RUNS. It only makes the comparison correct. A script that
// was imported still returns false here, which is the entire reason the guard exists.
//
// Frozen against re-introduction by scripts/invoked-directly.test.ts, which fails on any scripts/*.mjs
// that compares `process.argv[1]` to `import.meta.url` by hand instead of calling this.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The realpath of `p`, or its resolved form when `p` does not exist on disk. */
function real(p) {
  try {
    return realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

/**
 * True when the module at `importMetaUrl` is the entry point Node was started with.
 *
 * @param {string} importMetaUrl the caller's own `import.meta.url`
 * @returns {boolean}
 */
export function invokedDirectly(importMetaUrl) {
  if (!process.argv[1]) return false
  return real(process.argv[1]) === real(fileURLToPath(importMetaUrl))
}
