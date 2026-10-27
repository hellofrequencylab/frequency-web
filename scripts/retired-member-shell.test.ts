import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { RETIRED_BROWSE_WRAPPERS } from './lib/retired-browse-wrappers.mjs'
import { RETIRED_MEMBER_SHELL, retiredShellEdges, retiredModuleEdges } from './lib/retired-member-shell.mjs'
function modules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name)
    return entry.isDirectory() ? modules(file) : /\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec)\./.test(file) ? [file] : []
  })
}
describe('legacy AppShell retirement', () => {
  it('has no runtime module left and no dangling consumers anywhere in application source', () => {
    const retired = [RETIRED_MEMBER_SHELL, 'components/admin/admin-auto-back-link.tsx', 'components/admin/admin-sub-nav.tsx', ...RETIRED_BROWSE_WRAPPERS]
    for (const file of retired) expect(existsSync(file), file).toBe(false)
    const edges = ['app', 'components', 'lib'].flatMap(modules).flatMap(file => retiredModuleEdges(file, readFileSync(file, 'utf8'), retired))
    expect(edges).toEqual([])
  })
  it.each([
    "import { AppShell } from '@/components/layout/app-shell'",
    "export { AppShell } from './app-shell'",
    "const shell = import('./app-shell.tsx')",
    "const shell = require('./app-shell')",
  ])('rejects a real reintroduced dependency: %s', source => {
    expect(retiredShellEdges('components/layout/consumer.tsx', source)).toHaveLength(1)
  })
  it('does not mistake shared helper modules or historical comments for legacy runtime edges', () => {
    expect(retiredShellEdges('components/layout/consumer.tsx', "// import AppShell from './app-shell'\nimport { x } from './app-shell-account'\nexport { y } from './app-shell-nav'")).toEqual([])
  })
})

// Run the same parser on the actual current admin layout with each retired dependency reintroduced.
// This preserves the current route/guard source and demonstrates that a real new call path fails.
describe('retired internal admin chrome', () => {
  it.each(['admin-auto-back-link', 'admin-sub-nav'])('rejects reintroducing %s into the actual admin entry', name => {
    const layout = readFileSync('app/(main)/admin/layout.tsx', 'utf8')
    const source = `import Retired from '@/components/admin/${name}'\n${layout}`
    expect(retiredModuleEdges('app/(main)/admin/layout.tsx', source, [`components/admin/${name}.tsx`])).toHaveLength(1)
  })
})

describe('retired browse wrapper dependencies', () => {
  it.each(RETIRED_BROWSE_WRAPPERS)('rejects a reintroduced dependency on %s from the actual discover route', target => {
    const route = 'app/discover/page.tsx'
    const source = `import Retired from '@/${target.replace(/\.tsx?$/, '')}'\n${readFileSync(route, 'utf8')}`
    expect(retiredModuleEdges(route, source, RETIRED_BROWSE_WRAPPERS)).toHaveLength(1)
  })
})
