import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ManageGuest } from './load'

// THE ROSTER SHOWS BOTH MARKS (PROG-GD4). "Checked in" is the member's own ledger row; "Attended"
// is the host's mark on the seat. A member seat, a guest RSVP seat and a guest ticket seat each
// render the mark they hold, each carries the host's button, and the two marks never stand in for
// each other. Rendered through the real RosterSection with the loader faked, so the assertion is
// on what the host sees and not on a list shape.

const seat = (over: Partial<ManageGuest>): ManageGuest => ({
  seat: { kind: 'rsvp', id: 'rsvp-x' },
  profileId: null,
  guestEmail: null,
  displayName: 'Someone',
  handle: '',
  avatarUrl: null,
  status: 'going',
  plusOnes: 0,
  plusOneNames: [],
  approvalStatus: 'none',
  checkedIn: false,
  attendedAt: null,
  createdAt: '2026-09-14T18:00:00Z',
  ...over,
})

const ROSTER: ManageGuest[] = [
  // A member who checked themselves in AND was marked by the host.
  seat({
    seat: { kind: 'rsvp', id: 'rsvp-member' },
    profileId: 'p1',
    displayName: 'Mara Member',
    handle: 'mara',
    checkedIn: true,
    attendedAt: '2026-09-14T19:05:00Z',
  }),
  // A guest RSVP the host marked. No profile, so no check-in is possible; the mark stands alone.
  seat({ seat: { kind: 'rsvp', id: 'rsvp-guest' }, guestEmail: 'guest@example.com', displayName: 'guest@example.com', attendedAt: '2026-09-14T19:06:00Z' }),
  // A guest ticket holder, not yet marked.
  seat({ seat: { kind: 'ticket', id: 'ticket-guest' }, guestEmail: 'buyer@example.com', displayName: 'buyer@example.com' }),
]

vi.mock('./load', () => ({
  loadRoster: async () => ROSTER,
  loadPendingApprovals: async () => [],
  loadQuestionnaire: async () => ({ questions: [], responses: [] }),
  loadSentDispatches: async () => [],
  loadPageViews: async () => ({ total: 0, unique: 0 }),
  loadRsvpBreakdown: async () => ({}),
  loadFollowUps: async () => [],
}))
vi.mock('./attendance-actions', () => ({ setSeatAttendedFromManage: async () => ({ ok: true }) }))

import { RosterSection } from './sections'

async function render(): Promise<string> {
  const tree = await RosterSection({ eventId: 'event-1', slug: 'moon-circle' })
  return renderToStaticMarkup(tree)
}

/** The <li> that names this person. */
function rowOf(html: string, name: string): string {
  const rows = html.split('<li ').slice(1)
  const row = rows.find((r) => r.includes(name))
  if (!row) throw new Error(`no roster row for ${name}`)
  return row
}

describe('the roster renders both marks', () => {
  it('a member who checked in and was marked shows Checked in AND Attended', async () => {
    const row = rowOf(await render(), 'Mara Member')
    expect(row).toContain('Checked in')
    expect(row).toContain('Attended')
  })

  it('a guest RSVP the host marked shows Attended and no Checked in (no profile can hold one)', async () => {
    const row = rowOf(await render(), 'guest@example.com')
    expect(row).toContain('Attended')
    expect(row).not.toContain('Checked in')
    expect(row).toContain('No account')
  })

  it('a guest ticket holder is on the roster at all, labelled as a ticket seat, with the host button', async () => {
    const row = rowOf(await render(), 'buyer@example.com')
    expect(row).toContain('Ticket')
    expect(row).not.toContain('Attended')
    expect(row).toContain('Mark attended')
  })

  it('every seat carries the host control, and a marked seat offers Undo instead', async () => {
    const html = await render()
    expect(rowOf(html, 'Mara Member')).toContain('Undo')
    expect(rowOf(html, 'guest@example.com')).toContain('Undo')
    expect(rowOf(html, 'buyer@example.com')).toContain('Mark attended')
  })

  it('keys rows on the seat, so an RSVP id and a ticket id cannot collide', async () => {
    // Structural: the same id on both kinds is two rows, not one React key. Rendered markup carries
    // no keys, so this pins the source, which is where the key is written.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('app/(main)/events/[slug]/manage/sections.tsx', 'utf8')
    expect(src).toContain('key={`${g.seat.kind}:${g.seat.id}`}')
  })
})
