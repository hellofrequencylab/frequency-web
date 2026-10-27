import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
const probe = resolve('scripts/probes/dawn-axes-css.mjs')
const css = readFileSync('app/globals.css', 'utf8')
it('the actual owner successor probe passes the retired stylesheet', () => {
  expect(execFileSync(process.execPath, [probe], { encoding: 'utf8' })).toContain('no generation or occasion selectors')
})
it.each(['[data-generation="bold"]{--type-scale:2}', '.dark [data-occasion="solstice"]{--color-primary:red}', '[data-generation]{--motion-base:3s}'])('the actual successor probe rejects restored live selector %s', (rule) => {
  const dir = mkdtempSync(join(tmpdir(), 'frequency-retired-css-'))
  try {
    mkdirSync(join(dir, 'app'))
    writeFileSync(join(dir, 'app/globals.css'), css + '\n' + rule)
    const result = spawnSync(process.execPath, [probe], { cwd: dir, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('selector(s) left')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
