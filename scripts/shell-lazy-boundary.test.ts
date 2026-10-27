import { readFileSync } from 'node:fs'
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
