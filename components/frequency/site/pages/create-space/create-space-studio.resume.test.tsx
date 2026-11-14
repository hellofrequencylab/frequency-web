import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/app/(marketing)/create-a-space/actions', () => ({ restoreDraft: async () => ({ draft: null }), saveBuilderProgress: async () => ({ ok: true }), saveDraftLead: async () => ({ ok: false }), claimWithEmail: vi.fn(), claimWithGoogle: vi.fn(), continueSignedIn: vi.fn() }))
import { CreateSpaceStudio } from './create-space-studio'
import { emptyDraft } from '@/lib/create-space/builder'
import { parseWizardResume } from '@/lib/launch/wizard-resume'
const draft = { ...emptyDraft('new-world', true), name: 'Sample Studio', hostName: 'Sample Host', offer: 'Weekly community workshops', startedAt: '2026-11-14T00:00:00Z', done: { name: true, offer: true, contact: false, photos: false } }
const resume = (timedEntry: boolean) => parseWizardResume({ version: 1, phase: 'builder', cursor: 2, theme: 'new-world', accentAt: 0, niche: null, goals: [], timedEntry, draft, leadToken: null })
describe('shared cursor builder render', () => {
  it('opens the saved contact cursor and names an untimed draft without a broken time sentence', () => {
    const html = renderToStaticMarkup(<CreateSpaceStudio initialResume={resume(false)} />)
    expect(html).toContain('Step 3 of 5')
    expect(html).toContain('How do clients')
    expect(html).toMatch(/<h1[^>]*>.*?<span>Sample Studio<\/span>/)
    expect(html).not.toContain('Launch your business in')
  })
  it('shows the countdown only for the explicitly timed saved entry', () => {
    const html = renderToStaticMarkup(<CreateSpaceStudio initialResume={resume(true)} />)
    expect(html).toContain('Launch your business in')
    expect(html).toContain('12:00')
  })
})
