import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDraft } from '../create-space/builder'
import { toSnapshot } from './state'
import { resumeView } from './resume'
import { boxView } from './box-state'
const owned = vi.hoisted(() => vi.fn())
const active = vi.hoisted(() => vi.fn())
vi.mock('./spaces-io', () => ({ listOwnedSpaces: owned }))
vi.mock('./store', () => ({ getActiveLaunch: active }))
import { ownedWizardEntry } from './entry-io'
const now = new Date('2026-11-13T12:00:00Z')
const wizard = { version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 1, niche: null, goals: [], timedEntry: false, draft: emptyDraft('new-world', true), leadToken: null }
const launch = () => toSnapshot({ id: 'launch', owner_id: 'owner', steps: { wizardResume: wizard }, started_at: now.toISOString(), updated_at: now.toISOString() })!
describe('shared wizard entry', () => {
  beforeEach(() => { owned.mockResolvedValue([{ id: 'one', slug: 'one', name: 'One' }, { id: 'two', slug: 'two', name: 'Two' }]); active.mockResolvedValue(null) })
  it('opens the existing chooser for multiple owners rather than selecting the first', async () => {
    expect(await ownedWizardEntry('owner', false)).toBe('/launch/step/spotlight?go=1')
    expect(owned).toHaveBeenCalledWith('owner')
  })
  it('opens only the currently owned launch Space editor', async () => {
    active.mockResolvedValue({ spaceId: 'two' })
    expect(await ownedWizardEntry('owner', false)).toBe('/spaces/two/manage/spotlight')
    active.mockResolvedValue({ spaceId: 'foreign' })
    expect(await ownedWizardEntry('owner', false)).toBe('/launch/step/spotlight?go=1')
  })
  it('honors an explicit new Space request', async () => {
    expect(await ownedWizardEntry('owner', true)).toBeNull()
    expect(owned).not.toHaveBeenCalled()
  })
  it('resumes the actual builder cursor from launch and the header sheet', () => {
    expect(resumeView(launch(), now)).toMatchObject({ kind: 'step', href: '/create-a-space?new=1' })
    expect(boxView(launch(), now).resumeHref).toBe('/create-a-space?new=1')
  })
})
