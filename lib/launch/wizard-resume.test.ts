import { describe, expect, it } from 'vitest'
import { emptyDraft } from '../create-space/builder'
import { parseWizardResume, showWizardClock, ownerEntryHref } from './wizard-resume'
import { stepsWithSkips, toSnapshot } from './state'

const input = { version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 2, niche: null, goals: [], timedEntry: true, draft: emptyDraft('new-world', true), leadToken: null }
describe('shared owner onboarding resume', () => {
  it('retains the actual cursor and theme through launch JSON alongside published work', () => {
    const resume = parseWizardResume(input)!
    expect(resume.cursor).toBe(2)
    const steps = stepsWithSkips({ spotlight: { status: 'published', ref: 'owned-space' } }, ['sc-logo'], resume, 'revision-a')
    const snapshot = toSnapshot({ id: 'l', owner_id: 'owner', started_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z', steps })!
    expect(snapshot.resume?.theme).toBe('new-world')
    expect(snapshot.resume?.cursor).toBe(2)
    expect(snapshot.steps.spotlight?.status).toBe('published')
    expect(snapshot.skippedPhotos).toEqual(['sc-logo'])
    expect(snapshot.stepsRevision).toBe('revision-a')
  })
  it('rejects invalid or oversized records and reuses the builder sanitization', () => {
    expect(parseWizardResume({ ...input, cursor: 99 })).toBeNull()
    expect(parseWizardResume({ ...input, draft: { ...input.draft, offer: 'x'.repeat(17000) } })).toBeNull()
    expect(parseWizardResume({ ...input, draft: { ...input.draft, name: 'x'.repeat(100) } })?.draft?.name).toHaveLength(80)
    expect(parseWizardResume({ ...input, timedEntry: 'true' })?.timedEntry).toBe(false)
  })
  it('shows the clock only for an explicit timed entry before zero', () => {
    expect(showWizardClock(null, 0)).toBe(false)
    expect(showWizardClock(parseWizardResume(input), 719999)).toBe(true)
    expect(showWizardClock(parseWizardResume(input), 720000)).toBe(false)
  })
  it('sends an existing owner to their editor, preserving explicit new intent', () => {
    expect(ownerEntryHref('my-space', false)).toBe('/spaces/my-space/manage/spotlight')
    expect(ownerEntryHref('my-space', true)).toBeNull()
    expect(ownerEntryHref(null, false)).toBeNull()
  })
})
