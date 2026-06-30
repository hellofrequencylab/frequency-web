import { describe, it, expect } from 'vitest'
import {
  APPLICATION_TRACKS,
  APPLICATION_TRACK_DEFS,
  APPLICATION_STATUSES,
  OPEN_STATUSES,
  STATUS_LABEL,
  getTrack,
  asTrack,
  asStatus,
} from './tracks'

// Lock the application tracks (Growth OS Engine 3, GE3-2/GE3-3): the canon of tracks
// the migration's CHECK allows, that only the host track grants host, and that the
// narrowing guards fail closed. So a flow can never apply for a track the DB rejects,
// and only apply-to-host runs the role + Starter Circle handoff.
describe('application tracks', () => {
  it('every track id has a def with a label, blurb, and questions', () => {
    for (const id of APPLICATION_TRACKS) {
      const t = APPLICATION_TRACK_DEFS[id]
      expect(t.id).toBe(id)
      expect(t.label).toBeTruthy()
      expect(t.blurb).toBeTruthy()
      expect(Array.isArray(t.questions)).toBe(true)
      expect(t.questions.length).toBeGreaterThan(0)
      // Every question carries a stable key + a member-facing label.
      for (const q of t.questions) {
        expect(q.key).toBeTruthy()
        expect(q.label).toBeTruthy()
      }
    }
  })

  it('only the host track grants the host role + Starter Circle handoff', () => {
    expect(APPLICATION_TRACK_DEFS.host.grantsHost).toBe(true)
    for (const id of APPLICATION_TRACKS) {
      if (id === 'host') continue
      expect(APPLICATION_TRACK_DEFS[id].grantsHost).toBe(false)
    }
  })

  it('the host track has at least one required question', () => {
    expect(APPLICATION_TRACK_DEFS.host.questions.some((q) => q.required)).toBe(true)
  })

  it('resolves a track by id and fails closed on an unknown id', () => {
    expect(getTrack('host')).toBe(APPLICATION_TRACK_DEFS.host)
    expect(getTrack('nope')).toBeNull()
    expect(getTrack(null)).toBeNull()
  })

  it('the narrowing guards admit only canon values', () => {
    expect(asTrack('host')).toBe('host')
    expect(asTrack('nope')).toBeNull()
    expect(asTrack(undefined)).toBeNull()
    expect(asStatus('pending')).toBe('pending')
    expect(asStatus('nope')).toBeNull()
  })

  it('open statuses are a subset of all statuses and every status has a label', () => {
    for (const s of OPEN_STATUSES) expect(APPLICATION_STATUSES).toContain(s)
    expect(OPEN_STATUSES).toEqual(['pending', 'in_review'])
    for (const s of APPLICATION_STATUSES) expect(STATUS_LABEL[s]).toBeTruthy()
  })
})
