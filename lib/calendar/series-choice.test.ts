import { describe, expect, it } from 'vitest'
import {
  SERIES_DELETE_COPY,
  SERIES_DELETE_UNDO_WARNING,
  SERIES_SAVE_COPY,
  entryRepeats,
  entrySeriesRule,
  planEntryDelete,
  planEntrySave,
  resolveSeriesDeleteChoice,
  resolveSeriesSaveChoice,
} from './series-choice'

// LIVE-531. The owner deleted what they read as the October night of a repeating Pencil and lost
// every date, because one row IS the series. At the time the delete was also a hard delete with no
// tombstone, which is why the loss was permanent; LIVE-536 has since made it a `removed_at`
// tombstone, so an equivalent mistake is now recoverable. The REACH is unchanged and is what these
// cases pin: what a press may reach, and what it may never reach.

const repeating = { kind: 'pencil', repeat: 'FREQ=WEEKLY', occurrenceDate: '2026-10-14' }

describe('planEntryDelete: a repeating entry never reaches the hard delete in one press', () => {
  it('asks, and offers NO immediate write at all', () => {
    const plan = planEntryDelete(repeating)
    expect(plan.ask).toBe(true)
    expect(plan.immediate).toBe('nothing')
    expect(plan.immediate).not.toBe('deleteRow')
    expect(plan.thisDate).toBe('2026-10-14')
  })

  it('still asks when the drawer is not standing on one occurrence, with no skip to offer', () => {
    const plan = planEntryDelete({ ...repeating, occurrenceDate: null })
    expect(plan).toEqual({ ask: true, thisDate: null, immediate: 'nothing' })
  })

  it('leaves a ONE-OFF entry its one-step delete, so no dialog appears where there is no series', () => {
    for (const entry of [
      { kind: 'pencil', repeat: '', occurrenceDate: null },
      { kind: 'pencil', repeat: null, occurrenceDate: '2026-10-14' },
      { kind: 'private', repeat: '', occurrenceDate: null },
      { kind: 'unavailable', repeat: null, occurrenceDate: null },
    ]) {
      expect(planEntryDelete(entry)).toEqual({ ask: false, thisDate: null, immediate: 'deleteRow' })
    }
  })

  it('treats a rule outside the ADR-1299 subset as a one-off, the way the generator does', () => {
    expect(entrySeriesRule({ kind: 'pencil', repeat: 'FREQ=HOURLY;BYWEIRD=1' })).toBeNull()
    expect(planEntryDelete({ kind: 'pencil', repeat: 'FREQ=HOURLY;BYWEIRD=1' }).ask).toBe(false)
  })

  it('does not treat a stray rule on a kind that cannot repeat as a series, because the row would not store one', () => {
    // parseEntryInput writes recurrence_rule only for an event on its way (def.isPencil).
    expect(entryRepeats({ kind: 'unavailable', repeat: 'FREQ=WEEKLY' })).toBe(false)
    expect(entryRepeats({ kind: 'private', repeat: 'FREQ=WEEKLY' })).toBe(false)
    expect(entryRepeats({ kind: 'pencil', repeat: 'FREQ=WEEKLY' })).toBe(true)
  })

  it('refuses a day key that is not one, rather than offering to skip nothing', () => {
    expect(planEntryDelete({ ...repeating, occurrenceDate: '2026-13-40' }).thisDate).toBeNull()
    expect(planEntryDelete({ ...repeating, occurrenceDate: 'tomorrow' }).thisDate).toBeNull()
  })
})

describe('resolveSeriesDeleteChoice: "this date only" can only ever be the skip', () => {
  it('maps the three choices to the three writes', () => {
    const plan = planEntryDelete(repeating)
    expect(resolveSeriesDeleteChoice('thisDate', plan)).toBe('skipThisDate')
    expect(resolveSeriesDeleteChoice('series', plan)).toBe('deleteRow')
    expect(resolveSeriesDeleteChoice('keep', plan)).toBe('nothing')
  })

  it('🔴 writes NOTHING rather than falling through to the hard delete when there is no day to skip', () => {
    const plan = planEntryDelete({ ...repeating, occurrenceDate: null })
    expect(resolveSeriesDeleteChoice('thisDate', plan)).toBe('nothing')
    expect(resolveSeriesDeleteChoice('thisDate', plan)).not.toBe('deleteRow')
  })
})

