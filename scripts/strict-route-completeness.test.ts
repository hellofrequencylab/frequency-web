import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { normalizeAppPath } = require('next/dist/shared/lib/router/utils/app-paths')
const { normalizeCatchAllRoutes } = require('next/dist/server/lib/router-utils/normalize-catchall-routes')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? files(join(dir, entry.name)) : [join(dir, entry.name)])
}

describe('Next strict parallel route completeness', () => {
  it('keeps every page reachable alongside the wizard modal closer', () => {
    const paths = files('app').filter((file) => /\/(page|default)\.tsx$/.test(file))
      .map((file) => `/${file.slice(4, -4)}`)
    const appPaths: Record<string, string[]> = {}
    for (const path of paths.filter((path) => path.endsWith('/page'))) {
      const normalized = normalizeAppPath(path)
      ;(appPaths[normalized] ??= []).push(path)
    }
    expect(paths).toContain('/(main)/@wizard/[...catchAll]/page')
    const result = normalizeCatchAllRoutes(appPaths, undefined, {
      strictRouteMatching: true,
      defaultAppPaths: paths.filter((path) => path.endsWith('/default')),
    })
    expect(result.unmatchedAppPages).toEqual([])
    expect(result.incompatibleParallelRouteSlots).toEqual([])
  })
})
