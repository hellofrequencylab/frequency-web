// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StatusEditor } from './page-settings/status-editor'
import { TasksWorkspace } from './crm/tasks-workspace'
import { ElementPreview } from '@/components/elements/previews'
import { PracticesTable, type LibraryRow } from '@/app/(main)/admin/content/practices/practices-table'
import type { CrmTask } from '@/lib/crm/tasks-core'

const { refresh, saveStatus, bulk } = vi.hoisted(() => ({
  refresh: vi.fn(), saveStatus: vi.fn(async () => ({ data: undefined })),
  bulk: vi.fn(async () => ({ data: { count: 5, capped: false } })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }), usePathname: () => '/events' }))
vi.mock('@/lib/page-settings/actions', () => ({ getPageStatusForEditor: vi.fn(async () => ({ status: 'published', visibility_role: null })), savePageStatus: saveStatus }))
vi.mock('@/app/(main)/admin/crm/tasks/actions', () => ({ createTaskAction: vi.fn(), setTaskStatusAction: vi.fn() }))
vi.mock('@/components/templates', () => ({ PageHero: ({ title }: { title: ReactNode }) => <div data-testid="preview-hero">{title}</div> }))
vi.mock('@/components/loom/loom-picker', () => ({ LoomPicker: () => null }))
vi.mock('@/app/(main)/admin/qr/style-editor', () => ({ StyleEditor: () => null }))
vi.mock('@/app/(main)/practices/actions', () => ({ deletePracticeAction: vi.fn() }))
vi.mock('@/app/(main)/admin/content/actions', () => ({ setAllPracticeFlagsAction: vi.fn(), bulkUpdatePracticesAction: vi.fn(), archivePracticesAction: vi.fn(), restorePracticesAction: vi.fn(), bulkPracticesByFilterAction: bulk }))
vi.mock('@/app/(main)/admin/content/content-controls', () => ({ PracticeFeatureToggle: () => null, PracticePublicToggle: () => null }))
vi.mock('@/app/(main)/admin/content/practices/practice-duplicates', () => ({ PracticeDuplicatesButton: () => null }))
vi.mock('@/app/(main)/admin/content/practices/practice-placement', () => ({ PracticePlacementButton: () => null }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
function button(text: string) {
  const found = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
const task = (id: string, assigneeProfileId: string, dueAt: string | null): CrmTask => ({
  id, title: id, assigneeProfileId, dueAt, status: 'open', spaceId: null, contactId: null,
  notes: null, createdBy: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', planId: null, dueOffsetDays: null,
})

describe('admin selected controls announce the state they actually apply', () => {
  it('announces the loaded page status and follows a draft selection without saving it', async () => {
    await act(async () => root.render(<StatusEditor />))
    expect(container.querySelector('[role="group"][aria-label="Page status"]')).not.toBeNull()
    expect(button('Published').getAttribute('aria-pressed')).toBe('true')
    await act(async () => button('Draft').click())
    expect(button('Draft').getAttribute('aria-pressed')).toBe('true')
    expect(button('Published').getAttribute('aria-pressed')).toBe('false')
    expect(container.textContent).toContain('Hidden from everyone except staff')
    expect(saveStatus).not.toHaveBeenCalled()
  })

  it('keeps task filter announcements aligned with the displayed tasks', async () => {
    await act(async () => root.render(<TasksWorkspace viewerId="me" tasks={[task('Mine task', 'me', null), task('Overdue task', 'other', '2020-01-01')]} />))
    expect(button('Mine').getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('Mine task')
    expect(container.textContent).not.toContain('Overdue task')
    await act(async () => button('Overdue').click())
    expect(button('Overdue').getAttribute('aria-pressed')).toBe('true')
    expect(button('Mine').getAttribute('aria-pressed')).toBe('false')
    expect(container.textContent).toContain('Overdue task')
    expect(container.textContent).not.toContain('Mine task')
  })

  it('announces the header preview ordering selected by the operator', async () => {
    await act(async () => root.render(<ElementPreview elementKey="header" />))
    expect(button('name').getAttribute('aria-pressed')).toBe('true')
    const titles = () => Array.from(container.querySelectorAll('[data-testid="preview-hero"]')).map(n => n.textContent)
    expect(titles()).toEqual(['The 28-Day Reset', 'Find your people', 'Daniel Tyack', 'River Yoga'])
    await act(async () => button('type').click())
    expect(titles()).toEqual(['The 28-Day Reset', 'Daniel Tyack', 'River Yoga', 'Find your people'])
    expect(button('type').getAttribute('aria-pressed')).toBe('true')
    expect(button('name').getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('[role="group"][aria-label="Sort header previews"]')).not.toBeNull()
  })

  it('exposes the bulk public switch current state with a stable name and requests the opposite state', async () => {
    const props = { filter: {}, total: 5, showingFrom: 1, showingTo: 1, pagination: { kind: 'cursor' as const, moreHref: null } }
    await act(async () => root.render(<PracticesTable {...props} rows={[]} />))
    let control = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="All Public"]')!
    expect(control?.getAttribute('aria-checked')).toBe('false')
    await act(async () => control.click())
    expect(bulk).toHaveBeenLastCalledWith({}, { kind: 'setFlag', flag: 'is_public', value: true })
    const row: LibraryRow = { id: 'p', title: 'Practice', creator: 'Member', isHouse: false, status: 'approved', adopters: 0, logs_30d: 0, logs_total: 0, score: 0, created_at: '2026-01-01', is_public: true, is_template: false, featured: false, weight_class: null }
    await act(async () => root.render(<PracticesTable {...props} rows={[row]} />))
    control = container.querySelector<HTMLButtonElement>('[role="switch"][aria-label="All Public"]')!
    expect(control.getAttribute('aria-checked')).toBe('true')
    await act(async () => control.click())
    expect(bulk).toHaveBeenLastCalledWith({}, { kind: 'setFlag', flag: 'is_public', value: false })
  })
})