describe('planEntrySave: an edit of a repeating entry is an edit of every date, unless it is split (LIVE-534)', () => {
  it('asks for a series and never for a one-off', () => {
    expect(planEntrySave(repeating)).toEqual({ ask: true, thisDate: '2026-10-14' })
    expect(planEntrySave({ kind: 'pencil', repeat: '' })).toEqual({ ask: false, thisDate: null })
  })

  it('names the occurrence day only when the drawer stands on one, and refuses a day key that is not one', () => {
    expect(planEntrySave({ ...repeating, occurrenceDate: null }).thisDate).toBeNull()
    expect(planEntrySave({ ...repeating, occurrenceDate: 'tomorrow' }).thisDate).toBeNull()
  })

  it('maps the three choices to the three writes', () => {
    const plan = planEntrySave(repeating)
    expect(resolveSeriesSaveChoice('thisDate', plan)).toBe('splitSeriesAt')
    expect(resolveSeriesSaveChoice('series', plan)).toBe('saveSeries')
    expect(resolveSeriesSaveChoice('keep', plan)).toBe('nothing')
  })

  it('🔴 "this date only" NEVER falls through to the whole-series write when there is no day to split at', () => {
    const plan = planEntrySave({ ...repeating, occurrenceDate: null })
    expect(resolveSeriesSaveChoice('thisDate', plan)).toBe('nothing')
    expect(resolveSeriesSaveChoice('thisDate', plan)).not.toBe('saveSeries')
  })
})

describe('the words say what the press reaches', () => {
  it('names the irreversibility of the series delete, which is the sentence whose absence cost the data', () => {
    expect(SERIES_DELETE_COPY.seriesNote).toContain(SERIES_DELETE_UNDO_WARNING)
    expect(SERIES_DELETE_COPY.seriesNote).toContain('every date')
  })

  it('names the one-date choice without colliding with the form button of the same write', () => {
    expect(SERIES_DELETE_COPY.thisDateLabel).toBe('This date only')
  })

  it('says the skip leaves the rest alone and can be put back', () => {
    const note = SERIES_DELETE_COPY.thisDateNote('Wed, Oct 14')
    expect(note).toContain('Wed, Oct 14')
    expect(note).toContain('Skips Wed, Oct 14')
    expect(note).toContain('every other date alone')
    expect(note).toContain('put it back')
  })

  it('says what each save reaches: one date on its own, or every date', () => {
    expect(SERIES_SAVE_COPY.thisDateLabel).toBe('This date only')
    const note = SERIES_SAVE_COPY.thisDateNote('Wed, Oct 14')
    expect(note).toContain('Changes Wed, Oct 14 on its own')
    expect(note).toContain('every other date as it was')
    expect(note).toContain('outside the series')
    expect(SERIES_SAVE_COPY.seriesNote).toContain('every date')
    // The sentence that said it could not be done is gone, because it can.
    expect(JSON.stringify(SERIES_SAVE_COPY)).not.toContain('not possible')
  })

  it('keeps no em dash in any sentence (docs/CONTENT-VOICE.md)', () => {
    const words = [
      SERIES_DELETE_COPY.lead('Craft Night'),
      SERIES_DELETE_COPY.thisDateNote('Wed, Oct 14'),
      SERIES_DELETE_COPY.seriesNote,
      SERIES_DELETE_COPY.keepLabel,
      SERIES_SAVE_COPY.lead('Craft Night'),
      SERIES_SAVE_COPY.seriesNote,
      SERIES_SAVE_COPY.thisDateNote('Wed, Oct 14'),
      SERIES_SAVE_COPY.thisDateLabel,
    ]
    for (const w of words) expect(w).not.toContain('—')
  })

  it('names the entry in the lead, and falls back to plain words when it has no title yet', () => {
    expect(SERIES_DELETE_COPY.lead('Craft Night')).toContain('Craft Night')
    expect(SERIES_DELETE_COPY.lead('   ')).toContain('This date')
  })
})
