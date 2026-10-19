import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The node store is mounted by EntityLayoutMount in the app shell, so everything it statically imports is
// parsed on every phone on every route (DEPLOY-SAFETY, check:shell-weight). It may take TYPES from the node
// modules and nothing else from them; a runtime import would drag the block sanitizers into the shell.
describe('node layout store shell weight', () => {
  const source = readFileSync('components/entity-blocks/node-layout-store.tsx', 'utf8')
  const imports = [...source.matchAll(/^import\s+(type\s+)?[^\n]*?from\s+'([^']+)'/gm)].map((m) => ({ typeOnly: !!m[1], from: m[2] }))

  it('imports the node modules for types only', () => {
    const runtime = imports.filter((i) => !i.typeOnly && /entity-blocks\/(node-ops|node-tree|rows-ops|layout|registry|block-content)$/.test(i.from))
    expect(runtime).toEqual([])
  })
  it('still imports the node layout type', () => {
    expect(imports.some((i) => i.typeOnly && i.from === '@/lib/entity-blocks/node-tree')).toBe(true)
  })
})
