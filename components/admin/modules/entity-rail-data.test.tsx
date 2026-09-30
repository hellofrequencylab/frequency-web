// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, useEffect, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// LIVE-655 (ADR-1685). A circle, event, hub, nexus or practice rail used to make one Server Action
// request per module, and Next.js sends those one at a time. The assertions here are the consequences:
// on a real hub rail the four modules make ONE request between them instead of four, a module still
// gets exactly the data its own getter returns, and every way the bundle can miss (no provider, a
// read it did not ask for, a read that failed, another entity) falls back to the getter as before.

let pathname = '/hubs/north-county'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

const HUB = { id: 'hub-1', slug: 'north-county', name: 'North County', status: 'active' }
const HUB_PEOPLE = {
  hubId: 'hub-1',
  slug: 'north-county',
  guideName: 'Robin',
  guideHandle: 'robin',
  circleCount: 2,
  totalMembers: 18,
  circles: [],
}
const HUB_INSIGHTS = { totalMembers: 18, circleCount: 2, activeCircleCount: 2, avgPerCircle: 9 }

const hub = vi.hoisted(() => ({
  getHubAdminData: vi.fn(),
  getHubPeopleData: vi.fn(),
  getHubInsightsData: vi.fn(),
  updateHubSettings: vi.fn(),
  archiveHub: vi.fn(),
}))
vi.mock('@/lib/hierarchy/hub-admin', () => hub)

// The bundle action, as the browser sees it: one request. Counted, and answered from the same
// fixtures the getters return, so a slice is observably the getter's own result.
const bundle = vi.hoisted(() => ({ getEntityRailBundle: vi.fn() }))
vi.mock('./entity-rail-actions', () => bundle)

// The server half's own imports, so the real action can be loaded with vi.importActual below.
const server = vi.hoisted(() => ({
  circle: { getCircleAdminData: vi.fn(), getCirclePlaceTimeData: vi.fn(), getCirclePeopleData: vi.fn(), getCircleEngageData: vi.fn(), getCirclePracticeAssignData: vi.fn(), getCircleInsightsData: vi.fn() },
  move: { getCircleMoveData: vi.fn() },
  run: { getCircleJourneyRunData: vi.fn() },
  event: { getEventAdminData: vi.fn(), getEventCoreStats: vi.fn(), getEventPeopleData: vi.fn() },
  nexus: { getNexusAdminData: vi.fn(), getNexusPeopleData: vi.fn(), getNexusInsightsData: vi.fn() },
  practice: { getPracticeAdminData: vi.fn(), getPracticeInsightsData: vi.fn() },
}))
vi.mock('@/app/(main)/circles/admin-actions', () => server.circle)
vi.mock('@/app/(main)/circles/[slug]/transfer-actions', () => server.move)
vi.mock('./circle-journey-run-actions', () => server.run)
vi.mock('@/app/(main)/events/admin-actions', () => server.event)
vi.mock('@/lib/hierarchy/nexus-admin', () => server.nexus)
vi.mock('@/app/(main)/practices/admin-actions', () => server.practice)

import { EntityRailDataProvider, useEntityRailRead } from './entity-rail-data'
import {
  ENTITY_RAIL_MODULE_READS,
  ENTITY_RAIL_READ_KEYS,
  entityRailReadsFor,
  entityRailRoute,
  type EntityRailKind,
} from '@/lib/admin/entity-rail-reads'
import { INLINE_MODULE_IDS } from './module-ids'
import { HubSettingsModule } from './hub-settings-module'
import { HubPeopleModule } from './hub-people-module'
import { HubInsightsModule } from './hub-insights-module'
import { HubDangerModule } from './hub-danger-module'

let container: HTMLDivElement | null = null
let root: Root | null = null

async function mount(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(node)
  })
  // Let every getter/bundle promise and the state it sets settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  return container
}

