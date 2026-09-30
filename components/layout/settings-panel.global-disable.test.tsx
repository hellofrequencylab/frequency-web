// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { OpenAdminBarDetail } from '@/components/admin/open-admin-bar'
import type { CommunityRole } from '@/lib/core/roles'
import { adminScopeFor } from '@/lib/layout/page-chrome'
import { resolveScopeAppOverrides, scopeKeyFor, type AppOverrides } from '@/lib/apps/overrides'
import { PERSONAL_MODULE_IDS } from '@/lib/admin/modules/registry'

// ── AN APP AN OPERATOR TURNED OFF FOR EVERYONE IS OFF ON EVERY PAGE KIND (LIVE-686) ─────────────
//
// App overrides are stored per scope kind, and a page used to read only its own kind's rows, so a
// disable saved at `global` stopped at global pages. What is measured here is the real panel hook
// (useSettingsPanel, which the desktop drawer, the phone sheet and the rail search all read), fed
// the override map the shell builds for that page: `resolveScopeAppOverrides(scopeKeyFor(scope))`
// over a stored-rows fake, the same call `loadCachedAppOverrides` makes. For each page kind the
// App shows with no override (the control) and is gone once it is disabled at global only.

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const { PageAdminProvider } = await import('./page-admin-context')
const { useSettingsPanel } = await import('./settings-panel')

type Model = ReturnType<typeof useSettingsPanel>

const OFF = { enabled: false, position: null, minRole: null } as const

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

/** The override map the shell threads for `path`, from stored rows keyed by scope kind. */
async function shellOverridesFor(path: string, stored: Record<string, AppOverrides>): Promise<AppOverrides> {
  const scope = adminScopeFor(path)
  if (!scope) return {}
  return resolveScopeAppOverrides(scopeKeyFor(scope), async (key) => stored[key] ?? {})
}

async function panelFor(
  path: string,
  role: CommunityRole,
  stored: Record<string, AppOverrides>,
  detail?: OpenAdminBarDetail,
): Promise<Model> {
  pathname = path
  const appOverrides = await shellOverridesFor(path, stored)
  let model: Model | null = null
  function Probe() {
    model = useSettingsPanel(detail)
    return null
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(
      <PageAdminProvider value={{ role, staffRole: null, webRole: 'none', appOverrides }}>
        <Probe />
      </PageAdminProvider>,
    )
  })
  if (!model) throw new Error('the panel hook did not run')
  return model
}

const ids = (m: Model) => m.searchApps.map((a) => a.id)

// One App per page kind: where it renders, who sees it, and the trigger detail a Space rail opens with.
const CASES: {
  kind: string
  path: string
  role: CommunityRole
  appId: string
  detail?: OpenAdminBarDetail
}[] = [
  { kind: 'global', path: '/feed', role: 'member', appId: 'account.appearance' },
  { kind: 'profile', path: '/people/alex', role: 'member', appId: 'account.profile' },
  { kind: 'circle', path: '/circles/the-grove', role: 'host', appId: 'circle.crm' },
  { kind: 'event', path: '/events/full-moon', role: 'host', appId: 'event.crm' },
  {
    kind: 'space',
    path: '/spaces/royal-temple',
    role: 'member',
    appId: 'space.basics',
    detail: { scope: { kind: 'space', id: 'space-db-id' }, spaceType: 'business', spaceFns: [] },
  },
]

describe('a global App disable wins on every page kind (LIVE-686)', () => {
  it.each(CASES)('$kind page: the App shows by default and hides once disabled at global', async (c) => {
    expect(adminScopeFor(c.path)?.kind).toBe(c.kind)

    const shown = await panelFor(c.path, c.role, {}, c.detail)
    expect(ids(shown)).toContain(c.appId)
    act(() => root!.unmount())
    root = null

    const hidden = await panelFor(c.path, c.role, { global: { [c.appId]: OFF } }, c.detail)
    expect(ids(hidden)).not.toContain(c.appId)
    // Nothing else moved: the global disable took exactly the one App.
    expect(ids(hidden)).toEqual(ids(shown).filter((id) => id !== c.appId))
  })

  it('a global disable beats an explicit enable saved at the page scope', async () => {
    const m = await panelFor('/circles/the-grove', 'host', {
      global: { 'circle.crm': OFF },
      circle: { 'circle.crm': { enabled: true, position: 0, minRole: null } },
    })
    expect(ids(m)).not.toContain('circle.crm')
  })

  it('on a profile page only the global disable travels, not a global role floor', async () => {
    // A global min_role floor is about the global rail. A member on their own profile still sees
    // the Profile editor; only the disable reaches this page.
    const m = await panelFor('/people/alex', 'member', {
      global: { 'account.profile': { enabled: true, position: null, minRole: 'mentor' } },
    })
    expect(ids(m)).toContain('account.profile')
  })

  it('circle, event and Space rails never carry a personal App, disabled or not', async () => {
    for (const c of CASES.filter((x) => x.kind === 'circle' || x.kind === 'event' || x.kind === 'space')) {
      const m = await panelFor(c.path, c.role, {}, c.detail)
      expect(ids(m).filter((id) => PERSONAL_MODULE_IDS.has(id))).toEqual([])
      act(() => root!.unmount())
      root = null
    }
  })
})
