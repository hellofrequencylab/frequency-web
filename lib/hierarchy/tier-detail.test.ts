import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AccessLevel } from '@/lib/core/access-matrix'
import type { Capability } from '@/lib/core/capabilities'

// HYG-046. The loading half of the shared tier detail (the Hub / Nexus twins). Both properties
// pinned here are ones that HAD drifted between the two hand-maintained pages: the Hub page
// batched its four reads and the Nexus page did not, and the Hub page dropped archived children
// and the Nexus page did not.

const surfaceAccess = vi.fn<() => Promise<AccessLevel>>(async () => 'none')
const resolveDetailHero = vi.fn(async () => ({ coverImage: undefined, coverFocus: null }))

vi.mock('@/lib/core/viewer-hats', () => ({ surfaceAccess: () => surfaceAccess() }))
vi.mock('@/lib/layout/detail-hero', () => ({ resolveDetailHero: () => resolveDetailHero() }))

import { loadTierChrome } from './tier-detail'

type Child = { id: string; status: string }

const caps = (...c: string[]) => new Set(c as Capability[])
const rows = (data: Child[]) => Promise.resolve({ data })

beforeEach(() => {
  surfaceAccess.mockReset().mockResolvedValue('none')
  resolveDetailHero.mockReset().mockResolvedValue({ coverImage: undefined, coverFocus: null })
})

describe('loadTierChrome — one round-trip', () => {
  // The drift: the Hub page resolved caps + Insight access + children + cover in ONE Promise.all
  // (site-audit PERF-6); the Nexus page awaited three of them in series and paid three latencies.
  // Holding the capability read open proves every other read is already in flight — a serial
  // `const x = await` lifted above the batch would deadlock this test instead of silently
  // costing every visitor a round-trip.
  it('has every read in flight before the first one resolves', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const started: string[] = []

    surfaceAccess.mockImplementation(async () => {
      started.push('insight')
      return 'full'
    })
    resolveDetailHero.mockImplementation(async () => {
      started.push('hero')
      return { coverImage: undefined, coverFocus: null }
    })

    const pending = loadTierChrome<Child>({
      kind: 'hub',
      id: 'hub-1',
      path: '/hubs/riverside',
      loadCapabilities: async () => {
        started.push('caps')
        await gate
        return caps('hub.manage')
      },
      children: (async () => {
        started.push('children')
        return { data: [{ id: 'c1', status: 'active' }] }
      })(),
    })

    // Let the microtask queue drain as far as it can while the capability read is held open.
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(started.sort()).toEqual(['caps', 'children', 'hero', 'insight'])

    release()
    await expect(pending).resolves.toMatchObject({ canManage: true, showsInsight: true })
  })
})

describe('loadTierChrome — archived children drop out of the listing', () => {
  // `archiveHub` / `archiveNexus` set status='archived' "so it drops out of listings". The Hub
  // page honoured that for its Circles; the Nexus page listed archived Hubs and counted their
  // members. Exclusion lives here now, so it cannot be true of only one of the two callers.
  it('drops archived rows whatever the caller queried', async () => {
    const chrome = await loadTierChrome<Child>({
      kind: 'nexus',
      id: 'nexus-1',
      path: '/nexuses/north',
      loadCapabilities: async () => caps(),
      children: rows([
        { id: 'h1', status: 'active' },
        { id: 'h2', status: 'archived' },
        { id: 'h3', status: 'draft' },
      ]),
    })

    expect(chrome.children.map((c) => c.id)).toEqual(['h1', 'h3'])
  })

  it('tolerates a query that came back empty', async () => {
    const chrome = await loadTierChrome<Child>({
      kind: 'hub',
      id: 'hub-1',
      path: '/hubs/riverside',
      loadCapabilities: async () => caps(),
      children: Promise.resolve({ data: null }),
    })

    expect(chrome.children).toEqual([])
  })
})

describe('loadTierChrome — the gates it resolves', () => {
  it('reads canManage from the tier its caller named, not a fixed capability', async () => {
    const hub = await loadTierChrome<Child>({
      kind: 'hub',
      id: 'hub-1',
      path: '/hubs/riverside',
      loadCapabilities: async () => caps('hub.manage'),
      children: rows([]),
    })
    expect(hub.canManage).toBe(true)

    const nexus = await loadTierChrome<Child>({
      kind: 'nexus',
      id: 'nexus-1',
      path: '/nexuses/north',
      // A Hub cap must NOT unlock a Nexus.
      loadCapabilities: async () => caps('hub.manage'),
      children: rows([]),
    })
    expect(nexus.canManage).toBe(false)
  })

  it('shows the scoped Insight band to a steward and hides it from everyone else (ADR-225)', async () => {
    const chrome = async (level: AccessLevel) => {
      surfaceAccess.mockResolvedValue(level)
      return loadTierChrome<Child>({
        kind: 'nexus',
        id: 'nexus-1',
        path: '/nexuses/north',
        loadCapabilities: async () => caps(),
        children: rows([]),
      })
    }

    expect((await chrome('none')).showsInsight).toBe(false)
    expect((await chrome('limited')).showsInsight).toBe(true)
    expect((await chrome('full')).showsInsight).toBe(true)
  })
})