beforeEach(() => {
  pathname = '/hubs/north-county'
  hub.getHubAdminData.mockResolvedValue(HUB)
  hub.getHubPeopleData.mockResolvedValue(HUB_PEOPLE)
  hub.getHubInsightsData.mockResolvedValue(HUB_INSIGHTS)
  bundle.getEntityRailBundle.mockImplementation(async (_kind: string, _key: string, reads: string[]) => {
    const all: Record<string, unknown> = { admin: HUB, people: HUB_PEOPLE, insights: HUB_INSIGHTS }
    return Object.fromEntries(reads.map((r) => [r, { ok: true, data: all[r] }]))
  })
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const HUB_RAIL = ['hub.settings', 'hub.people', 'hub.insights', 'hub.danger']

function HubRail() {
  return (
    <>
      <HubSettingsModule />
      <HubPeopleModule />
      <HubInsightsModule />
      <HubDangerModule />
    </>
  )
}

const getterCalls = () =>
  hub.getHubAdminData.mock.calls.length +
  hub.getHubPeopleData.mock.calls.length +
  hub.getHubInsightsData.mock.calls.length

describe('a real hub rail, before and after (the measured entity)', () => {
  it('BEFORE: with no provider, the four modules make four requests, two of them the same read', async () => {
    const el = await mount(<HubRail />)
    expect(getterCalls()).toBe(4)
    expect(hub.getHubAdminData).toHaveBeenCalledTimes(2)
    expect(bundle.getEntityRailBundle).not.toHaveBeenCalled()
    expect(el.textContent).toContain('Robin')
  })

  it('AFTER: inside the provider, the same four modules make ONE request carrying three distinct reads', async () => {
    const el = await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
        <HubRail />
      </EntityRailDataProvider>,
    )
    expect(bundle.getEntityRailBundle).toHaveBeenCalledTimes(1)
    expect(bundle.getEntityRailBundle).toHaveBeenCalledWith('hub', 'north-county', ['admin', 'people', 'insights'])
    expect(getterCalls()).toBe(0)
    // Same data on screen as the self-fetching rail: the guide, the settings form, the rollup, archive.
    expect(el.textContent).toContain('Robin')
    expect((el.querySelector('input[name="name"]') as HTMLInputElement | null)?.value).toBe('North County')
    expect(el.textContent).toMatch(/Archive/)
  })

  it('a read that failed in the bundle falls back to that module\'s own getter, and only that one', async () => {
    bundle.getEntityRailBundle.mockResolvedValueOnce({
      admin: { ok: true, data: HUB },
      people: { ok: false },
      insights: { ok: true, data: HUB_INSIGHTS },
    })
    const el = await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
        <HubRail />
      </EntityRailDataProvider>,
    )
    expect(hub.getHubPeopleData).toHaveBeenCalledTimes(1)
    expect(hub.getHubAdminData).not.toHaveBeenCalled()
    expect(el.textContent).toContain('Robin')
  })

  it('a bundle request that rejects outright leaves every module to its own getter, and says so', async () => {
    bundle.getEntityRailBundle.mockRejectedValueOnce(new Error('network'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
        <HubRail />
      </EntityRailDataProvider>,
    )
    expect(getterCalls()).toBe(4)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('a section list that settles a render late still gets the one request', async () => {
    const el = await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={[]}>
        {null}
      </EntityRailDataProvider>,
    )
    expect(bundle.getEntityRailBundle).not.toHaveBeenCalled()
    await act(async () => {
      root!.render(
        <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
          <HubRail />
        </EntityRailDataProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(bundle.getEntityRailBundle).toHaveBeenCalledTimes(1)
    expect(getterCalls()).toBe(0)
    expect(el.textContent).toContain('Robin')
  })

  it('a gated-out viewer (every getter null) still renders nothing, through the bundle', async () => {
    bundle.getEntityRailBundle.mockImplementationOnce(async (_k: string, _s: string, reads: string[]) =>
      Object.fromEntries(reads.map((r) => [r, { ok: true, data: null }])),
    )
    const el = await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
        <HubRail />
      </EntityRailDataProvider>,
    )
    expect(getterCalls()).toBe(0)
    expect(el.textContent).toBe('')
  })
})

describe('useEntityRailRead falls back wherever the bundle cannot answer', () => {
  function Probe({ kind, read, keyOf, getter }: { kind: EntityRailKind; read: string; keyOf: string; getter: (k: string) => Promise<unknown> }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchIt = useEntityRailRead(kind as 'hub', read as any, getter)
    const [out, setOut] = useState('pending')
    useEffect(() => {
      fetchIt(keyOf).then((d) => setOut(JSON.stringify(d)))
    }, [fetchIt, keyOf])
    return <span>{out}</span>
  }

  it('a read the provider did not ask for (its module is not mounted) goes to the getter', async () => {
    const getter = vi.fn().mockResolvedValue({ from: 'getter' })
    const el = await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={['hub.settings']}>
        <Probe kind="hub" read="people" keyOf="north-county" getter={getter} />
      </EntityRailDataProvider>,
    )
    expect(getter).toHaveBeenCalledWith('north-county')
    expect(el.textContent).toContain('getter')
  })

  it('another entity\'s key, or another kind, goes to the getter', async () => {
    const getter = vi.fn().mockResolvedValue({ from: 'getter' })
    await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
        <Probe kind="hub" read="admin" keyOf="south-bay" getter={getter} />
        <Probe kind="nexus" read="admin" keyOf="north-county" getter={getter} />
      </EntityRailDataProvider>,
    )
    expect(getter).toHaveBeenCalledTimes(2)
  })

  it('off an entity route the provider is inert and makes no request', async () => {
    pathname = '/feed'
    const getter = vi.fn().mockResolvedValue(null)
    await mount(
      <EntityRailDataProvider pathname={pathname} moduleIds={HUB_RAIL}>
        <Probe kind="hub" read="admin" keyOf="north-county" getter={getter} />
      </EntityRailDataProvider>,
    )
    expect(bundle.getEntityRailBundle).not.toHaveBeenCalled()
    expect(getter).toHaveBeenCalledTimes(1)
  })
})

describe('the read table', () => {
  it('reads the entity and key off each rail route, and nothing else', () => {
    expect(entityRailRoute('/circles/sunrise-walkers/members')).toEqual({ kind: 'circle', key: 'sunrise-walkers' })
    expect(entityRailRoute('/events/full-moon')).toEqual({ kind: 'event', key: 'full-moon' })
    expect(entityRailRoute('/hubs/north-county')).toEqual({ kind: 'hub', key: 'north-county' })
    expect(entityRailRoute('/nexuses/southland')).toEqual({ kind: 'nexus', key: 'southland' })
    expect(entityRailRoute('/practices/abc-123')).toEqual({ kind: 'practice', key: 'abc-123' })
    expect(entityRailRoute('/spaces/acme')).toBeNull()
    expect(entityRailRoute('/circles')).toBeNull()
  })

  it('asks for each read once, folds the rail extras, and ignores link rows', () => {
    // A full circle rail: Settings, Guided and the Circle Quest block all make the SAME read.
    expect(
      entityRailReadsFor('circle', [
        'circle.guided',
        'circle.settings',
        'circle.placeAndTime',
        'circle.people',
        'circle.engage',
        'circle.insights',
        'circle.transfer',
        'extra:engage:0',
        'extra:layout:1',
        'circle.crm',
      ]),
    ).toEqual(['admin', 'placeTime', 'people', 'engage', 'practice', 'journeyRun', 'insights', 'move'])
    expect(entityRailReadsFor('event', ['event.guided', 'event.settings', 'event.people', 'extra:danger:1'])).toEqual([
      'admin',
      'coreStats',
      'people',
    ])
    expect(entityRailReadsFor('hub', ['hub.layout'])).toEqual([])
  })

  it('names only module ids that have an inline body', () => {
    for (const [kind, table] of Object.entries(ENTITY_RAIL_MODULE_READS)) {
      for (const id of Object.keys(table)) {
        if (id.startsWith('extra:')) continue
        expect(INLINE_MODULE_IDS.has(id), `${kind}: ${id} has no inline body, so it never mounts`).toBe(true)
      }
    }
  })
})

describe('the client and the server name the same getter for every read', () => {
  const dir = path.join(import.meta.dirname)
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .map((f) => ({ file: f, src: readFileSync(path.join(dir, f), 'utf8') }))
  const calls = sources.flatMap(({ file, src }) =>
    [...src.matchAll(/useEntityRailRead\(\s*'(\w+)',\s*'(\w+)',\s*(\w+)\s*\)/g)].map((m) => ({
      file,
      kind: m[1],
      read: m[2],
      getter: m[3],
    })),
  )
  const actions = readFileSync(path.join(dir, 'entity-rail-actions.ts'), 'utf8')
  const table = new Map<string, string>()
  for (const block of actions.matchAll(/^ {2}(\w+): \{\n([\s\S]*?)^ {2}\},/gm)) {
    for (const entry of block[2].matchAll(/^ {4}(\w+): (\w+),/gm)) table.set(`${block[1]}.${entry[1]}`, entry[2])
  }

  it('finds the call sites and the table (non-trivial)', () => {
    expect(calls.length).toBeGreaterThanOrEqual(25)
    expect(table.size).toBe(Object.values(ENTITY_RAIL_READ_KEYS).flat().length)
  })

  it('every call site passes the getter the bundle runs for that read', () => {
    for (const c of calls) {
      expect(table.get(`${c.kind}.${c.read}`), `${c.file}: ${c.kind}.${c.read}`).toBe(c.getter)
    }
  })

  it('every read the table can ask for has a module that consumes it', () => {
    for (const [kind, reads] of Object.entries(ENTITY_RAIL_MODULE_READS)) {
      for (const read of new Set(Object.values(reads).flat())) {
        expect(
          calls.some((c) => c.kind === kind && c.read === read),
          `${kind}.${read} is requested but no module reads it from the bundle`,
        ).toBe(true)
      }
    }
  })
})

describe('the server half runs each read once, in one request, and isolates a failure', () => {
  it('dedupes, ignores what it does not know, and marks a throw as not ok', async () => {
    const { getEntityRailBundle } = await vi.importActual<typeof import('./entity-rail-actions')>('./entity-rail-actions')
    server.circle.getCircleAdminData.mockResolvedValue({ id: 'c1' })
    server.circle.getCirclePeopleData.mockRejectedValue(new Error('boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const out = await getEntityRailBundle('circle', 'sunrise', ['admin', 'admin', 'people', 'constructor', 'nope'])

    expect(server.circle.getCircleAdminData).toHaveBeenCalledTimes(1)
    expect(server.circle.getCircleAdminData).toHaveBeenCalledWith('sunrise')
    expect(out).toEqual({ admin: { ok: true, data: { id: 'c1' } }, people: { ok: false } })
    expect(errSpy).toHaveBeenCalledTimes(1)
    expect(await getEntityRailBundle('space', 'acme', ['admin'])).toEqual({})
    expect(await getEntityRailBundle('__proto__', 'acme', ['admin'])).toEqual({})
    errSpy.mockRestore()
  })
})
