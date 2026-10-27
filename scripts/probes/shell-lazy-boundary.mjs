// SCAN-1119 source boundary only. Real bytes remain the unchanged postbuild shell gate's job.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function shellLazyBoundary(shell, bridge, budget) {
  const live = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  shell = live(shell)
  bridge = live(bridge)
  const runtimeImports = shell.replace(/import\s+type\s+[\s\S]*?\sfrom\s+['"][^'"]+['"]/g, '')
  return !/import\s+[\s\S]*?\sfrom\s+['"][^'"]*\/admin-bar\/admin-bar['"]/.test(runtimeImports)
    && /import\s*\{\s*LazyAdminBar\s*\}\s*from\s*['"][^'"]*\/lazy-admin-bar['"]/.test(shell)
    && /<LazyAdminBar\b/.test(shell)
    && /dynamic\(\s*\(\)\s*=>\s*import\(['"]\.\/admin-bar['"]\)/.test(bridge)
    && /return\s+requested\s*\?\s*<AdminBar\b/.test(bridge)
    && /addEventListener\(OPEN_ADMIN_BAR,\s*request\)/.test(bridge)
    && /onListening=\{onListening\}/.test(bridge)
    && /dynamic\(\s*\(\)\s*=>\s*import\(['"]@\/components\/search\/search-overlay['"]\)/.test(shell)
    && /searchOpen\s*&&\s*<SearchOverlay\b/.test(shell)
    && /BUDGET_KB\s*=\s*1100\b/.test(budget)
}
export function currentShellLazyBoundary() {
  const read = (p) => readFileSync(p, 'utf8')
  return shellLazyBoundary(read('components/layout/app-shell.tsx'), read('components/layout/admin-bar/lazy-admin-bar.tsx'), read('scripts/check-shell-weight.mjs'))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!currentShellLazyBoundary()) { console.error('Shell lazy source boundary failed'); process.exitCode = 1 }
  else console.log('Shell lazy source boundary passed; actual artifact byte gate remains required')
}
