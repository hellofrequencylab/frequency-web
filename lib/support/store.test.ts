import { describe, it, expect, vi, beforeEach } from 'vitest'

// EXECUTING tests for the support ticket store (scan2 L8-06, 2026-09-05). Twenty-four tests
// `vi.mock` this module and none call it, so the reads and writes behind /support and the staff
// console had no test that could notice a wrong table, a dropped filter, or a refused insert being
// swallowed. These call the REAL module against a table-aware fake of the admin client that
// records every chain (which table, which filters, which payload) and replies from a script.
//
// The pattern is the recorder used by lib/core/load-capabilities.test.ts; the storage half is a
// second fake with the same shape, because screenshots go through a private bucket.

type Reply = { data?: unknown; error?: { message: string } | null; count?: number | null }
type Call = { table: string; chain: [string, unknown[]][] }

const script = new Map<string, Reply[]>()
const calls: Call[] = []
const reply = (table: string, r: Reply) => script.set(table, [...(script.get(table) ?? []), r])

function builder(table: string): unknown {
  const call: Call = { table, chain: [] }
  calls.push(call)
  const p: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            const r = (script.get(table) ?? []).shift() ?? {}
            return Promise.resolve({ data: null, error: null, count: null, ...r }).then(res, rej)
          }
        }
        if (typeof prop === 'symbol') return undefined
        return (...args: unknown[]) => {
          call.chain.push([prop, args])
          return p
        }
      },
    },
  )
  return p
}

const storage = {
  createSignedUrl: vi.fn(),
  upload: vi.fn(),
}
const fakeAdmin = {
  from: (table: string) => builder(table),
  storage: { from: vi.fn(() => storage) },
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin }))

import {
  createTicket,
  listMyTickets,
  getTicketForViewer,
  getTicketAdmin,
  addMemberMessage,
  addStaffMessage,
  updateTicketFields,
  listTickets,
  openTicketCount,
  ticketCountForProfile,
  supportSummaryForVera,
  uploadScreenshot,
} from './store'
import { OPEN_STATUSES } from './types'

const writes = (table: string, method: 'insert' | 'update') =>
  calls.filter((c) => c.table === table && c.chain.some(([m]) => m === method))
const payload = (c: Call, method: string) => c.chain.find(([m]) => m === method)?.[1][0] as Record<string, unknown>
const filters = (c: Call) => c.chain.filter(([m]) => ['eq', 'in', 'ilike', 'order', 'limit'].includes(m)).map(([m, a]) => `${m}(${a.map((x) => JSON.stringify(x)).join(',')})`)

