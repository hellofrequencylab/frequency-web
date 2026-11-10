import { describe, expect, it } from 'vitest'
import { canPublish, fileReport, nextState, playerView, triage } from './moderation'

describe('fileReport', () => {
  it('accepts a known reason and trims details', () => {
    const r = fileReport({ huntId: 'h', reporterId: 'a', reason: 'unsafe', details: '  road crossing  ' }, [])
    expect(r).toEqual({ ok: true, report: { huntId: 'h', reporterId: 'a', reason: 'unsafe', details: 'road crossing' } })
  })
  it('refuses an unknown reason, long details and a second open report', () => {
    expect(fileReport({ huntId: 'h', reporterId: 'a', reason: 'spam' }, [])).toEqual({ ok: false, reason: 'bad_reason' })
    expect(fileReport({ huntId: 'h', reporterId: 'a', reason: 'other', details: 'x'.repeat(1001) }, [])).toEqual({ ok: false, reason: 'details_too_long' })
    expect(fileReport({ huntId: 'h', reporterId: 'a', reason: 'other' }, [{ huntId: 'h', reporterId: 'a' }])).toEqual({ ok: false, reason: 'duplicate' })
  })
  it('lets the same person report a different Hunt', () => {
    expect(fileReport({ huntId: 'h2', reporterId: 'a', reason: 'other' }, [{ huntId: 'h', reporterId: 'a' }]).ok).toBe(true)
  })
})

describe('triage', () => {
  it('one urgent report recommends a pause', () => {
    expect(triage([{ reporterId: 'a', reason: 'minor_risk' }])).toEqual({ level: 'urgent', recommendPause: true, reporters: 1 })
  })
  it('two different people on a soft reason ask for review, not a pause', () => {
    const t = triage([{ reporterId: 'a', reason: 'wrong_or_broken' }, { reporterId: 'b', reason: 'offensive' }])
    expect(t).toEqual({ level: 'review', recommendPause: false, reporters: 2 })
  })
  it('no reports is quiet', () => {
    expect(triage([]).level).toBe('none')
  })
})

describe('state and player view', () => {
  it('pauses, resumes and closes, and closed is final', () => {
    expect(nextState('published', 'pause')).toBe('paused')
    expect(nextState('paused', 'resume')).toBe('published')
    expect(nextState('paused', 'close')).toBe('closed')
    expect(nextState('closed', 'resume')).toBeNull()
    expect(nextState('published', 'resume')).toBeNull()
  })
  it('stops granting when paused or closed but keeps progress', () => {
    expect(playerView('published').canClaim).toBe(true)
    expect(playerView('paused')).toEqual({ canClaim: false, keepsProgress: true, banner: 'paused' })
    expect(playerView('closed')).toEqual({ canClaim: false, keepsProgress: true, banner: 'closed' })
  })
})

describe('canPublish', () => {
  it('needs permission and a clean checklist', () => {
    expect(canPublish({ permissionConfirmed: true, checklistOk: true })).toBe(true)
    expect(canPublish({ permissionConfirmed: false, checklistOk: true })).toBe(false)
    expect(canPublish({ permissionConfirmed: true, checklistOk: false })).toBe(false)
  })
})
