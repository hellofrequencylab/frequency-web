import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE RECEIPT SEAM (lib/billing/receipt-email.ts, LIVE-344). Every money path's receipt is composed
// and sent here, so the guarantees are pinned once:
//   1. sendMoneyReceipt enqueues EXACTLY ONE email, through the outbox, for a payer with an address.
//   2. A payer with NO address enqueues nothing and says so out loud (a swallowed error is an
//      invisible regression). Same for a gate refusal, which warns rather than errors.
//   3. A payer with no profile (a signed-out donor, addressed from the Stripe session) skips the
//      preference gate entirely and still sends: suppression is enforced at drain time.
//   4. Nothing here ever throws. Every caller is a Stripe webhook running after the money moved.
//   5. notifyEarner writes ONE bell row and sends ONE email, and the bell still lands when the email
//      cannot.
//   6. The rendered message carries the facts, drops empty rows, and contains NO em dash
//      (docs/CONTENT-VOICE.md hard rule).

const m = vi.hoisted(() => ({
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null as null | { message: string } })),
  gateAllowed: true,
  gateCalls: [] as unknown[][],
  accountEmail: null as string | null,
  profiles: new Map<string, { display_name: string | null }>(),
  spaces: new Map<string, Record<string, unknown>>(),
  spaceError: null as null | { message: string },
}))

vi.mock('@/lib/email', () => ({ enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p) }))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: (...args: unknown[]) => {
    m.gateCalls.push(args)
    return Promise.resolve({ allowed: m.gateAllowed, reason: m.gateAllowed ? 'ok' : 'suppressed' })
  },
}))
vi.mock('@/lib/profiles/account-email', () => ({
  profileAccountEmail: async () => m.accountEmail,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({ data: m.profiles.get(id) ?? null, error: null }),
            }),
          }),
        }
      }
      if (table === 'spaces') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({ data: m.spaces.get(id) ?? null, error: m.spaceError }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  displayNameFor,
  notifyEarner,
  receiptAmount,
  receiptDate,
  receiptHtml,
  receiptText,
  sendMoneyReceipt,
  spaceReceiptTarget,
  type ReceiptContent,
} from './receipt-email'

const content: ReceiptContent = {
  greetingName: 'Ada',
  lead: 'Your $12 order from Blue Door is paid.',
  lines: [
    { label: 'Total', value: '$12' },
    { label: 'Note', value: '' },
  ],
  closing: ['Keep this email as your record of it.'],
  actionLabel: 'See my orders',
  actionUrl: 'https://example.test/orders',
}

beforeEach(() => {
  vi.clearAllMocks()
  m.gateAllowed = true
  m.gateCalls.length = 0
  m.accountEmail = 'payer@example.test'
  m.profiles.clear()
  m.spaces.clear()
  m.spaceError = null
  m.notificationsInsert.mockResolvedValue({ error: null })
})

