// One committed PNG for two render states that photograph byte-identical (SCAN-1222).
//
// On 2026-11-16, 29 of the 51 committed `midnight-light` baselines were byte-for-byte the
// `dawn-light` baseline of the same surface and project: about 99 MB of the 356 MB folder was a
// second copy of a file already in the tree. Those copies are gone, and
// `test/e2e/__screenshots__/shared-baselines.json` names each one and the file that stands in
// for it. The midnight-light TEST still runs and still compares against the same bytes it always
// did; only the file it reads them from moved.
//
// The manifest is explicit on purpose. A rule like "no midnight file, so use the dawn one" would
// turn a baseline that was never captured into a silent pass. A name that is not listed and has
// no file of its own still fails as a missing baseline.
//
// A capture run never shares: every state writes its own file, and
// `scripts/dedupe-visual-baselines.mjs` (run by the capture workflow before it commits) folds
// the ones that came back identical and unlists the ones that no longer are.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BASELINE_DIR = 'test/e2e/__screenshots__/visual.spec.ts'
const SHARED_BASELINES_PATH = 'test/e2e/__screenshots__/shared-baselines.json'

/** `<slug>--midnight-light-<project>.png` -> `<slug>--dawn-light-<project>.png`. */
type SharedBaselines = Readonly<Record<string, string>>

export function readSharedBaselines(root = process.cwd()): SharedBaselines {
  const file = join(root, SHARED_BASELINES_PATH)
  if (!existsSync(file)) return {}
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  const shared = (parsed as { shared?: unknown } | null)?.shared
  if (!shared || typeof shared !== 'object' || Array.isArray(shared)) {
    throw new Error(`${SHARED_BASELINES_PATH} has no \`shared\` object, so no baseline can be resolved through it`)
  }
  return shared as SharedBaselines
}

/** The only shape an entry may take: same surface, same project, midnight-light read from dawn-light. */
export function sharedEntryProblem(file: string, standIn: string): string | null {
  const m = /^(.+)--midnight-light-([a-z]+)\.png$/.exec(file)
  if (!m) return `${file}: only a midnight-light baseline may be shared`
  const expected = `${m[1]}--dawn-light-${m[2]}.png`
  return standIn === expected ? null : `${file}: must point at ${expected}, not ${standIn}`
}

/**
 * The name to hand `toHaveScreenshot` for one capture. `own` is `<slug>--<state>.png`; the config's
 * `snapshotPathTemplate` adds `-<project>` before the extension.
 */
export function baselineNameFor(
  own: string,
  project: string,
  options: { capturing: boolean; shared: SharedBaselines; ownFileExists: (file: string) => boolean },
): string {
  if (options.capturing) return own
  const suffix = `-${project}.png`
  const file = own.replace(/\.png$/, suffix)
  if (options.ownFileExists(file)) return own
  const standIn = options.shared[file]
  if (!standIn) return own
  const problem = sharedEntryProblem(file, standIn)
  if (problem) throw new Error(`${SHARED_BASELINES_PATH}: ${problem}`)
  return `${standIn.slice(0, -suffix.length)}.png`
}
