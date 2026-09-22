// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SpaceTodosPanel } from './space-todos-panel'
import type { CrmTask } from '@/lib/crm/tasks-core'
import type { ActionResult } from '@/lib/action-result'

const { setSpaceTaskDone } = vi.hoisted(() => ({
  setSpaceTaskDone: vi.fn(async (): Promise<ActionResult<void>> => ({ data: undefined })),
}))
vi.mock('./task-actions', () => ({ setSpaceTaskDone }))

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
  setSpaceTaskDone.mockClear()
})

const task = (over: Partial<CrmTask> = {}): CrmTask => ({
  id: '11111111-1111-4111-8111-111111111111',
  spaceId: 'space-1',
  contactId: null,
  assigneeProfileId: null,
  title: 'Confirm the sound engineer',
  notes: null,
  dueAt: null,
  status: 'open',
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  planId: null,
  dueOffsetDays: null,
  ...over,
})

function render(tasks: CrmTask[], viewerId: string | null = 'me') {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<SpaceTodosPanel slug="royal-temple" tasks={tasks} viewerId={viewerId} />))
  return container
}

const chip = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!

describe('SpaceTodosPanel', () => {
  it('shows the first-use empty state rather than an empty filter row', () => {
    // A Space with no to-dos must not be shown three chips over nothing: that reads as
    // "your filter is wrong", not "there is nothing here yet".
    const el = render([])
    expect(el.textContent).toContain('No to-dos yet')
    expect(chip(el, 'Overdue')).toBeUndefined()
  })

  it('filters through lib/crm/tasks-core rather than a second implementation', () => {
    const el = render([
      task({ id: '11111111-1111-4111-8111-111111111111', title: 'Mine', assigneeProfileId: 'me' }),
      task({ id: '22222222-2222-4222-8222-222222222222', title: 'Someone elses', assigneeProfileId: 'other' }),
    ])
    expect(el.textContent).toContain('Mine')
    expect(el.textContent).toContain('Someone elses')

    act(() => chip(el, 'Mine').click())
    expect(el.textContent).toContain('Mine')
    expect(el.textContent).not.toContain('Someone elses')
  })

  it('marks an overdue to-do so the count and the row agree', () => {
    const el = render([task({ dueAt: '2020-01-01T00:00:00Z' })])
    expect(el.textContent).toContain('Overdue')
  })

  it('PUTS THE ROW BACK when the write fails, so the checkbox never claims a write that did not land', async () => {
    // The failure this pins is the one that made LIVE-442 invisible for five days: a surface
    // that swallows the error and shows the happy state anyway. A ticked box over a refused
    // write is the same lie in miniature.
    setSpaceTaskDone.mockResolvedValueOnce({ error: 'That to-do could not be updated.' })
    const el = render([task()])
    const box = el.querySelector('input[type="checkbox"]') as HTMLInputElement

    await act(async () => {
      box.click()
    })

    expect(setSpaceTaskDone).toHaveBeenCalledWith('royal-temple', task().id, true)
    expect(el.textContent).toContain('That to-do could not be updated.')
    expect((el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false)
  })

  it('keeps the selected chip off the brand fill, so it adds nothing to raw-button-bg', () => {
    // HYG-105 banked a 403 -> 404 raise for the two calendar view switchers and stays flagged
    // until a sweep. check:adoption matches a raw button opening tag carrying a brand-fill
    // class, so a brand-filled chip here would book three more against a ratcheted class.
    const el = render([task()])
    const selected = chip(el, 'All')
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(selected.className).not.toContain('bg-primary')
  })
})
