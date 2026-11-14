// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const io = vi.hoisted(() => ({ queueSave: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: io.push, refresh: io.refresh }) }))
vi.mock('../studio-window', () => ({ StudioWindow: ({ children, footer }: { children: ReactNode; footer: ReactNode }) => <section aria-label="Practice editor fixture">{children}{footer}</section> }))
vi.mock('../kit/use-studio-draft', () => ({ useStudioDraft: () => ({ saveState: 'saved', error: null, queueSave: io.queueSave, run: vi.fn() }) }))
vi.mock('@/app/(main)/practices/actions', () => ({ updatePracticeAction: vi.fn(), setPracticeTagsAction: vi.fn(), setPracticeRewardAction: vi.fn(), deleteOwnPracticeAction: vi.fn() }))
vi.mock('@/app/(main)/practices/create-actions', () => ({ submitPracticeForReviewAction: vi.fn() }))
vi.mock('@/components/ui/image-upload', () => ({ ImageUpload: () => null }))
vi.mock('@/components/admin/danger-modal', () => ({ DangerModal: () => null }))
import { PracticeBuilder, type PracticeBuilderProps } from './practice-builder'
import { PRACTICE_SUPPORT_COPY } from '@/lib/practices/support-language'

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444']
const props: PracticeBuilderProps = {
  id: 'fixture', title: 'A walk with a friend', summary: 'A small walk', description: null, body: 'Choose a route.',
  cadence: 'As needed', durationMin: 5, category: null, timerKind: 'none', movementConfig: null, mindlessMode: null,
  durationLocked: false, warmupMessage: null, warmupSec: null, icon: 'footprints', domainId: ids[1],
  focusDetails: { [ids[1]]: { instructions: 'Walk at your own pace.', timing: 'When it fits' }, [ids[0]]: { instructions: 'Notice one thing.', timing: '' } },
  subcategoryId: null, headerImage: null, weightClass: 'light', pillars: ids.map((id, i) => ({ id, name: ['Mind', 'Body', 'Spirit', 'Expression'][i] })), subcategories: [], initialTags: [],
}
let root: Root | undefined
let element: HTMLDivElement | undefined
beforeEach(() => { vi.clearAllMocks(); element = document.createElement('div'); document.body.appendChild(element); root = createRoot(element) })
afterEach(() => { act(() => root?.unmount()); element?.remove() })
function supportGroup() { return element!.querySelector(`[role="group"][aria-label="${PRACTICE_SUPPORT_COPY.heading}"]`)! }
function choice(name: string) { return [...supportGroup().querySelectorAll('button')].find(b => b.textContent === name)! }

describe('Practice support invitation preserves plural authorship', () => {
  it('explains overlap without an equal-balance task', () => {
    act(() => root!.render(<PracticeBuilder {...props} />))
    expect(element!.textContent).toContain(PRACTICE_SUPPORT_COPY.heading)
    expect(element!.textContent).toContain(PRACTICE_SUPPORT_COPY.hint)
    expect(element!.textContent).toContain(PRACTICE_SUPPORT_COPY.detailHint)
    expect(choice('Mind').getAttribute('aria-pressed')).toBe('true')
    expect(choice('Body').getAttribute('aria-pressed')).toBe('true')
    expect(io.queueSave).not.toHaveBeenCalled()
  })
  it('can add third and fourth supports without deleting author instructions or assigning rewards', () => {
    act(() => root!.render(<PracticeBuilder {...props} />))
    act(() => choice('Spirit').click())
    act(() => choice('Expression').click())
    const patch = io.queueSave.mock.calls.at(-1)![0]
    expect(Object.keys(patch.focus_details)).toEqual([ids[1], ids[0], ids[2], ids[3]])
    expect(patch.focus_details[ids[1]]).toEqual(props.focusDetails[ids[1]])
    expect(patch.focus_details[ids[0]]).toEqual(props.focusDetails[ids[0]])
    expect(patch.focus_details[ids[2]]).toEqual({ instructions: '', timing: '' })
    expect(patch.focus_details[ids[3]]).toEqual({ instructions: '', timing: '' })
    expect(patch).not.toHaveProperty('reward_zaps')
    expect(patch).not.toHaveProperty('primary_pct')
    expect(choice('Expression').getAttribute('aria-pressed')).toBe('true')
  })
  it('can remove a suggested support while retaining the others and their words', () => {
    act(() => root!.render(<PracticeBuilder {...props} />))
    act(() => choice('Mind').click())
    expect(io.queueSave).toHaveBeenLastCalledWith({ focus_details: { [ids[1]]: props.focusDetails[ids[1]] } })
    expect(choice('Mind').getAttribute('aria-pressed')).toBe('false')
    expect(choice('Body').getAttribute('aria-pressed')).toBe('true')
  })
})