describe('sendMoneyReceipt', () => {
  it('enqueues exactly one email for a payer with an account address', async () => {
    const sent = await sendMoneyReceipt({
      profileId: 'payer-1',
      subject: 'Your order',
      content,
      logTag: '[t]',
    })
    expect(sent).toBe(true)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    const payload = m.enqueueEmail.mock.calls[0][0] as Record<string, string>
    expect(payload.to).toBe('payer@example.test')
    expect(payload.subject).toBe('Your order')
    expect(payload.text).toContain('$12')
  })

  it('runs the TRANSACTIONAL gate, so muted preferences cannot silence a receipt', async () => {
    await sendMoneyReceipt({ profileId: 'payer-1', subject: 's', content, logTag: '[t]' })
    expect(m.gateCalls).toHaveLength(1)
    expect(m.gateCalls[0].slice(0, 3)).toEqual(['payer-1', 'email', 'transactional'])
  })

  it('sends NOTHING and logs an error when there is no address for the payer', async () => {
    m.accountEmail = null
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sent = await sendMoneyReceipt({
      profileId: 'payer-1',
      subject: 's',
      content,
      logTag: '[t]',
      context: { orderId: 'o-1' },
    })
    expect(sent).toBe(false)
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
    expect(String(err.mock.calls[0][0])).toContain('no address')
    err.mockRestore()
  })

  it('sends NOTHING and warns when the gate refuses (a suppressed address)', async () => {
    m.gateAllowed = false
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sent = await sendMoneyReceipt({ profileId: 'payer-1', subject: 's', content, logTag: '[t]' })
    expect(sent).toBe(false)
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a payer with no profile is addressed directly and skips the preference gate', async () => {
    const sent = await sendMoneyReceipt({ to: 'guest@example.test', subject: 's', content, logTag: '[t]' })
    expect(sent).toBe(true)
    expect(m.gateCalls).toHaveLength(0)
    expect((m.enqueueEmail.mock.calls[0][0] as Record<string, string>).to).toBe('guest@example.test')
  })

  it('never throws when the outbox does', async () => {
    m.enqueueEmail.mockRejectedValueOnce(new Error('outbox down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(sendMoneyReceipt({ profileId: 'p', subject: 's', content, logTag: '[t]' })).resolves.toBe(false)
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('notifyEarner', () => {
  it('writes one bell row and enqueues one email', async () => {
    await notifyEarner({
      recipientProfileId: 'seller-1',
      actorProfileId: 'buyer-1',
      type: 'commerce_order_sold',
      referenceType: 'space',
      referenceId: 'blue-door',
      bellBody: 'bought Two mugs for $12',
      subject: 'You sold Two mugs',
      content,
      logTag: '[t]',
    })
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'seller-1',
      actor_id: 'buyer-1',
      type: 'commerce_order_sold',
      reference_type: 'space',
      reference_id: 'blue-door',
      body: 'bought Two mugs for $12',
    })
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
  })

  it('uses the no-actor sentence when the payer has no account', async () => {
    await notifyEarner({
      recipientProfileId: 'seller-1',
      actorProfileId: null,
      type: 'space_donation_received',
      referenceType: 'space',
      referenceId: 'blue-door',
      bellBody: 'gave $20 to the roof fund',
      bellBodyNoActor: 'Someone gave $20 to the roof fund',
      subject: 'Someone gave $20',
      content,
      logTag: '[t]',
    })
    expect(m.notificationsInsert.mock.calls[0][0]).toMatchObject({
      actor_id: null,
      body: 'Someone gave $20 to the roof fund',
    })
  })

  it('still writes the bell when the email cannot be sent, and never throws', async () => {
    m.accountEmail = null
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      notifyEarner({
        recipientProfileId: 'seller-1',
        type: 'commerce_order_sold',
        referenceType: null,
        referenceId: null,
        bellBody: 'bought something',
        subject: 's',
        content,
        logTag: '[t]',
      }),
    ).resolves.toBeUndefined()
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('logs a refused bell insert rather than swallowing it', async () => {
    m.notificationsInsert.mockResolvedValueOnce({ error: { message: 'nope' } })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await notifyEarner({
      recipientProfileId: 'seller-1',
      type: 't',
      referenceType: null,
      referenceId: null,
      bellBody: 'b',
      subject: 's',
      content,
      logTag: '[t]',
    })
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('the rendered message', () => {
  it('prints the facts, drops an empty row, and carries no em dash', () => {
    const html = receiptHtml(content)
    const text = receiptText(content)
    expect(text).toContain('Hi Ada,')
    expect(text).toContain('Total: $12')
    expect(text).not.toContain('Note:')
    expect(html).toContain('Total')
    expect(html).not.toContain('>Note<')
    expect(html).toContain('https://example.test/orders')
    expect(html).not.toContain('—')
    expect(text).not.toContain('—')
  })

  it('greets a payer with no name plainly', () => {
    expect(receiptText({ ...content, greetingName: null })).toContain('Hi there,')
  })

  it('escapes what a payer typed', () => {
    const html = receiptHtml({ ...content, lines: [{ label: 'Note', value: '<script>x</script>' }] })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('the small shared reads', () => {
  it('receiptAmount prints whole amounts without cents and refuses a non-amount', () => {
    expect(receiptAmount(1200, 'usd')).toBe('$12')
    expect(receiptAmount(1250, 'usd')).toBe('$12.50')
    expect(receiptAmount(0, 'usd')).toBeNull()
    expect(receiptAmount(null, 'usd')).toBeNull()
  })

  it('receiptDate spells the day out', () => {
    expect(receiptDate(new Date('2026-09-15T12:00:00Z'))).toMatch(/September/)
  })

  it('displayNameFor returns null rather than throwing on an unknown profile', async () => {
    await expect(displayNameFor('nobody')).resolves.toBeNull()
    await expect(displayNameFor(null)).resolves.toBeNull()
  })

  it('spaceReceiptTarget prefers the brand name and falls back to the id as a slug', async () => {
    m.spaces.set('s-1', { owner_profile_id: 'owner-1', name: 'Blue Door', brand_name: 'Blue Door Studio', slug: 'blue-door' })
    await expect(spaceReceiptTarget('s-1')).resolves.toEqual({
      ownerProfileId: 'owner-1',
      name: 'Blue Door Studio',
      slug: 'blue-door',
    })
    m.spaces.set('s-2', { owner_profile_id: null, name: null, brand_name: null, slug: null })
    await expect(spaceReceiptTarget('s-2')).resolves.toEqual({
      ownerProfileId: null,
      name: 'this space',
      slug: 's-2',
    })
  })

  it('spaceReceiptTarget logs and returns null on a refused read', async () => {
    m.spaceError = { message: 'boom' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(spaceReceiptTarget('s-1')).resolves.toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
