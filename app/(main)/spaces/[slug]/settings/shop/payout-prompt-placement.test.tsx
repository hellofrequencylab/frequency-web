import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CONNECT PROMPT SITS WHERE THE PRICE IS TYPED (LIVE-538, ADR-1539).
//
// The Shop console's Catalog tab is the console's default tab and the one ItemForm takes a price on;
// the New service Spark is where a bookable service gets its price, its price model and its deposit.
// Neither reached the one Connect prompt (lib/billing/payout-prompt.ts): it sat on the Storefront
// tab only, and the BUYER was the one refused, at click. This file pins the PLACEMENT the row
// decided, by running the real page functions with the reads stubbed and asking what they chose:
//
//   1. The console page mounts SpacePayoutSetupPrompt for orders AND bookings, above the tab body,
//      on Catalog and Orders, and NOT on Storefront (which keeps its own whenReady status card, so a
//      not-ready owner never reads two cards on one screen).
//   2. The New service page resolves the SPACE prompt (the owner is the payee, ADR-819) for bookings
//      and hands it to the Spark, which renders PayoutPromptCard as its doors aside on screen one.
//
// lib/billing/connect-prompt.test.tsx pins the same seams by source shape; this one pins the
// decision, so a refactor that keeps the import and drops the mount fails here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const {
  getCallerProfile,
  getVisibleSpaceBySlug,
  resolveSpaceManageAccess,
  getSpaceCapabilities,
  spaceFunctionAccess,
  resolveSpacePayoutPrompt,
  notFound,
} = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  getVisibleSpaceBySlug: vi.fn(),
  resolveSpaceManageAccess: vi.fn(),
  getSpaceCapabilities: vi.fn(),
  spaceFunctionAccess: vi.fn(),
  resolveSpacePayoutPrompt: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({ notFound, useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile, getMyProfileId: vi.fn() }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug }))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess, getSpaceCapabilities }))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess }))
vi.mock('@/lib/billing/payout-prompt-resolve', () => ({
  resolveSpacePayoutPrompt,
  resolveProfilePayoutPrompt: vi.fn(),
  resolveSpacePayoutPromptById: vi.fn(),
}))
// The tabs and the stats band do their own reads and are not this file's subject; the page's choice
// of WHAT to mount around them is. Each stub is a distinct component so the tree can be read by type.
vi.mock('./catalog-tab', () => ({ CatalogTab: () => null }))
vi.mock('./orders-tab', () => ({ OrdersTab: () => null }))
vi.mock('./storefront-tab', () => ({ StorefrontTab: () => null }))
vi.mock('@/lib/commerce/orders', () => ({ spaceEarningsSummary: vi.fn() }))
// The buttons are client components importing a 'use server' module; the card's contract is which
// button it renders, so a stub that prints the label is the whole thing under test.
vi.mock('@/components/billing/payout-controls', () => ({
  StartPayoutButton: ({ label }: { label?: string }) => <button data-action="onboard">{label ?? 'Set up payouts'}</button>,
  ManagePayoutButton: () => <button data-action="manage">Manage payouts</button>,
}))

import SpaceShopConsolePage from './page'
import { CatalogTab } from './catalog-tab'
import { OrdersTab } from './orders-tab'
import { StorefrontTab } from './storefront-tab'
import NewSpaceServicePage from '../services/new/page'
import { ServiceSpark } from '../services/new/service-spark'
import { SpacePayoutSetupPrompt } from '@/components/billing/payout-setup-prompt'
import { PayoutPromptCard } from '@/components/billing/payout-prompt-card'
import type { PayoutPrompt } from '@/lib/billing/payout-prompt'

const OWNER = 'owner-1'
const SPACE = {
  id: 'space-1',
  slug: 'riverbend',
  name: 'Riverbend Studio',
  brandName: null,
  type: 'business',
  ownerProfileId: OWNER,
  preferences: {},
}

/** Depth-first walk of a React element tree, in document order, without rendering it. */
function* walk(node: ReactNode): Generator<ReactElement> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n)
    return
  }
  if (!isValidElement(node)) return
  yield node
  const props = node.props as { children?: ReactNode }
  yield* walk(props.children)
}

const TAB_BODY = { catalog: CatalogTab, orders: OrdersTab, storefront: StorefrontTab } as const

