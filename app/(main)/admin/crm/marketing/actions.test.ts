import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE APPROVAL QUEUE'S SERVER ACTIONS (LIVE-058). The contract these lock: each action is a
// THIN delegate to the approval spine's transition and nothing more. The spine self-gates on
// approverGate and writes the audit row, so the actions must (1) pass the exact campaign ref
// through, and (2) follow the form-action convention (lib/action-result.ts): success is
// silence, and a spine failure — a gate denial included — THROWS with the spine's exact
// message. A denial that dissolved into a silent no-op would be an invisible regression of
// the governing rule (nothing sends without approval), so the loud path is the tested one.

vi.mock('@/lib/outbound/approvals', () => ({
  approve: vi.fn(),
  pause: vi.fn(),
  cancel: vi.fn(),
  markReady: vi.fn(),
}))

import { approve, pause, cancel, markReady } from '@/lib/outbound/approvals'
import {
  approveCampaignAction,
  pauseCampaignAction,
  cancelCampaignAction,
  markReadyCampaignAction,
} from './actions'

const DENIAL = 'Only an admin or executive admin can approve outbound.'
const DENIED = { error: DENIAL }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the approval queue actions delegate to the spine, ref intact', () => {
  it('approveCampaignAction calls approve with the campaign ref and resolves on success', async () => {
    vi.mocked(approve).mockResolvedValue({ data: undefined })
    await expect(approveCampaignAction('camp-1')).resolves.toBeUndefined()
    expect(approve).toHaveBeenCalledTimes(1)
    expect(approve).toHaveBeenCalledWith({ type: 'campaign', id: 'camp-1' })
  })

  it('pauseCampaignAction calls pause with the campaign ref and resolves on success', async () => {
    vi.mocked(pause).mockResolvedValue({ data: undefined })
    await expect(pauseCampaignAction('camp-2')).resolves.toBeUndefined()
    expect(pause).toHaveBeenCalledWith({ type: 'campaign', id: 'camp-2' })
  })

  it('cancelCampaignAction calls cancel with the campaign ref and resolves on success', async () => {
    vi.mocked(cancel).mockResolvedValue({ data: undefined })
    await expect(cancelCampaignAction('camp-3')).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledWith({ type: 'campaign', id: 'camp-3' })
  })

  it('markReadyCampaignAction calls markReady with the campaign ref and resolves on success', async () => {
    vi.mocked(markReady).mockResolvedValue({ data: undefined })
    await expect(markReadyCampaignAction('camp-4')).resolves.toBeUndefined()
    expect(markReady).toHaveBeenCalledWith({ type: 'campaign', id: 'camp-4' })
  })
})

describe("the spine's gate verdict is loud: a denial throws its exact message, never a silent no-op", () => {
  it('approve denial throws verbatim', async () => {
    vi.mocked(approve).mockResolvedValue(DENIED)
    await expect(approveCampaignAction('camp-1')).rejects.toThrow(DENIAL)
  })
  it('pause denial throws verbatim', async () => {
    vi.mocked(pause).mockResolvedValue(DENIED)
    await expect(pauseCampaignAction('camp-1')).rejects.toThrow(DENIAL)
  })
  it('cancel denial throws verbatim', async () => {
    vi.mocked(cancel).mockResolvedValue(DENIED)
    await expect(cancelCampaignAction('camp-1')).rejects.toThrow(DENIAL)
  })
  it('markReady denial throws verbatim', async () => {
    vi.mocked(markReady).mockResolvedValue(DENIED)
    await expect(markReadyCampaignAction('camp-1')).rejects.toThrow(DENIAL)
  })
})
