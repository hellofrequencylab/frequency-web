import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { FEATURE_KEYS } from './feature-keys'
import { fileToRoute, affectedFeatureKeys, affectedArticles } from './drift'
import { getAllCategories } from './content'

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

  // A dynamic segment is matched LITERALLY: fileToRoute keeps `[slug]` verbatim on both sides, so a
  // prefix written `/spaces/[slug]/settings/payments` matches the real files under
  // app/(main)/spaces/[slug]/settings/payments/ and nothing else. Spelling the segment any other way
  // (`[id]`, a concrete slug) fails the row above, which is the honest outcome: the prefix would never
  // fire in lib/help/drift.ts either. LIVE-305 added the first rows that carry one (payouts, billing).
  it('a dynamic segment in a prefix matches the walked tree verbatim (detector control)', () => {
    expect(appRoutes).toContain('/spaces/[slug]/settings/payments')
    expect(appRoutes).toContain('/spaces/[slug]/settings/billing')
    expect(appRoutes.some((r) => r.startsWith('/spaces/[id]/'))).toBe(false)
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

// LIVE-305. Money IN and money OUT are two keys. `billing` is what a Space pays Frequency and lives under
// /spaces/[slug]/settings/billing; `payouts` is what a Space receives and lives on the Get paid page plus
// the personal Receive payments card. Before this, `billing` sat on the bare '/spaces' prefix, so a
// change to the Get paid page flagged plans-and-pricing.md and billing.md (the 2026-09-10 audit watched
// it) and nothing at all demanded get-paid.md. These pin the join in both directions, first through the
// registry and then through the real articles on disk.
describe('the money surfaces resolve to the right key and the right article (LIVE-305)', () => {
  const GET_PAID = ['app/(main)/spaces/[slug]/settings/payments/page.tsx', 'app/(main)/spaces/[slug]/settings/payments/payments-body.tsx']
  const RECEIVE_PAYMENTS = ['app/(main)/settings/billing/section.tsx']
  const SPACE_BILLING = ['app/(main)/spaces/[slug]/settings/billing/page.tsx', 'app/(main)/spaces/[slug]/settings/billing/verify/page.tsx']

  it('the Get paid page flags `payouts` and NOT `billing`', () => {
    const keys = affectedFeatureKeys(GET_PAID, FEATURE_KEYS)
    expect(keys).toContain('payouts')
    expect(keys).not.toContain('billing')
  })
  it('the personal Receive payments card flags `payouts`', () => {
    expect(affectedFeatureKeys(RECEIVE_PAYMENTS, FEATURE_KEYS)).toContain('payouts')
  })
  it('the Space billing page (and verify beneath it) flags `billing` and NOT `payouts`', () => {
    const keys = affectedFeatureKeys(SPACE_BILLING, FEATURE_KEYS)
    expect(keys).toContain('billing')
    expect(keys).not.toContain('payouts')
  })
  it('a Space page that is neither flags neither (the old /spaces prefix over-fired)', () => {
    const keys = affectedFeatureKeys(['app/(main)/spaces/[slug]/page.tsx'], FEATURE_KEYS)
    expect(keys).not.toContain('billing')
    expect(keys).not.toContain('payouts')
  })

  it('a Get paid change routes to get-paid.md, not to plans-and-pricing.md or billing.md', async () => {
    const articles = (await getAllCategories({ includeDrafts: true })).flatMap((c) => c.articles)
    const slugs = affectedArticles(GET_PAID, articles, FEATURE_KEYS).map((a) => `${a.category}/${a.slug}`)
    expect(slugs).toContain('spaces/get-paid')
    expect(slugs).not.toContain('spaces/plans-and-pricing')
    expect(slugs).not.toContain('spaces/billing')
  })
  it('a Space billing change routes to billing.md and plans-and-pricing.md, not to get-paid.md', async () => {
    const articles = (await getAllCategories({ includeDrafts: true })).flatMap((c) => c.articles)
    const slugs = affectedArticles(SPACE_BILLING, articles, FEATURE_KEYS).map((a) => `${a.category}/${a.slug}`)
    expect(slugs).toContain('spaces/billing')
    expect(slugs).toContain('spaces/plans-and-pricing')
    expect(slugs).not.toContain('spaces/get-paid')
  })
})
