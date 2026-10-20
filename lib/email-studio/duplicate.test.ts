import { describe, expect, it } from 'vitest'
import { duplicateCampaign } from './duplicate'

const src = { subject: 'Spring sound bath', preheader: 'Doors at 6', block_json: { rows: [] }, fromName: ' River Studio ', replyMode: 'conversation' as const }

describe('duplicateCampaign', () => {
  it('copies the content and starts a draft owned by the copier', () => {
    expect(duplicateCampaign(src, 'p1')).toEqual({
      block_json: { rows: [] },
      body: '',
      subject: 'Copy of Spring sound bath',
      preheader: 'Doors at 6',
      status: 'draft',
      created_by: 'p1',
      reply_mode: 'conversation',
      from_name: 'River Studio',
    })
  })
  it('carries none of the send history', () => {
    const keys = Object.keys(duplicateCampaign(src, 'p1'))
    for (const k of ['scheduled_for', 'approval_status', 'segment', 'test_sent_at', 'sent_at']) expect(keys).not.toContain(k)
  })
  it('leaves an empty subject empty and never stacks the prefix', () => {
    expect(duplicateCampaign({ ...src, subject: null }, 'p1').subject).toBe('')
    expect(duplicateCampaign({ ...src, subject: 'Copy of Spring' }, 'p1').subject).toBe('Copy of Spring')
  })
  it('omits an empty From name', () => {
    expect(duplicateCampaign({ ...src, fromName: '  ' }, 'p1')).not.toHaveProperty('from_name')
  })
})
