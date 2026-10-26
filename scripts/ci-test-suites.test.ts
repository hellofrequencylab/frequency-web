import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

const runner = path.resolve('scripts/ci-test-suites.mjs')
function exercise(first: number, second: number, signal = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'ci-test-partitions-'))
  try {
    mkdirSync(path.join(root, 'bin'))
    writeFileSync(path.join(root, 'bin/pnpm'), `#!/usr/bin/env node\nconst fs=require('node:fs'); const args=process.argv.slice(2); fs.appendFileSync(process.env.CALLS,JSON.stringify(args)+'\\n');${signal ? "process.kill(process.pid, 'SIGTERM');" : `process.exit(args.includes('--exclude')?${first}:${second});`}\n`, { mode: 0o700 })
    const calls = path.join(root, 'calls')
    let status: number | null = 0
    let observedSignal: string | null = null
    try { execFileSync(process.execPath, [runner], { cwd: root, env: { ...process.env, PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH, CALLS: calls }, stdio: 'pipe' }) }
    catch (error) { const result = error as { status: number | null; signal: string | null }; status = result.status; observedSignal = result.signal }
    return { status, signal: observedSignal, calls: readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}
describe('CI retains every test while isolating the full backlog probe pool', () => {
  it.each([[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]])('propagates partition results %i / %i to %i and runs both', (first, second, expected) => {
    const result = exercise(first, second)
    expect(result.status).toBe(expected)
    expect(result.calls).toEqual([
      ['test', '--exclude', 'scripts/backlog-contract.test.ts'],
      ['test', 'scripts/backlog-contract.test.ts', '--maxWorkers=2'],
    ])
  })
  it('preserves cancellation and never starts a second partition after a signal', () => {
    const result = exercise(0, 0, true)
    expect(result.signal).toBe('SIGTERM')
    expect(result.calls).toHaveLength(1)
  })
  it('the existing CI test job invokes the runner on the unchanged Node22 runner', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8').split('  test:\n')[1].split('\n  checks:')[0]
    expect(ci).toContain("node-version: '22'")
    expect(ci).toContain('run: node scripts/ci-test-suites.mjs')
    expect(ci).not.toMatch(/continue-on-error|timeout-minutes: (?:[3-9]\d|\d{3})/)
    expect(readFileSync('scripts/backlog-contract.test.ts', 'utf8')).toContain('{ timeout: 90_000 }')
  })
})
