// The shared-baseline list, held to the committed folder (SCAN-1222).
//
// A `.test.ts` file, so vitest runs it and Playwright (`testMatch: '**/*.spec.ts'`) does not.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planDedupe } from '../../scripts/dedupe-visual-baselines.mjs'
import {
  BASELINE_DIR,
  baselineNameFor,
  readSharedBaselines,
  sharedEntryProblem,
} from './shared-baselines'

const shared = readSharedBaselines()
const files = readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.png'))

describe('the committed shared-baseline list', () => {
  it('only maps a midnight-light baseline to the dawn-light file of the same surface and project', () => {
    const problems = Object.entries(shared).flatMap(([file, standIn]) => sharedEntryProblem(file, standIn) ?? [])
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('points every entry at a PNG that is committed', () => {
    const missing = Object.entries(shared)
      .filter(([, standIn]) => !existsSync(join(BASELINE_DIR, standIn)))
      .map(([file, standIn]) => `${file} -> ${standIn} (missing)`)
    expect(missing, missing.join('\n')).toEqual([])
  })

  it('agrees with the folder: no duplicate on disk, no entry the script would drop or add', () => {
    // The same plan the capture workflow runs before it commits. If this fails after a capture,
    // run `node scripts/dedupe-visual-baselines.mjs` and commit what it changes.
    const plan = planDedupe(files, shared, (name: string) => readFileSync(join(BASELINE_DIR, name)))
    expect(plan.remove).toEqual([])
    expect(plan.shared).toEqual(shared)
  })
})

describe('baselineNameFor', () => {
  const list = { 'about--midnight-light-desktop.png': 'about--dawn-light-desktop.png' }
  const absent = () => false

  it('reads a listed midnight-light baseline from its dawn-light file', () => {
    expect(
      baselineNameFor('about--midnight-light.png', 'desktop', { capturing: false, shared: list, ownFileExists: absent }),
    ).toBe('about--dawn-light.png')
  })

  it('keeps the own name for another project, an unlisted surface, and the dawn-light state', () => {
    const options = { capturing: false, shared: list, ownFileExists: absent }
    expect(baselineNameFor('about--midnight-light.png', 'mobile', options)).toBe('about--midnight-light.png')
    expect(baselineNameFor('pricing--midnight-light.png', 'desktop', options)).toBe('pricing--midnight-light.png')
    expect(baselineNameFor('about--dawn-light.png', 'desktop', options)).toBe('about--dawn-light.png')
  })

  it('never shares on a capture run, so every state writes its own file', () => {
    expect(
      baselineNameFor('about--midnight-light.png', 'desktop', { capturing: true, shared: list, ownFileExists: absent }),
    ).toBe('about--midnight-light.png')
  })

  it('prefers the own file once one is committed again', () => {
    expect(
      baselineNameFor('about--midnight-light.png', 'desktop', { capturing: false, shared: list, ownFileExists: () => true }),
    ).toBe('about--midnight-light.png')
  })

  it('refuses an entry that points anywhere but the dawn-light twin', () => {
    expect(() =>
      baselineNameFor('about--midnight-light.png', 'desktop', {
        capturing: false,
        shared: { 'about--midnight-light-desktop.png': 'home--dawn-light-desktop.png' },
        ownFileExists: absent,
      }),
    ).toThrow(/must point at about--dawn-light-desktop\.png/)
  })
})

describe('planDedupe', () => {
  const bytes = (s: string) => Buffer.from(s)
  it('folds an identical pair, leaves a differing pair, and unlists an entry whose own file came back different', () => {
    const disk: Record<string, Buffer> = {
      'a--dawn-light-desktop.png': bytes('same'),
      'a--midnight-light-desktop.png': bytes('same'),
      'b--dawn-light-desktop.png': bytes('one'),
      'b--midnight-light-desktop.png': bytes('two'),
      'c--dawn-light-mobile.png': bytes('c'),
    }
    const plan = planDedupe(
      Object.keys(disk),
      {
        'b--midnight-light-desktop.png': 'b--dawn-light-desktop.png',
        'c--midnight-light-mobile.png': 'c--dawn-light-mobile.png',
        'gone--midnight-light-mobile.png': 'gone--dawn-light-mobile.png',
      },
      (name: string) => disk[name] ?? null,
    )
    expect(plan.remove).toEqual(['a--midnight-light-desktop.png'])
    expect(plan.shared).toEqual({
      'a--midnight-light-desktop.png': 'a--dawn-light-desktop.png',
      'c--midnight-light-mobile.png': 'c--dawn-light-mobile.png',
    })
  })
})
