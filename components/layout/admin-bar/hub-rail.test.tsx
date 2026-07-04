import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Settings, CreditCard } from 'lucide-react'
import type { BankLink } from '@/lib/admin/rail-bank'

// The Hub self-fetches its stats in an effect (which SSR does not run), so we stub the getter modules to
// keep this test hermetic (no supabase import) and assert the archetype-level contract: the Hub body
// mounts and promotes the bank quick-links into a "Go to" grid. ADR-516 Phase B.
vi.mock('@/app/(main)/settings/rail-getters', () => ({ getMemberHubData: vi.fn().mockResolvedValue(null) }))
vi.mock('@/app/(main)/spaces/[slug]/manage/rail-getters', () => ({ getSpaceHubData: vi.fn().mockResolvedValue(null) }))

import { HubRail } from './hub-rail'

const BANK: BankLink[] = [
  { label: 'All settings', icon: Settings, href: '/settings' },
  { label: 'Billing', icon: CreditCard, href: '/settings/billing' },
]

describe('HubRail (ADR-516 Phase B) — renders on the hub archetype', () => {
  it('renders the member Hub with the bank promoted into a "Go to" grid', () => {
    const html = renderToStaticMarkup(<HubRail spec={{ kind: 'member' }} bank={BANK} />)
    expect(html).toContain('Go to')
    expect(html).toContain('All settings')
    expect(html).toContain('/settings/billing')
  })

  it('renders the Space Hub with its bank too', () => {
    const html = renderToStaticMarkup(<HubRail spec={{ kind: 'space', slug: 'demo' }} bank={BANK} />)
    expect(html).toContain('Go to')
    expect(html).toContain('All settings')
  })
})
