import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { countRawPrimaryButtons, withinRawPrimaryButtonBudget } from './lib/raw-primary-button-count.mjs'

const actualRawAction = readFileSync('scripts/fixtures/raw-primary-buttons/retired-create-action.txt', 'utf8')
describe('the unchanged raw primary-button source budget', () => {
  it('counts an actual retired Create action and distinguishes the shared helper', () => {
    expect(countRawPrimaryButtons([actualRawAction])).toBe(1)
    expect(countRawPrimaryButtons(["<button className={buttonClasses('primary', 'sm')}>Create</button>"])).toBe(0)
  })
  it('keeps the strict boundary at29pass/30fail', () => {
    expect(withinRawPrimaryButtonBudget(Array(29).fill(actualRawAction))).toBe(true)
    expect(withinRawPrimaryButtonBudget(Array(30).fill(actualRawAction))).toBe(false)
  })
  it.each([29, 30])('the actual registered CLI enforces %i source controls', count => {
    const root = mkdtempSync(join(tmpdir(), 'frequency-raw-button-budget-'))
    try {
      mkdirSync(join(root, 'app'))
      writeFileSync(join(root, 'app', 'controls.tsx'), Array(count).fill(actualRawAction).join('\n'))
      const result = spawnSync(process.execPath, [resolve('scripts/probes/meta-scan-2026-10-26.mjs'), 'raw-buttons'], { cwd: root, encoding: 'utf8', timeout: 10000 })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(count < 30 ? 0 : 1)
      expect(result.stdout).toContain(count < 30 ? 'raw-buttons: repaired' : 'raw-buttons: not yet repaired')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
