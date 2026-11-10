import { describe, expect, it } from 'vitest'
import { flowwebMeta, leadStatus, nextStatus, parseCrmItem, planMessages, type CrmItem } from './crm'

const post = (draft: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  flow: 'neighborhood-activation',
  lead: { email: 'Hello@FrontPorch.example', name: 'Front Porch Gallery', org: 'Front Porch Gallery', source_url: 'https://frontporch.example/events', region: 'north-county-sd', hunt: 'North County community events' },
  draft: { tag: 'd-7f3a9c', subject: 'A local connection', body: 'Hi Front Porch Gallery team.', created_at: '2026-11-10T08:00:00Z', ...draft },
  ...extra,
})
const item = (draft: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => parseCrmItem(post(draft, extra)) as CrmItem

describe('parseCrmItem', () => {
  it('keeps an email lead and lowercases the address', () => {
    const it1 = item()
    expect(it1.email).toBe('hello@frontporch.example')
    expect(it1.tag).toBe('d-7f3a9c')
    expect(it1.sentAt).toBeNull()
  })
  it('refuses a lead without an email, a bad tag or an empty body', () => {
    expect(parseCrmItem({ ...post(), lead: { name: 'x' } })).toHaveProperty('error')
    expect(parseCrmItem(post({ tag: 'Bad Tag!' }))).toHaveProperty('error')
    expect(parseCrmItem(post({ body: '  ' }))).toHaveProperty('error')
    expect(parseCrmItem('nope')).toHaveProperty('error')
  })
  it('drops a source url that is not http', () => {
    expect(parseCrmItem({ ...post(), lead: { email: 'a@b.co', source_url: 'javascript:alert(1)' } })).toHaveProperty('sourceUrl', null)
  })
})

describe('the lead thread', () => {
  it('moves open, waiting, in progress, resolved, closed', () => {
    expect(leadStatus(item(), false)).toBe('open')
    expect(leadStatus(item({ sent_at: '2026-11-10T09:00:00Z' }), false)).toBe('waiting')
    expect(leadStatus(item({ sent_at: '2026-11-10T09:00:00Z', replied_at: '2026-11-11T09:00:00Z' }), false)).toBe('in_progress')
    expect(leadStatus(item({ sent_at: '2026-11-10T09:00:00Z' }), true)).toBe('resolved')
    expect(leadStatus(item({ declined_at: '2026-11-11T09:00:00Z' }), true)).toBe('closed')
  })
  it('plans one keyed message per step, and only the send and a pasted reply leave the internal lane', () => {
    const msgs = planMessages(item({ sent_at: '2026-11-10T09:00:00Z', replied_at: '2026-11-11T09:00:00Z' }), false)
    expect(msgs.map((m) => m.step)).toEqual(['drafted', 'sent', 'replied'])
    expect(new Set(msgs.map((m) => m.key)).size).toBe(3)
    expect(msgs.filter((m) => !m.internal).map((m) => m.step)).toEqual(['sent'])
    const withReply = planMessages(item({ sent_at: '2026-11-10T09:00:00Z', replied_at: '2026-11-11T09:00:00Z' }, { reply: 'Yes please!' }), false)
    expect(withReply.find((m) => m.step === 'replied')).toMatchObject({ direction: 'inbound', authorKind: 'contact', body: 'Yes please!', internal: false })
  })
  it('keys are stable, so a repeat post adds nothing', () => {
    const a = planMessages(item({ sent_at: '2026-11-10T09:00:00Z' }), false).map((m) => m.key)
    const b = planMessages(item({ sent_at: '2026-11-10T09:00:00Z' }), false).map((m) => m.key)
    expect(a).toEqual(b)
  })
  it('never pulls a thread back', () => {
    expect(nextStatus('open', 'waiting')).toBe('waiting')
    expect(nextStatus('in_progress', 'waiting')).toBeNull()
    expect(nextStatus('resolved', 'in_progress')).toBeNull()
    expect(nextStatus('resolved', 'closed')).toBe('closed')
    expect(nextStatus('waiting', 'waiting')).toBeNull()
  })
  it('remembers every draft on the contact without losing earlier facts', () => {
    const first = flowwebMeta(item(), null)
    const second = flowwebMeta({ ...item(), tag: 'd-2', org: null }, first)
    expect(second.drafts).toEqual(['d-7f3a9c', 'd-2'])
    expect(second.org).toBe('Front Porch Gallery')
    expect(flowwebMeta(item(), second).drafts).toEqual(['d-7f3a9c', 'd-2'])
  })
})
