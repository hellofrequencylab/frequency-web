// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MessagingCampaignItem } from '@/lib/messaging/console'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), analyze: vi.fn(), apply: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/app/(main)/admin/email-studio/actions', () => ({ deleteEmailDraft: vi.fn(), analyzeCampaignLearningAction: mocks.analyze, applyCampaignLearningRevisionAction: mocks.apply }))
vi.mock('@/components/admin/messaging/messaging-console', () => ({ MessagingConsole: () => null }))
vi.mock('@/components/admin/crm/campaign-analytics-expansion', () => ({ CampaignAnalyticsExpansion: () => null }))
vi.mock('@/components/admin/crm/marketing-compose-popup', () => ({ MarketingComposePopup: ({ open, onClose }: { open: boolean; onClose: () => void }) => open ? <div data-testid="compose-popup"><button onClick={onClose}>Close mock composer</button></div> : null }))
vi.mock('@/modules/email-design/client', () => ({ CampaignLearningPanel: ({ targetCampaignId, sourceCampaigns }: { targetCampaignId: string; sourceCampaigns: Array<{ id: string }> }) => <div data-testid="learning-panel" data-target={targetCampaignId} data-sources={JSON.stringify(sourceCampaigns.map((source) => source.id))} /> }))

import { MarketingWorkspace } from './marketing-workspace'
let host: HTMLDivElement
let root: Root
const campaign = (id: string, status: MessagingCampaignItem['status']): MessagingCampaignItem => ({ kind: 'campaign', id, name: id, status, segment: 'all', recipientCount: 0, sentAt: status === 'sent' ? '2026-11-13T12:00:00Z' : null, href: '/admin/crm/marketing' })
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const render = async (campaigns: MessagingCampaignItem[], openCampaignId?: string) => act(async () => root.render(<MarketingWorkspace campaigns={campaigns} funnels={[]} segments={[]} openCampaignId={openCampaignId} />))
const choose = async (id: string) => act(async () => {
  const select = host.querySelector('select')!
  select.value = id; select.dispatchEvent(new Event('change', { bubbles: true }))
})

it('offers only eligible upcoming targets and only sent source campaigns', async () => {
  const rows = [campaign('past-one', 'sent'), campaign('past-two', 'sent'), ...(['draft', 'scheduled', 'paused', 'live', 'archived', 'failed', 'stalled'] as const).map((status) => campaign(status, status))]
  await render(rows)
  expect([...host.querySelectorAll('option')].map((option) => option.value)).toEqual(['', 'draft', 'scheduled', 'paused'])
  await choose('scheduled')
  const panel = host.querySelector('[data-testid="learning-panel"]')!
  expect(panel.getAttribute('data-target')).toBe('scheduled')
  expect(JSON.parse(panel.getAttribute('data-sources')!)).toEqual(['past-one', 'past-two'])
  expect(mocks.analyze).not.toHaveBeenCalled()
  expect(mocks.apply).not.toHaveBeenCalled()
})

it('hides learning while the composer is open, including deep-linked composition', async () => {
  const rows = [campaign('past', 'sent'), campaign('next', 'draft')]
  await render(rows)
  await choose('next')
  expect(host.querySelector('[data-testid="learning-panel"]')).not.toBeNull()
  const newEmail = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('New email'))!
  await act(async () => newEmail.click())
  expect(host.querySelector('[data-testid="compose-popup"]')).not.toBeNull()
  expect(host.querySelector('[aria-label="Learn from a past email"]')).toBeNull()
  expect(host.querySelector('[data-testid="learning-panel"]')).toBeNull()
})

it('does not expose learning on a deep-linked composer mount', async () => {
  await render([campaign('past', 'sent'), campaign('next', 'draft')], 'next')
  expect(host.querySelector('[data-testid="compose-popup"]')).not.toBeNull()
  expect(host.querySelector('[aria-label="Learn from a past email"]')).toBeNull()
})

it('removes a selected learning target when a server refresh says it has already sent', async () => {
  await render([campaign('past', 'sent'), campaign('next', 'draft')])
  await choose('next')
  expect(host.querySelector('[data-testid="learning-panel"]')).not.toBeNull()
  await render([campaign('past', 'sent'), campaign('next', 'sent')])
  expect(host.querySelector('[data-testid="learning-panel"]')).toBeNull()
  expect(mocks.apply).not.toHaveBeenCalled()
})
