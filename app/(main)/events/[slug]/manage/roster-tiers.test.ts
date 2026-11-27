import { describe, expect, it } from 'vitest'
import { tierBreakdown } from './roster-tiers'
import { rosterCsv } from './roster-csv-button'

const t = (tierName: string | null, qty: number) => ({ ticket: { ticketId: 'x', tierName, qty, amountCents: 4400, currency: 'usd' } })

describe('ticket holders by type (LIVE-2548)', () => {
  it('counts holders and seats per tier, a multi-ticket buyer as one holder with many seats', () => {
    expect(tierBreakdown([t('VIP', 3), t('VIP', 1), t(null, 1), { ticket: null }])).toEqual([
      { tier: 'VIP', holders: 2, seats: 4 },
      { tier: 'General', holders: 1, seats: 1 },
    ])
  })
  it('exports a spreadsheet with the tier, seats and amount, quoting commas', () => {
    const csv = rosterCsv([
      { name: 'Lee, Rebecca', email: 'r@example.com', status: 'Going', tier: 'VIP', tickets: '3', amount: '$132.00', attended: '', joined: 'Nov 26' },
    ])
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Status,Ticket type,Tickets,Paid,Attended,Joined')
    expect(csv.split('\r\n')[1]).toBe('"Lee, Rebecca",r@example.com,Going,VIP,3,$132.00,,Nov 26')
  })
})
