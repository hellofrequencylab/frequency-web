import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { shellLazyBoundary } from './probes/shell-lazy-boundary.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
const shell = read('components/layout/app-shell.tsx')
const bridge = read('components/layout/admin-bar/lazy-admin-bar.tsx')
const budget = read('scripts/check-shell-weight.mjs')
it('checks both conditional boundaries and the unchanged actual artifact ceiling', () => {
  expect(shellLazyBoundary(shell, bridge, budget)).toBe(true)
})
it.each([
  ['eager admin import', shell + "\nimport { AdminBar } from '@/components/layout/admin-bar/admin-bar'", bridge, budget],
  ['eager dynamic mount', shell, bridge.replace('return requested ?', 'return true ?'), budget],
  ['wrong chunk', shell, bridge.replace("import('./admin-bar')", "import('./other')"), budget],
  ['missing listener', shell, bridge.replace('addEventListener(OPEN_ADMIN_BAR, request)', 'addEventListener("other", request)'), budget],
  ['eager search mount', shell.replace('searchOpen && <SearchOverlay', 'true && <SearchOverlay'), bridge, budget],
  ['raised ceiling', shell, bridge, budget.replace('BUDGET_KB = 1100', 'BUDGET_KB = 1400')],
])('rejects %s regression', (_, changedShell, changedBridge, changedBudget) => {
  expect(shellLazyBoundary(changedShell, changedBridge, changedBudget)).toBe(false)
})

it('executes the actual probe through a symlink with spaces and Unicode, while imports remain inert', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'shell entry ü '))
  const real = join(tmp, 'real')
  try {
    for (const dir of ['scripts/probes', 'scripts/lib', 'components/layout/admin-bar']) mkdirSync(join(real, dir), { recursive: true })
    for (const file of ['scripts/probes/shell-lazy-boundary.mjs', 'scripts/lib/invoked-directly.mjs']) writeFileSync(join(real, file), read(file))
    writeFileSync(join(real, 'components/layout/app-shell.tsx'), shell)
    writeFileSync(join(real, 'components/layout/admin-bar/lazy-admin-bar.tsx'), bridge)
    writeFileSync(join(real, 'scripts/check-shell-weight.mjs'), budget)
    const entry = join(tmp, 'boundary ü.mjs')
    symlinkSync(join(real, 'scripts/probes/shell-lazy-boundary.mjs'), entry)
    const run = () => execFileSync(process.execPath, [entry], { cwd: real, encoding: 'utf8', stdio: 'pipe' })
    expect(run()).toContain('Shell lazy source boundary passed')
    writeFileSync(join(real, 'components/layout/admin-bar/lazy-admin-bar.tsx'), bridge.replace('return requested ?', 'return true ?'))
    expect(run).toThrow()
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', 'await import("./scripts/probes/shell-lazy-boundary.mjs")'], { cwd: real, encoding: 'utf8' })).toBe('')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
