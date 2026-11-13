// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CampaignLearningPanel, campaignLearningDestination } from './campaign-learning-panel'

let host: HTMLDivElement
let root: Root
const analyze = vi.fn()
const apply = vi.fn()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  analyze.mockReset()
  apply.mockReset()
  analyze.mockResolvedValue({ ok: false, error: 'No campaign evidence is available.' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const button = (label: string) => [...host.querySelectorAll('button')].find((node) => node.textContent === label)!
const review = {
  sourceCampaignId: 'sent-first', targetCampaignId: 'draft-next', strategy: 'personal_preview' as const,
  expectedFingerprint: 'draft-fingerprint', expectedProposalFingerprint: 'proposal-fingerprint',
  observedThrough: '2026-11-13T16:00:00Z', metrics: [{ label: 'Attributed attendance', value: null }],
  limitations: ['Email events do not establish attendance or hosting intent.'],
  findings: ['The source campaign has recorded clicks; repeat and automated clicks may be included.'],
  audienceNote: 'A participant warmup is the conservative next step for this audience.',
  proposal: { subject: 'Take a look around', preheader: 'Find one gathering that interests you.', body: 'Here is the proposed invitation for you to review.', fromName: 'Daniel', destination: 'https://frequencylocal.com/events?utm_source=frequency&utm_medium=email&utm_campaign=warmup', changes: ['Use one public next step.'] },
  target: { subject: 'The next draft', status: 'scheduled', scheduledFor: '2026-11-14T16:00:00Z', segment: 'Warm participants' },
}

it('requires an explicit analysis request and does not apply or send anything when analysis is unavailable', async () => {
  await act(async () => root.render(<CampaignLearningPanel targetCampaignId="draft-next" sourceCampaigns={[{ id: 'sent-first', subject: 'The first invitation' }]} analyzeAction={analyze} applyRevisionAction={apply} />))
  expect(analyze).not.toHaveBeenCalled()
  expect(apply).not.toHaveBeenCalled()
  expect(host.textContent).toContain('Participant warmup')
  expect(host.textContent).toContain('Host follow-up')
  await act(async () => button('Analyze and prepare a revision').click())
  expect(analyze).toHaveBeenCalledWith('sent-first', 'draft-next', 'personal_preview')
  expect(host.textContent).toContain('No campaign evidence is available')
  expect(apply).not.toHaveBeenCalled()
})

it('makes no request when there is no sent source campaign to compare', async () => {
  await act(async () => root.render(<CampaignLearningPanel targetCampaignId="draft-next" sourceCampaigns={[]} analyzeAction={analyze} applyRevisionAction={apply} />))
  expect(button('Analyze and prepare a revision').disabled).toBe(true)
  expect(host.textContent).toContain('Choose a sent campaign')
  expect(analyze).not.toHaveBeenCalled()
})

it('requires review before applying and passes only server-recomputed fingerprints, never client-written email text', async () => {
  const onApplied = vi.fn()
  analyze.mockResolvedValue({ ok: true, review })
  apply.mockResolvedValue({ ok: true, campaignId: 'draft-next' })
  await act(async () => root.render(<CampaignLearningPanel targetCampaignId="draft-next" sourceCampaigns={[{ id: 'sent-first', subject: 'The first invitation' }]} analyzeAction={analyze} applyRevisionAction={apply} onApplied={onApplied} />))
  await act(async () => button('Analyze and prepare a revision').click())
  expect(host.textContent).toContain('Not measured')
  expect(host.textContent).toContain('Email events do not establish attendance')
  expect(host.textContent).toContain('Take a look around')
  expect(host.querySelector('[aria-label="Proposed email revision"] a')?.getAttribute('href')).toBe(review.proposal.destination)
  expect(host.textContent).toContain('clears that schedule')
  expect(button('Apply reviewed revision to draft').disabled).toBe(true)
  expect(apply).not.toHaveBeenCalled()
  await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click())
  await act(async () => button('Apply reviewed revision to draft').click())
  expect(apply).toHaveBeenCalledExactlyOnceWith({ sourceCampaignId: 'sent-first', targetCampaignId: 'draft-next', strategy: 'personal_preview', expectedFingerprint: 'draft-fingerprint', expectedProposalFingerprint: 'proposal-fingerprint', reviewed: true })
  expect(onApplied).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('Nothing was sent')
  expect(button('Apply reviewed revision to draft').disabled).toBe(true)
})

it('does not treat email engagement as permission to target hosts', async () => {
  await act(async () => root.render(<CampaignLearningPanel targetCampaignId="draft-next" sourceCampaigns={[{ id: 'sent-first', subject: 'The first invitation' }]} analyzeAction={analyze} applyRevisionAction={apply} />))
  const strategy = host.querySelectorAll('select')[1]
  await act(async () => { strategy.value = 'host_followup'; strategy.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(button('Analyze and prepare a revision').disabled).toBe(true)
  expect(host.textContent).toContain('known hosting interest')
  await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click())
  await act(async () => button('Analyze and prepare a revision').click())
  expect(analyze).toHaveBeenCalledWith('sent-first', 'draft-next', 'host_followup')
  expect(apply).not.toHaveBeenCalled()
})

it('discards a late analysis when the source campaign changes', async () => {
  let resolve: (value: unknown) => void = () => {}
  analyze.mockImplementation(() => new Promise((done) => { resolve = done }))
  await act(async () => root.render(<CampaignLearningPanel targetCampaignId="draft-next" sourceCampaigns={[{ id: 'sent-first', subject: 'First' }, { id: 'sent-second', subject: 'Second' }]} analyzeAction={analyze} applyRevisionAction={apply} />))
  await act(async () => button('Analyze and prepare a revision').click())
  const source = host.querySelector('select')!
  await act(async () => { source.value = 'sent-second'; source.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => resolve({ ok: true, review }))
  expect(host.querySelector('[aria-label="Proposed email revision"]')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})

it('accepts the real public campaign destinations without allowing an external or wrong-strategy preview', () => {
  const personal = 'https://frequencylocal.com/events?utm_source=frequency&utm_medium=email'
  const host = 'https://frequencylocal.com/create-a-space?utm_campaign=hosts'
  expect(campaignLearningDestination(personal, 'personal_preview')).toBe(personal)
  expect(campaignLearningDestination(host, 'host_followup')).toBe(host)
  expect(campaignLearningDestination('/events', 'personal_preview')).toBe('https://frequencylocal.com/events')
  for (const unsafe of ['https://external.test/events', 'https://frequencylocal.com@external.test/events', 'http://frequencylocal.com/events', '//external.test/events', 'javascript:alert(1)', 'https://frequencylocal.com:8443/events', host]) {
    expect(campaignLearningDestination(unsafe, 'personal_preview')).toBeNull()
  }
  expect(campaignLearningDestination(personal, 'host_followup')).toBeNull()
})

it('keeps apply unavailable when a returned proposal has an unapproved destination', async () => {
  analyze.mockResolvedValue({ ok: true, review: { ...review, proposal: { ...review.proposal, destination: 'https://external.test/events' } } })
  await act(async () => root.render(<CampaignLearningPanel targetCampaignId="draft-next" sourceCampaigns={[{ id: 'sent-first', subject: 'First' }]} analyzeAction={analyze} applyRevisionAction={apply} />))
  await act(async () => button('Analyze and prepare a revision').click())
  expect(host.textContent).toContain('The proposed destination is not approved')
  expect(button('Apply reviewed revision to draft').disabled).toBe(true)
  expect(apply).not.toHaveBeenCalled()
})