const ROW = {
  id: 't1',
  ref: 42,
  profile_id: 'p-me',
  type: 'bug',
  subject: 'The map is blank',
  status: 'open',
  priority: 'normal',
  page_url: '/nearby',
  context: { pathname: '/nearby' },
  screenshot_path: null,
  assigned_to: null,
  resolved_at: null,
  last_activity_at: '2026-09-01T00:00:00.000Z',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

beforeEach(() => {
  script.clear()
  calls.length = 0
  storage.createSignedUrl.mockReset()
  storage.upload.mockReset()
  fakeAdmin.storage.from.mockClear()
})

describe('createTicket', () => {
  it('inserts the ticket, trims and caps the subject, then files the opening message under the new id', async () => {
    reply('support_tickets', { data: { id: 't1', ref: 42 } })
    const res = await createTicket({
      profileId: 'p-me',
      type: 'bug',
      subject: `  ${'x'.repeat(200)}  `,
      body: '  it is blank  ',
      pageUrl: '/nearby',
    })
    expect(res).toEqual({ id: 't1', ref: 42 })

    const ticket = writes('support_tickets', 'insert')[0]
    const inserted = payload(ticket, 'insert')
    expect(inserted.profile_id).toBe('p-me')
    expect(inserted.type).toBe('bug')
    expect((inserted.subject as string).length).toBe(160)
    expect(inserted.page_url).toBe('/nearby')
    expect(inserted.screenshot_path).toBeNull()
    expect(typeof inserted.last_activity_at).toBe('string')

    const message = writes('support_ticket_messages', 'insert')[0]
    expect(payload(message, 'insert')).toEqual({
      ticket_id: 't1',
      author_id: 'p-me',
      author_kind: 'member',
      body: 'it is blank',
    })
  })

  it('files no message when the body is blank', async () => {
    reply('support_tickets', { data: { id: 't1', ref: 42 } })
    await createTicket({ profileId: 'p-me', type: 'question', subject: 'Hi', body: '   ' })
    expect(writes('support_ticket_messages', 'insert')).toEqual([])
  })

  it('surfaces a refused insert as the thrown error, and writes no message for a ticket that does not exist', async () => {
    reply('support_tickets', { data: null, error: { message: 'new row violates row-level security policy' } })
    await expect(
      createTicket({ profileId: 'p-me', type: 'bug', subject: 'Hi', body: 'there' }),
    ).rejects.toThrow('new row violates row-level security policy')
    expect(writes('support_ticket_messages', 'insert')).toEqual([])
  })

  it('treats a silent empty reply as a failure too, never as a ticket', async () => {
    reply('support_tickets', { data: null, error: null })
    await expect(
      createTicket({ profileId: 'p-me', type: 'bug', subject: 'Hi', body: 'there' }),
    ).rejects.toThrow('Could not create the ticket.')
  })
})

describe('member reads', () => {
  it('listMyTickets reads the member\'s own rows newest-activity first and maps them to the shared shape', async () => {
    reply('support_tickets', { data: [ROW, { ...ROW, id: 't2', context: 'not-an-object' }] })
    const tickets = await listMyTickets('p-me')
    expect(filters(calls[0])).toEqual(['eq("profile_id","p-me")', 'order("last_activity_at",{"ascending":false})'])
    expect(tickets[0]).toMatchObject({
      id: 't1',
      ref: 42,
      profileId: 'p-me',
      type: 'bug',
      subject: 'The map is blank',
      status: 'open',
      pageUrl: '/nearby',
      context: { pathname: '/nearby' },
      screenshotPath: null,
    })
    // A context that is not an object degrades to an empty one rather than leaking a string.
    expect(tickets[1].context).toEqual({})
  })

  it('getTicketForViewer hands back nothing for a ticket that is not theirs, without reading the thread', async () => {
    reply('support_tickets', { data: { ...ROW, profile_id: 'p-someone-else' } })
    expect(await getTicketForViewer('t1', 'p-me')).toBeNull()
    expect(calls.map((c) => c.table)).toEqual(['support_tickets'])
  })

  it('getTicketForViewer assembles the PUBLIC thread for the owner, naming authors and signing the screenshot', async () => {
    reply('support_tickets', { data: { ...ROW, screenshot_path: 'p-me/shot.png', assigned_to: 'p-staff' } })
    reply('support_ticket_messages', {
      data: [
        { id: 'm1', author_id: 'p-me', author_kind: 'member', body: 'it is blank', is_internal: false, created_at: '2026-09-01T00:00:01.000Z' },
        { id: 'm2', author_id: 'p-staff', author_kind: 'staff', body: 'looking', is_internal: false, created_at: '2026-09-01T00:00:02.000Z' },
      ],
    })
    reply('profiles', {
      data: [
        { id: 'p-me', display_name: 'Me', handle: 'me', avatar_url: null },
        { id: 'p-staff', display_name: 'Sam', handle: 'sam', avatar_url: '/a.png' },
      ],
    })
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/shot.png' }, error: null })

    const t = await getTicketForViewer('t1', 'p-me')
    expect(t).not.toBeNull()
    const messages = calls.find((c) => c.table === 'support_ticket_messages')!
    // The member view filters internal notes OUT in the query, not after the fact.
    expect(filters(messages)).toEqual(['eq("ticket_id","t1")', 'order("created_at",{"ascending":true})', 'eq("is_internal",false)'])
    expect(t!.messages.map((m) => [m.id, m.authorName, m.isInternal])).toEqual([
      ['m1', 'Me', false],
      ['m2', 'Sam', false],
    ])
    expect(t!.reporter).toEqual({ id: 'p-me', name: 'Me', handle: 'me', avatarUrl: null })
    expect(t!.assignee).toEqual({ id: 'p-staff', name: 'Sam', handle: 'sam', avatarUrl: '/a.png' })
    expect(t!.screenshotUrl).toBe('https://signed/shot.png')
    expect(fakeAdmin.storage.from).toHaveBeenCalledWith('support')
    expect(storage.createSignedUrl).toHaveBeenCalledWith('p-me/shot.png', 1800)
  })

  it('getTicketAdmin keeps internal notes in the thread', async () => {
    reply('support_tickets', { data: ROW })
    reply('support_ticket_messages', {
      data: [{ id: 'm1', author_id: 'p-staff', author_kind: 'staff', body: 'note', is_internal: true, created_at: '2026-09-01T00:00:01.000Z' }],
    })
    reply('profiles', { data: [] })
    const t = await getTicketAdmin('t1')
    const messages = calls.find((c) => c.table === 'support_ticket_messages')!
    expect(filters(messages)).not.toContain('eq("is_internal",false)')
    expect(t!.messages[0]).toMatchObject({ id: 'm1', isInternal: true, authorName: null })
    expect(t!.screenshotUrl).toBeNull()
  })

  it('supportSummaryForVera is one plain line per recent ticket, and empty when there are none', async () => {
    reply('support_tickets', { data: [{ ref: 42, type: 'bug', status: 'in_progress', subject: 'The map is blank' }] })
    expect(await supportSummaryForVera('p-me')).toBe('#42 (bug, in progress): "The map is blank"')
    expect(filters(calls[0])).toContain('limit(4)')
    reply('support_tickets', { data: [] })
    expect(await supportSummaryForVera('p-me')).toBe('')
  })
})

describe('member writes', () => {
  it('addMemberMessage refuses a ticket the member does not own, writing nothing', async () => {
    reply('support_tickets', { data: { id: 't1', profile_id: 'p-someone-else', status: 'open' } })
    expect(await addMemberMessage('t1', 'p-me', 'hello')).toBe(false)
    expect(writes('support_ticket_messages', 'insert')).toEqual([])
    expect(writes('support_tickets', 'update')).toEqual([])
  })

  it('addMemberMessage on a resolved ticket re-opens it and bumps activity', async () => {
    reply('support_tickets', { data: { id: 't1', profile_id: 'p-me', status: 'resolved' } })
    expect(await addMemberMessage('t1', 'p-me', '  still broken  ')).toBe(true)
    expect(payload(writes('support_ticket_messages', 'insert')[0], 'insert')).toMatchObject({
      ticket_id: 't1',
      author_id: 'p-me',
      author_kind: 'member',
      body: 'still broken',
    })
    const update = writes('support_tickets', 'update')[0]
    expect(payload(update, 'update')).toMatchObject({ status: 'open', resolved_at: null })
    expect(filters(update)).toEqual(['eq("id","t1")'])
  })

  it('addMemberMessage on an open ticket leaves its status alone', async () => {
    reply('support_tickets', { data: { id: 't1', profile_id: 'p-me', status: 'waiting' } })
    await addMemberMessage('t1', 'p-me', 'more')
    expect(payload(writes('support_tickets', 'update')[0], 'update')).not.toHaveProperty('status')
  })
})

describe('staff writes', () => {
  it('a public staff reply moves an open ticket to waiting and notifies the reporter', async () => {
    reply('support_tickets', { data: { status: 'open', profile_id: 'p-me', ref: 42 } })
    await addStaffMessage('t1', 'p-staff', 'On it.', false)
    expect(payload(writes('support_ticket_messages', 'insert')[0], 'insert')).toMatchObject({
      author_kind: 'staff',
      is_internal: false,
      body: 'On it.',
    })
    expect(payload(writes('notifications', 'insert')[0], 'insert')).toMatchObject({
      recipient_id: 'p-me',
      actor_id: 'p-staff',
      type: 'support_reply',
      reference_id: 't1',
      body: 'replied to your report #42',
    })
    expect(payload(writes('support_tickets', 'update')[0], 'update')).toMatchObject({ status: 'waiting' })
  })

  it('an internal note neither notifies nor moves the ticket', async () => {
    await addStaffMessage('t1', 'p-staff', 'private', true)
    expect(payload(writes('support_ticket_messages', 'insert')[0], 'insert')).toMatchObject({ is_internal: true })
    expect(writes('notifications', 'insert')).toEqual([])
    expect(payload(writes('support_tickets', 'update')[0], 'update')).not.toHaveProperty('status')
  })

  it('a public reply on a closed ticket notifies but does not re-open it', async () => {
    reply('support_tickets', { data: { status: 'closed', profile_id: 'p-me', ref: 42 } })
    await addStaffMessage('t1', 'p-staff', 'Following up.', false)
    expect(writes('notifications', 'insert').length).toBe(1)
    expect(payload(writes('support_tickets', 'update')[0], 'update')).not.toHaveProperty('status')
  })

  it('updateTicketFields stamps resolved_at on resolve, clears it on re-open, and touches only what it is given', async () => {
    await updateTicketFields('t1', { status: 'resolved' })
    const resolved = payload(writes('support_tickets', 'update')[0], 'update')
    expect(resolved.status).toBe('resolved')
    expect(typeof resolved.resolved_at).toBe('string')

    calls.length = 0
    await updateTicketFields('t1', { status: 'open', assignedTo: null })
    const reopened = payload(writes('support_tickets', 'update')[0], 'update')
    expect(reopened).toMatchObject({ status: 'open', resolved_at: null, assigned_to: null })

    calls.length = 0
    await updateTicketFields('t1', { priority: 'high' })
    const prio = payload(writes('support_tickets', 'update')[0], 'update')
    expect(prio.priority).toBe('high')
    expect(prio).not.toHaveProperty('status')
    expect(prio).not.toHaveProperty('assigned_to')
  })
})

describe('console reads', () => {
  it('listTickets applies each filter as a query clause, escapes the search, and counts replies', async () => {
    reply('support_tickets', { data: [ROW, { ...ROW, id: 't2', assigned_to: 'p-staff' }] })
    reply('profiles', { data: [{ id: 'p-me', display_name: 'Me', handle: 'me', avatar_url: null }] })
    reply('support_ticket_messages', { data: [{ ticket_id: 't1' }, { ticket_id: 't1' }] })
    const rows = await listTickets({ status: 'open_all', type: 'bug', assignedTo: 'p-staff', q: '100%' })
    expect(filters(calls[0])).toEqual([
      'order("last_activity_at",{"ascending":false})',
      'limit(300)',
      'in("status",["open","in_progress","waiting"])',
      'eq("type","bug")',
      'eq("assigned_to","p-staff")',
      'ilike("subject","%100\\\\%%")',
    ])
    expect(rows.map((r) => [r.id, r.replyCount, r.reporter?.name ?? null, r.assignee])).toEqual([
      ['t1', 2, 'Me', null],
      ['t2', 0, 'Me', null],
    ])
  })

  it('listTickets with no rows makes no follow-up reads', async () => {
    reply('support_tickets', { data: [] })
    expect(await listTickets({ status: 'closed' })).toEqual([])
    expect(calls.map((c) => c.table)).toEqual(['support_tickets'])
    expect(filters(calls[0])).toContain('eq("status","closed")')
  })

  it('openTicketCount is a head count over the open statuses, and 0 when the count is missing', async () => {
    reply('support_tickets', { count: 7 })
    expect(await openTicketCount()).toBe(7)
    expect(calls[0].chain[0]).toEqual(['select', ['id', { count: 'exact', head: true }]])
    expect(filters(calls[0])).toEqual([`in("status",${JSON.stringify(OPEN_STATUSES)})`])
    reply('support_tickets', { count: null, error: { message: 'relation does not exist' } })
    expect(await openTicketCount()).toBe(0)
  })

  it('ticketCountForProfile splits total from still-open', async () => {
    reply('support_tickets', { data: [{ status: 'open' }, { status: 'waiting' }, { status: 'closed' }] })
    expect(await ticketCountForProfile('p-me')).toEqual({ total: 3, open: 2 })
    expect(filters(calls[0])).toEqual(['eq("profile_id","p-me")'])
  })
})

describe('uploadScreenshot', () => {
  const png = (bytes: number, name = 'shot.PNG') => new File([new Uint8Array(bytes)], name, { type: 'image/png' })

  it('skips an empty file and refuses one over 10MB before touching storage', async () => {
    expect(await uploadScreenshot('p-me', png(0))).toBeNull()
    await expect(uploadScreenshot('p-me', png(10 * 1024 * 1024 + 1))).rejects.toThrow('Screenshot must be under 10MB.')
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('uploads under the member\'s prefix with a normalised extension, into the private bucket', async () => {
    storage.upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    const path = await uploadScreenshot('p-me', png(12, 'weird name.J P G'))
    expect(path).toMatch(/^p-me\/\d+-[a-z0-9]+\.jpg$/)
    expect(fakeAdmin.storage.from).toHaveBeenCalledWith('support')
    const [storedPath, bytes, opts] = storage.upload.mock.calls[0]
    expect(storedPath).toBe(path)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(opts).toEqual({ contentType: 'image/png', upsert: false })
  })

  it('surfaces a refused upload as the thrown error instead of returning a path that does not exist', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } })
    await expect(uploadScreenshot('p-me', png(12))).rejects.toThrow('new row violates row-level security policy')
  })
})