async function consoleTree(tab?: string) {
  return SpaceShopConsolePage({
    params: Promise.resolve({ slug: SPACE.slug }),
    searchParams: Promise.resolve(tab ? { tab } : {}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getCallerProfile.mockResolvedValue({ id: OWNER, webRole: 'member' })
  getVisibleSpaceBySlug.mockResolvedValue(SPACE)
  resolveSpaceManageAccess.mockResolvedValue({ canManage: true, staffViewing: false })
  getSpaceCapabilities.mockResolvedValue({ role: 'owner' })
  spaceFunctionAccess.mockReturnValue(true)
  resolveSpacePayoutPrompt.mockResolvedValue(null)
})

describe('the Shop console mounts the one Connect prompt above the tab body (LIVE-538)', () => {
  for (const tab of ['catalog', 'orders'] as const) {
    it(`${tab}: the prompt is mounted for orders and bookings, for the space and the viewer, before the tab`, async () => {
      const tree = await consoleTree(tab === 'catalog' ? undefined : tab)
      const els = [...walk(tree)]
      const promptAt = els.findIndex((el) => el.type === SpacePayoutSetupPrompt)
      expect(promptAt, 'the console renders no SpacePayoutSetupPrompt').toBeGreaterThan(-1)
      const prompt = els[promptAt].props as {
        space: unknown
        viewerProfileId: string | null
        channels: string[]
        whenReady?: string
      }
      expect(prompt.space).toBe(SPACE)
      expect(prompt.viewerProfileId).toBe(OWNER)
      expect([...prompt.channels].sort()).toEqual(['bookings', 'orders'])
      // A console-level card is a nudge: silent once the owner is ready (ADR-1158). The Storefront
      // tab's status card is the one that shows the dashboard link.
      expect(prompt.whenReady).toBeUndefined()
      // Above the tab body, not under a half-scrolled list.
      const tabAt = els.findIndex((el) => el.type === TAB_BODY[tab])
      expect(tabAt, 'the tab body did not render').toBeGreaterThan(-1)
      expect(promptAt).toBeLessThan(tabAt)
    })
  }

  it('storefront: keeps its own status card and the console mounts no second one', async () => {
    const tree = await consoleTree('storefront')
    const els = [...walk(tree)]
    expect(els.some((el) => el.type === SpacePayoutSetupPrompt)).toBe(false)
    expect(els.some((el) => el.type === TAB_BODY.storefront)).toBe(true)
  })

  it('a staff previewer reads the prompt too: it is a setup step for the owner, never a gate', async () => {
    resolveSpaceManageAccess.mockResolvedValue({ canManage: false, staffViewing: true })
    const tree = await consoleTree()
    expect([...walk(tree)].some((el) => el.type === SpacePayoutSetupPrompt)).toBe(true)
  })
})

describe('the New service page resolves the Space prompt for bookings and the Spark renders it (LIVE-538)', () => {
  const PROMPT: PayoutPrompt = {
    state: 'needs_setup',
    relation: 'self',
    channels: ['bookings'],
    headline: 'Add a payout account to get paid',
    body: 'Add a payout account to start taking paid bookings.',
    action: 'onboard',
    actionLabel: 'Set up payouts',
  }

  it('resolves the SPACE payee (the owner, ADR-819) for the bookings channel and hands it to the Spark', async () => {
    resolveSpacePayoutPrompt.mockResolvedValue(PROMPT)
    const el = (await NewSpaceServicePage({ params: Promise.resolve({ slug: SPACE.slug }) })) as ReactElement
    expect(resolveSpacePayoutPrompt).toHaveBeenCalledTimes(1)
    expect(resolveSpacePayoutPrompt).toHaveBeenCalledWith({
      space: SPACE,
      viewerProfileId: OWNER,
      channels: ['bookings'],
    })
    expect(el.type).toBe(ServiceSpark)
    expect((el.props as { payoutPrompt: unknown }).payoutPrompt).toBe(PROMPT)
  })

  it('the Spark renders the shared card as its doors aside, on the first screen', () => {
    const el = ServiceSpark({ slug: SPACE.slug, spaceId: SPACE.id, spaceName: SPACE.name, payoutPrompt: PROMPT }) as ReactElement
    const doors = (el.props as { doors: { aside?: ReactNode } }).doors
    const aside = doors.aside
    expect(isValidElement(aside)).toBe(true)
    expect((aside as ReactElement).type).toBe(PayoutPromptCard)
    expect(((aside as ReactElement).props as { prompt: unknown }).prompt).toBe(PROMPT)
    // And that card offers onboarding inline, not a link to a settings page.
    const html = renderToStaticMarkup(aside as ReactElement)
    expect(html).toContain('Add a payout account to get paid')
    expect(html).toContain('data-action="onboard"')
    expect(html).not.toMatch(/href=["'`]\/settings\/billing/)
  })

  it('a ready owner reads nothing on the Spark (ADR-1158)', () => {
    const el = ServiceSpark({ slug: SPACE.slug, spaceId: SPACE.id, spaceName: SPACE.name, payoutPrompt: null }) as ReactElement
    const aside = (el.props as { doors: { aside?: ReactNode } }).doors.aside
    expect(renderToStaticMarkup(aside as ReactElement)).toBe('')
  })
})
