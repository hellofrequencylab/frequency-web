#!/usr/bin/env node
// LINT TOOLCHAIN PREFLIGHT — prove `pnpm lint` is about to run THIS repo's ESLint.
//
// WHY THIS EXISTS. `pnpm run` prepends exactly one directory to PATH: the relative
// `./node_modules/.bin` of the directory it was invoked in. It does NOT add the ancestor
// `node_modules/.bin` of an outer package. So in any checkout that has no install of its own,
// `eslint` on PATH falls through to whatever ESLint the machine has globally — here
// /opt/node22/bin/eslint, v10.1.0, against a repo that declares ^9.
//
// That is not a clean version error. ESLint 10 changed the rule-context API, so the v10 binary
// loads the v9-resolved plugins out of the nearest node_modules and dies inside one of them:
//
//     TypeError: Error while loading rule 'react/display-name':
//     contextOrFilename.getFilename is not a function
//         at detectReactVersion (.../eslint-plugin-react/lib/util/version.js:85:19)
//
// Nothing in that message names the cause. It reads as a broken React lint rule, and it is
// really "this directory was never installed". Three agent sessions in a row misread it, and
// the wrong diagnosis ("the repo pins the wrong ESLint") propagated into a briefing before
// anyone ran `eslint --version`.
//
// This matters because agent worktrees are the repo's own parallel-build practice
// (docs/NEXT-GEN-CRM.md "Worktree discipline", docs/EVENTS-AUDIT.md) and a `git worktree` never
// inherits node_modules. The SessionStart hook installs in the root it is invoked at, so a
// worktree created for a subagent starts with no install and the very first `pnpm lint` there
// hits the trap.
//
// SO: fail FIRST, and say the true thing. This gate cannot make lint quieter -- it only ever
// refuses to run, and it refuses in exactly the case where the alternative was a crash.

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Decide whether the ESLint that PATH is about to hand us is the repo's own.
 *
 * Pure and injectable so the test can drive both branches without touching a real tree.
 *
 * @param {object} input
 * @param {string} input.cwd                Directory `pnpm lint` was invoked in.
 * @param {string} input.declaredRange      The `eslint` range from package.json devDependencies.
 * @param {(p: string) => boolean} input.exists
 * @param {(p: string) => string} input.readVersion  Installed version, or '' if unreadable.
 * @returns {{ ok: boolean, reason?: 'not-installed' | 'major-mismatch', message?: string }}
 */
export function checkLintToolchain({ cwd, declaredRange, exists, readVersion }) {
  const localBin = join(cwd, 'node_modules', '.bin', 'eslint')

  if (!exists(localBin)) {
    return {
      ok: false,
      reason: 'not-installed',
      message: [
        `This directory has no ESLint of its own, so \`pnpm lint\` would run whichever`,
        `\`eslint\` is on PATH -- a DIFFERENT major, which crashes inside a plugin with a`,
        `message that names a React rule instead of the real cause.`,
        ``,
        `  directory:  ${cwd}`,
        `  missing:    node_modules/.bin/eslint`,
        `  package.json declares eslint ${declaredRange}`,
        ``,
        `Install this directory (a git worktree does not inherit node_modules):`,
        ``,
        `  pnpm install --frozen-lockfile`,
      ].join('\n'),
    }
  }

  // The bin is present, but a stale install can still be the wrong major -- and the wrong
  // major fails the same confusing way, so check the number rather than the file's existence.
  const declaredMajor = declaredRange.replace(/^[^\d]*/, '').split('.')[0]
  const installed = readVersion(join(cwd, 'node_modules', 'eslint', 'package.json'))
  const installedMajor = installed.split('.')[0]

  if (installed && declaredMajor && installedMajor !== declaredMajor) {
    return {
      ok: false,
      reason: 'major-mismatch',
      message: [
        `The installed ESLint is a different major than package.json declares, which fails`,
        `inside a plugin rather than at the version check.`,
        ``,
        `  directory:  ${cwd}`,
        `  installed:  eslint ${installed}`,
        `  declared:   eslint ${declaredRange}`,
        ``,
        `Reinstall from the lockfile:`,
        ``,
        `  pnpm install --frozen-lockfile`,
      ].join('\n'),
    }
  }

  return { ok: true }
}

function readVersionFrom(pkgPath) {
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? ''
  } catch {
    return ''
  }
}

// Run as a script (the `prelint` step). Imported by the test, which calls the pure function.
//
// `import.meta.url === \`file://${process.argv[1]}\`` is the idiom you usually see here and it is
// wrong for this job: it compares an ENCODED URL against a raw path, so a single space or
// non-ASCII character anywhere above the repo makes it false — and a false here means prelint
// exits 0 without checking anything, which is a fail-safe that never fires. Compare real paths.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (invokedDirectly) {
  const cwd = process.cwd()
  const declaredRange =
    JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).devDependencies?.eslint ?? ''

  const result = checkLintToolchain({
    cwd,
    declaredRange,
    exists: existsSync,
    readVersion: readVersionFrom,
  })

  if (!result.ok) {
    console.error(`\n🔴 pnpm lint cannot run here.\n`)
    console.error(result.message)
    console.error('')
    process.exit(1)
  }
}
