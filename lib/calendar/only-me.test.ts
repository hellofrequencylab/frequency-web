import { describe, expect, it } from 'vitest'
import { entryToCalendarItem, entryToInput, parseEntryInput, personalBusyToItem, type EntryFormatters, type EntryInput, type EntryRow } from './entries'
import { planQuickAdd, quickEntry } from './planner/pencil-it-in'

// "ONLY ME" ENTRIES (LIVE-2560): a Private date only its maker reads; the team sees Busy.

const base: EntryInput = {
  kind: 'private',
  title: 'Dentist',
  allDay: false,
  startDate: '2026-12-02',
  endDate: '2026-12-02',
  startTime: '10:00',
  endTime: '11:00',
  timeZone: 'America/Los_Angeles',
  blocksTime: false,
  showPublicly: false,
}

const fmt: EntryFormatters = {
  timeLabel: (iso) => iso.slice(11, 16),
  whenLabel: (iso) => iso.slice(0, 16),
  dateLabel: (iso) => iso.slice(0, 10),
  instantIso: (iso) => iso,
}

function row(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    space_id: 's',
    kind: 'private',
    title: 'Dentist',
    notes: null,
    location: null,
    all_day: false,
    starts_at: '2026-12-02T10:00:00.000Z',
    ends_at: '2026-12-02T11:00:00.000Z',
    time_zone: 'America/Los_Angeles',
    status: 'confirmed',
    blocks_time: false,
    visibility: 'only_me',
    option_group: null,
    hold_expires_at: null,
    stage: null,
    description: null,
    plan_id: null,
    published_event_id: null,
    recurrence_rule: null,
    exception_dates: [],
    ...over,
  }
}

describe('only-me entries', () => {
  it('writes only_me for a Private date marked Only me, and never joins it to a Plan', () => {
    const out = parseEntryInput({ ...base, onlyMe: true, planId: '11111111-1111-4111-8111-111111111111' })
    expect('data' in out && out.data.visibility).toBe('only_me')
    expect('data' in out && out.data.plan_id).toBeNull()
  })

  it('ignores Only me on any other kind', () => {
    const out = parseEntryInput({ ...base, kind: 'unavailable', allDay: true, onlyMe: true })
    expect('data' in out && out.data.visibility).toBe('team')
  })

  it('keeps an unmarked Private date team-visible, and its form unchanged', () => {
    const out = parseEntryInput(base)
    expect('data' in out && out.data.visibility).toBe('team')
    expect('onlyMe' in entryToInput(row({ visibility: 'team' }))).toBe(false)
  })

  it('round-trips Only me through the edit form and tags the item', () => {
    expect(entryToInput(row()).onlyMe).toBe(true)
    expect(entryToCalendarItem(row(), fmt, { editable: true }).statusLabel).toContain('Only me')
  })

  it('carries Only me through a quick add, for Private only', () => {
    const p = planQuickAdd({ kind: 'private', title: 'Dentist', day: '2026-12-02', startMin: 600, onlyMe: true })
    expect('data' in p && p.data.onlyMe).toBe(true)
    expect('data' in p && quickEntry(p.data, 'America/Los_Angeles').onlyMe).toBe(true)
    const u = planQuickAdd({ kind: 'unavailable', title: 'Away', day: '2026-12-02', onlyMe: true })
    expect('data' in u && 'onlyMe' in u.data).toBe(false)
  })

  it("draws a teammate's time as a read-only Busy block with no details", () => {
    const item = personalBusyToItem(row(), fmt, 0)
    expect(item.title).toBe('Busy')
    expect(item.layer).toBe('unavailable')
    expect(item.entryId ?? null).toBeNull()
    expect(item.notes ?? null).toBeNull()
    expect(item.endTimeLabel).toBe('11:00')
  })
})
