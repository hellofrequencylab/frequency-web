// SCAN-1119 follows the actual main-layout Frequency shell; real bytes remain the postbuild gate's job.
import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export const SHELL_BOUNDARY_PATHS = {
  layout: 'app/(main)/layout.tsx',
  shell: 'components/frequency/members/shell/members-shell.tsx',
  header: 'components/frequency/members/shell/header.tsx',
  rail: 'components/frequency/members/shell/rail-layout.tsx',
  search: 'components/frequency/members/shell/member-search.tsx',
  bridge: 'components/layout/admin-bar/lazy-admin-bar.tsx',
  budget: 'scripts/check-shell-weight.mjs',
}
const live = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const runtime = (text) => live(text).replace(/import\s+type\s+[\s\S]*?\sfrom\s+['"][^'"]+['"]/g, '')
export function shellLazyBoundary(source) {
  const { layout, shell, header, rail, search, bridge, budget } = Object.fromEntries(Object.entries(source).map(([key, text]) => [key, live(text)]))
  return /from ['"]@\/components\/frequency\/members\/shell\/members-shell['"]/.test(layout)
    && /<FrequencyMembersShell\b/.test(layout)
    && /from ['"]\.\/header['"]/.test(shell) && /<FqHeader\b/.test(shell)
    && /from ['"]\.\/rail-layout['"]/.test(shell) && /<FqRailLayout\b/.test(shell)
    && /from ['"]\.\/member-search['"]/.test(header) && /<MemberSearch\b/.test(header)
    && !/from ['"]@\/components\/search\/search-overlay['"]/.test(runtime(header))
    && !/from ['"][^'"]*\/admin-bar\/admin-bar['"]/.test(runtime(rail))
    && /import\s*\{\s*LazyAdminBar\s*\}\s*from\s*['"][^'"]*\/lazy-admin-bar['"]/.test(rail)
    && /<LazyAdminBar\b/.test(rail)
    && /dynamic\(\s*\(\)\s*=>\s*import\(['"]\.\/admin-bar['"]\)/.test(bridge)
    && /return\s+requested\s*\?\s*<AdminBar\b/.test(bridge)
    && /addEventListener\(OPEN_ADMIN_BAR,\s*request\)/.test(bridge)
    && /onListening=\{onListening\}/.test(bridge)
    && /dynamic\(\s*\(\)\s*=>\s*import\(['"]@\/components\/search\/search-overlay['"]\)/.test(search)
    && /return\s+searchOpen\s*\?\s*<SearchOverlay\b/.test(search)
    && /SHELL_ENTRY\s*=\s*['"]\[project\]\/app\/\(main\)\/layout['"]/.test(budget)
    && /BUDGET_KB\s*=\s*1100\b/.test(budget)
}
export function currentShellLazyBoundary() {
  return shellLazyBoundary(Object.fromEntries(Object.entries(SHELL_BOUNDARY_PATHS).map(([key, path]) => [key, readFileSync(path, 'utf8')])))
}
if (invokedDirectly(import.meta.url)) {
  if (!currentShellLazyBoundary()) { console.error('Active Frequency shell lazy source boundary failed'); process.exitCode = 1 }
  else console.log('Active Frequency shell lazy source boundary passed; actual artifact byte gate remains required')
}
