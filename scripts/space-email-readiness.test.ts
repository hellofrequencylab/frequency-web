import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

describe('Space email readiness operator evidence', () => {
  it('passes the aggregate privacy, consent and executable CLI consequences', () => {
    const result = spawnSync(process.execPath, ['--test', 'scripts/space-email-readiness.test.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 25_000,
    })
    expect(result.error, result.stderr).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toMatch(/pass 11/)
  })
})
