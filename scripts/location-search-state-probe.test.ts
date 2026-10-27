import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const component = 'components/circles/circle-location-search.tsx'
function runProbe(edit?: { file: string; from: string; to: string }) {
  const root = mkdtempSync(join(tmpdir(), 'frequency-location-probe-'))
  try {
    for (const file of [component, 'components/ui/button.tsx', 'lib/utils.ts']) {
      let source = readFileSync(file, 'utf8')
      if (edit?.file === file) {
        expect(source).toContain(edit.from)
        source = source.replace(edit.from, edit.to)
      }
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), source)
    }
    return spawnSync(process.execPath, [resolve('scripts/probes/location-search-state.mjs')], { cwd: root, encoding: 'utf8', timeout: 20000 })
  } finally { rmSync(root, { recursive: true, force: true }) }
}
describe('actual city-search runtime probe dependency graph', () => {
  it('runs the actual component with the real shared button and class helper', () => {
    const result = runProbe()
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
  })
  it('still fails when a stale provider answer can overwrite the current search', () => {
    const result = runProbe({ file: component, from: 'if (ctrl.signal.aborted) return', to: '/* intended regression: allow old result publication */' })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Stale city results must not replace current search')
  })
  it('fails if the actual class helper drops button geometry', () => {
    const result = runProbe({ file: 'lib/utils.ts', from: "return classes.filter(Boolean).join(' ')", to: "return ''" })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Actual shared button helper must retain btn')
  })
})
