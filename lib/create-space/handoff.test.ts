import { describe, expect, it } from 'vitest'
import { emptyDraft, serializeDraft } from '@/lib/create-space/builder'
import { destinationFor, holdFor, parseHandoff } from '@/lib/create-space/handoff'
import { readCarry } from '@/lib/launch/carry'
import { parsePendingLaunch, serializePendingLaunch } from '@/lib/launch/pending'
import { safeNextPath } from '@/lib/auth/safe-next'

const now = new Date('2026-10-29T12:00:00Z')
const draft = () => ({
  ...emptyDraft('designer', true),
  name: '  Saltwater Collective ',
  slug: 'saltwater',
  accentAt: 2,
  goals: ['events', 'community'] as ('events' | 'community')[],
  hostName: ' Sam Rivera ',
  done: { name: true, look: true, goals: true, host: true },
})

describe('the draft as the server receives it', () => {
  it('is the browser JSON cut to the closed shape', () => {
    const d = parseHandoff(serializeDraft(draft()))
    expect(d?.name).toBe('  Saltwater Collective '.slice(0, 80))
    expect(d?.goals).toEqual(['events', 'community'])
  })
  it('needs a name and a handle that is a handle', () => {
    expect(parseHandoff(serializeDraft({ ...draft(), name: '   ' }))).toBeNull()
    expect(parseHandoff(serializeDraft({ ...draft(), slug: '-no' }))).toBeNull()
    expect(parseHandoff(serializeDraft({ ...draft(), name: '!!!', slug: '' }))).toBeNull()
  })
  it('refuses anything that is not a draft', () => {
    for (const raw of [undefined, null, 5, '', 'nope', '[]', '{"kit":"not-a-kit"}', 'x'.repeat(9000)]) expect(parseHandoff(raw)).toBeNull()
  })
})

describe('the launch hold for a draft', () => {
  it('maps the builder onto the hold the launch page reads', () => {
    const hold = holdFor(parseHandoff(serializeDraft(draft()))!)
    expect(hold.niche).toBeNull()
    expect(hold.intents).toEqual(['events', 'community'])
    expect(hold.answers.spotlight).toEqual({ name: 'Saltwater Collective', handle: 'saltwater', theme: 'designer', accent: '2', host: 'Sam Rivera' })
  })
  it('is read back whole by the hold and by the carry reader', () => {
    const hold = holdFor(parseHandoff(serializeDraft(draft()))!)
    const back = parsePendingLaunch(serializePendingLaunch(hold, now), now)
    expect(back?.intents).toEqual(['events', 'community'])
    expect(back?.answers.spotlight?.name).toBe('Saltwater Collective')
    expect(readCarry(back?.answers.spotlight)).toEqual({ handle: 'saltwater', theme: 'designer', accent: '2', host: 'Sam Rivera' })
  })
  it('follows the name when no handle was typed, and leaves out an empty host', () => {
    const d = parseHandoff(serializeDraft({ ...draft(), slug: '', hostName: '' }))!
    expect(holdFor(d).answers.spotlight).toEqual({ name: 'Saltwater Collective', handle: 'saltwatercollective', theme: 'designer', accent: '2' })
  })
})

describe('where a draft goes', () => {
  it('is the launch claim, with the Spotlight form to keep building on, while the launch is on', () => {
    expect(destinationFor(true)).toEqual({ next: '/launch/claim', keepBuildingHref: '/launch/step/spotlight' })
  })
  it('is the signed-in Create a Space form with no keep-building link while the launch is off, so nobody meets a 404', () => {
    expect(destinationFor(false)).toEqual({ next: '/spaces/new', keepBuildingHref: null })
  })
  it('is always a same-origin path sign-in will honour', () => {
    for (const on of [true, false]) expect(safeNextPath(destinationFor(on).next)).not.toBe('')
  })
})
