import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The panel imports the spine (which imports next/cache and the database seam) and its
// server actions; mock both so importing `orderQueue` stays a pure, node-env unit import.
vi.mock('@/lib/outbound/approvals', () => ({
  listReadyForApproval: vi.fn(),
  listOutboundByStatus: vi.fn(),
}))
vi.mock('@/app/(main)/admin/crm/marketing/actions', () => ({
  approveCampaignAction: vi.fn(),
  pauseCampaignAction: vi.fn(),
  cancelCampaignAction: vi.fn(),
  markReadyCampaignAction: vi.fn(),
}))

import { orderQueue } from './approval-queue'
import type { OutboundItem } from '@/lib/outbound/approvals'

// SHAPE + ORDERING tests for the approval queue (LIVE-058).
//
// The shape half pins the layering the spine's header demands: the panel and its actions
// reach the database ONLY through the spine's exported functions (lib/outbound/approvals.ts).
// A direct outboundDb / admin-client import here would be a second, ungated, unaudited path
// around "nothing sends without approval" — the exact hole the spine exists to close.

const ROOT = path.join(import.meta.dirname, '..', '..', '..')

/** Both files DOCUMENT the layering they must not break (their headers name outboundDb and
 *  approverGate on purpose), so the scan is comment-stripped: only code can fail it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

const PANEL = stripComments(readFileSync(path.join(ROOT, 'components/admin/crm/approval-queue.tsx'), 'utf8'))
const ACTIONS = stripComments(readFileSync(path.join(ROOT, 'app/(main)/admin/crm/marketing/actions.ts'), 'utf8'))

describe('approval queue shape: everything goes through the spine', () => {
  it.each([
    ['panel', PANEL],
    ['actions', ACTIONS],
  ])('the %s never opens its own database path (no outboundDb, no admin client)', (_name, src) => {
    expect(src).not.toMatch(/outboundDb/)
    expect(src).not.toMatch(/@\/lib\/outbound\/db/)
    expect(src).not.toMatch(/createAdminClient/)
    expect(src).not.toMatch(/@\/lib\/supabase/)
  })

  it('the actions import their transitions from the spine, and every queue verb is there', () => {
    const importLine = ACTIONS.match(/import\s*\{([^}]+)\}\s*from\s*'@\/lib\/outbound\/approvals'/)
    expect(importLine).not.toBeNull()
    const names = importLine![1].split(',').map((s) => s.trim())
    for (const fn of ['approve', 'pause', 'cancel', 'markReady']) {
      expect(names).toContain(fn)
    }
  })

  it('the actions never re-gate (the spine self-gates; a second gate would fork the rule)', () => {
    expect(ACTIONS).not.toMatch(/approverGate|writerGate|requireAdmin/)
  })

  it('the panel reads through the spine and stays a Server Component', () => {
    expect(PANEL).toMatch(/from '@\/lib\/outbound\/approvals'/)
    expect(PANEL).not.toMatch(/^'use client'/m)
  })
})

function item(over: Partial<OutboundItem>): OutboundItem {
  return {
    type: 'campaign',
    id: 'x',
    label: 'x',
    approvalStatus: 'ready',
    phaseId: null,
    segment: null,
    count: null,
    scheduledFor: null,
    createdAt: null,
    ...over,
  }
}

describe('orderQueue: the open decisions come first', () => {
  it('ready rows sort before draft and paused rows, newest first within each band', () => {
    const rows = [
      item({ id: 'old-draft', approvalStatus: 'draft', createdAt: '2026-01-01T00:00:00Z' }),
      item({ id: 'new-ready', approvalStatus: 'ready', createdAt: '2026-08-01T00:00:00Z' }),
      item({ id: 'new-paused', approvalStatus: 'paused', createdAt: '2026-07-01T00:00:00Z' }),
      item({ id: 'old-ready', approvalStatus: 'ready', createdAt: '2026-02-01T00:00:00Z' }),
    ]
    expect(orderQueue(rows).map((r) => r.id)).toEqual(['new-ready', 'old-ready', 'new-paused', 'old-draft'])
  })

  it('a missing or unparseable createdAt sinks to the end of its band instead of throwing', () => {
    const rows = [
      item({ id: 'undated', createdAt: null }),
      item({ id: 'dated', createdAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(orderQueue(rows).map((r) => r.id)).toEqual(['dated', 'undated'])
  })
})
