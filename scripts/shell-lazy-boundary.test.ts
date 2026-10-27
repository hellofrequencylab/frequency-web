import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { shellLazyBoundary, SHELL_BOUNDARY_PATHS } from './probes/shell-lazy-boundary.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
const source = Object.fromEntries(Object.entries(SHELL_BOUNDARY_PATHS).map(([key, path]) => [key, read(path)]))
it('follows the real main-layout Frequency shell to both conditional boundaries and the unchanged artifact gate', () => {
  expect(shellLazyBoundary(source)).toBe(true)
})
it.each([
  ['different shell rendered', 'layout', source.layout.replace(/<FrequencyMembersShell\b/g, '<AppShell')],
  ['different header rendered', 'shell', source.shell.replace(/<FqHeader\b/g, '<OtherHeader')],
  ['different rail rendered', 'shell', source.shell.replace(/<FqRailLayout\b/g, '<OtherRail')],
  ['eager admin import', 'rail', source.rail + "\nimport { AdminBar } from '@/components/layout/admin-bar/admin-bar'"],
  ['eager search import', 'header', source.header + "\nimport { SearchOverlay } from '@/components/search/search-overlay'"],
  ['eager dynamic mount', 'bridge', source.bridge.replace('return requested ?', 'return true ?')],
  ['wrong chunk', 'bridge', source.bridge.replace("import('./admin-bar')", "import('./other')")],
  ['missing listener', 'bridge', source.bridge.replace('addEventListener(OPEN_ADMIN_BAR, request)', 'addEventListener("other", request)')],
  ['eager search mount', 'search', source.search.replace('return searchOpen ?', 'return true ?')],
  ['wrong artifact entry', 'budget', source.budget.replace("export const SHELL_ENTRY = '[project]/app/(main)/layout'", "export const SHELL_ENTRY = '[project]/legacy/layout'")],
  ['raised ceiling', 'budget', source.budget.replace('BUDGET_KB = 1100', 'BUDGET_KB = 1400')],
])('rejects %s regression', (_, key, text) => {
  expect(shellLazyBoundary({ ...source, [key]: text })).toBe(false)
})
it('executes the actual probe through a symlink with spaces and Unicode; imports remain inert', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'shell entry ü ')), real = join(tmp, 'real')
  try {
    for (const file of [...Object.values(SHELL_BOUNDARY_PATHS), 'scripts/probes/shell-lazy-boundary.mjs', 'scripts/lib/invoked-directly.mjs']) {
      mkdirSync(dirname(join(real, file)), { recursive: true })
      writeFileSync(join(real, file), read(file))
    }
    const entry = join(tmp, 'boundary ü.mjs')
    symlinkSync(join(real, 'scripts/probes/shell-lazy-boundary.mjs'), entry)
    const run = () => execFileSync(process.execPath, [entry], { cwd: real, encoding: 'utf8', stdio: 'pipe' })
    expect(run()).toContain('Active Frequency shell lazy source boundary passed')
    writeFileSync(join(real, SHELL_BOUNDARY_PATHS.search), source.search.replace('return searchOpen ?', 'return true ?'))
    expect(run).toThrow()
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', 'await import("./scripts/probes/shell-lazy-boundary.mjs")'], { cwd: real, encoding: 'utf8' })).toBe('')
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})
