import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { RETIRED_MEMBER_SHELL, retiredShellEdges } from './lib/retired-member-shell.mjs'
function modules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name)
    return entry.isDirectory() ? modules(file) : /\.[cm]?[jt]sx?$/.test(file) && !/\.(test|spec)\./.test(file) ? [file] : []
  })
}
describe('legacy AppShell retirement', () => {
  it('has no runtime module left and no dangling consumers anywhere in application source', () => {
    expect(existsSync(RETIRED_MEMBER_SHELL)).toBe(false)
    const edges = ['app', 'components', 'lib'].flatMap(modules).flatMap(file => retiredShellEdges(file, readFileSync(file, 'utf8')))
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
