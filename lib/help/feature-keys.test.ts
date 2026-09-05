import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { FEATURE_KEYS } from './feature-keys'
import { fileToRoute, affectedFeatureKeys } from './drift'

// Every feature-key route is a PREFIX the drift signal (lib/help/drift.ts affectedFeatureKeys) matches
// changed files against. A route with no file under app/ equal to or beneath it can never be touched
// by a change, so the article behind it can never be flagged as possibly stale (scan2 L4-05: '/vault'
// sat that way). This walks the real app/ tree, so it fails the moment a listed route stops existing.

const ROOT = join(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name
    const full = join(dir, name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(relative(ROOT, full))
  }
  return out
}

const appFiles = walk(join(ROOT, 'app'))
const appRoutes = appFiles.map(fileToRoute).filter((r): r is string => r !== null)

describe('every feature-key route prefix matches at least one file under app/', () => {
  it('walked the app tree (detector control)', () => {
    expect(appRoutes).toContain('/upgrade')
    expect(appRoutes).toContain('/circles/[slug]')
  })

  const rows = FEATURE_KEYS.flatMap((fk) => fk.routes.map((route) => [fk.key, route] as const))
  it.each(rows)('%s: %s', (_key, route) => {
    const hit = appRoutes.some((r) => r === route || r.startsWith(route + '/'))
    expect(hit, `${route} matches no file under app/, so the drift signal can never fire for it`).toBe(true)
  })
})

describe('the real surfaces flag their article keys (scan2 L4-05)', () => {
  it('notification settings edits flag `notifications`', () => {
    expect(affectedFeatureKeys(['app/(main)/settings/notifications/form.tsx'], FEATURE_KEYS)).toContain(
      'notifications',
    )
  })
  it('the membership page flags `vault`', () => {
    expect(affectedFeatureKeys(['app/(main)/upgrade/page.tsx'], FEATURE_KEYS)).toContain('vault')
  })
  it('the Connections settings section flags `location` and `resonance`', () => {
    const keys = affectedFeatureKeys(['app/(main)/settings/connections/section.tsx'], FEATURE_KEYS)
    expect(keys).toContain('location')
    expect(keys).toContain('resonance')
  })
  it('a Hub or Nexus page flags its key through the prefix', () => {
    expect(affectedFeatureKeys(['app/(main)/hubs/[slug]/page.tsx'], FEATURE_KEYS)).toContain('hubs')
    expect(affectedFeatureKeys(['app/(main)/nexuses/[slug]/page.tsx'], FEATURE_KEYS)).toContain('nexuses')
  })
})
