// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CommandRow } from '@/lib/calendar/planner/command-results'
import type { parseCommand } from '@/lib/calendar/planner/command-parse'
import { SuiteCommand } from './suite-command'
import { SuitePencil, type PencilSubmit } from './suite-pencil'
import { SuiteQuick } from './suite-quick'

type Parsed = NonNullable<ReturnType<typeof parseCommand>>

// THE THREE SHEETS, DRIVEN. Pencil it in holds up to three days and sends exactly what was chosen,
// quick add sends its kind and place, and the command bar reads a sentence, shows what it understood,
// and only the create row (Enter) writes.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TODAY = '2026-10-21'
let host: HTMLDivElement
let root: Root

function mount(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(node))
}
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click())
const q = (sel: string) => host.querySelector(sel)
const byText = (sel: string, text: string) => [...host.querySelectorAll(sel)].find((e) => e.textContent?.includes(text))
function type(el: HTMLInputElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Pencil it in', () => {
  const open = (onSubmit: (i: PencilSubmit) => Promise<string | null>) =>
    mount(
      <SuitePencil
        today={TODAY}
        items={[{ id: 'u', title: 'Closed', kind: 'unavailable', date: '2026-10-27', end: null, startMin: null, durMin: 60 }]}
        onSubmit={onSubmit}
        onClose={() => {}}
      />,
    )
  const day = (key: string) => q(`button[aria-label^="${key}"]`) as HTMLButtonElement

  it('cannot be sent until it has a title and a day', () => {
    open(async () => null)
    const send = byText('button', 'Pencil it in') as HTMLButtonElement
    expect(q('.cal-sheet-title')?.textContent).toBe('Pencil it in')
    expect(send.disabled).toBe(true)
    expect(host.textContent).toContain('Pick a day on the calendar')
    type(q('input') as HTMLInputElement, 'Supper club')
    expect(send.disabled).toBe(true)
    click(day('Thu, Oct 22'))
    expect(send.disabled).toBe(false)
    click(day('Thu, Oct 22'))
    expect(send.disabled).toBe(true)
  })

  it('holds the days it was given, drops the oldest past three, and says the release day', async () => {
    const seen: PencilSubmit[] = []
    open(async (i) => {
      seen.push(i)
      return null
    })
    type(q('input') as HTMLInputElement, 'Supper club')
    for (const d of ['Thu, Oct 22', 'Fri, Oct 23', 'Sat, Oct 24', 'Sun, Oct 25']) click(day(d))
    expect(host.textContent).toContain('3 dates, you will pick one later')
    expect(q('.cal-held')?.textContent).not.toContain('Thu, Oct 22')
    expect(host.textContent).toContain('Released on Wed, Oct 28 if nobody confirms')
    click(byText('button', '14 days'))
    expect(host.textContent).toContain('Released on Wed, Nov 4 if nobody confirms')
    click(byText('button', 'Sound bath'))
    await act(async () => void (byText('button', 'Pencil it in') as HTMLButtonElement).click())
    expect(seen).toEqual([{ title: 'Supper club', dates: ['2026-10-23', '2026-10-24', '2026-10-25'], startMin: 1140, durMin: 120, holdDays: 14, playbookId: 'sound-bath' }])
  })

  it('cannot hold a day that has passed, and marks a day the Space is unavailable', () => {
    open(async () => null)
    expect(day('Tue, Oct 20').disabled).toBe(true)
    expect(day('Tue, Oct 27, unavailable').dataset.closed).toBeDefined()
  })

  it('keeps the sheet open with the reason when the save fails', async () => {
    open(async () => 'A date that has passed cannot be held.')
    type(q('input') as HTMLInputElement, 'Supper club')
    click(day('Fri, Oct 23'))
    await act(async () => void (byText('button', 'Pencil it in') as HTMLButtonElement).click())
    expect(q('[role="alert"]')?.textContent).toBe('A date that has passed cannot be held.')
  })

  it('lists the four playbooks with their pitch', () => {
    open(async () => null)
    for (const t of ['Sound bath', '5 to-dos, starts 3 weeks out', 'Market day', '6 to-dos, starts 6 weeks out', 'Workshop', '4 to-dos, starts 2 weeks out', 'Start blank', 'Add to-dos as you go']) {
      expect(host.textContent).toContain(t)
    }
  })
})

describe('Quick add', () => {
  it('adds the kind chosen on the day and time clicked, and offers the full sheet', async () => {
    const add = vi.fn(async () => null)
    const more = vi.fn()
    mount(<SuiteQuick day="2026-10-30" startMin={1140} x={900} y={700} box={{ width: 1000, height: 800 }} onAdd={add} onMore={more} onClose={() => {}} />)
    expect(host.textContent).toContain('Fri, Oct 30, 7 PM')
    expect((q('.cal-quick') as HTMLElement).style.getPropertyValue('--qx')).toBe('652px')
    expect((q('.cal-quick') as HTMLElement).style.getPropertyValue('--qy')).toBe('542px')
    const add_ = byText('button', 'Add') as HTMLButtonElement
    expect(add_.disabled).toBe(true)
    type(q('input') as HTMLInputElement, 'Order mats')
    click(byText('button', 'To-do'))
    await act(async () => void add_.click())
    expect(add).toHaveBeenCalledWith({ kind: 'todo', title: 'Order mats', day: '2026-10-30', startMin: 1140 })
    click(byText('button', 'More dates and a playbook'))
    expect(more).toHaveBeenCalledWith('Order mats')
  })
})

describe('Command bar', () => {
  const run = vi.fn(async (_row: CommandRow, _parsed: Parsed | null): Promise<string | null> => null)
  const open = () =>
    mount(
      <SuiteCommand
        today={TODAY}
        timeZone="America/Los_Angeles"
        views={['day', 'week', 'month', 'agenda']}
        plans={[{ id: 'p1', title: 'Supper club', stage: 'pencil' }]}
        items={[]}
        onRun={run}
        onClose={() => {}}
      />,
    )
  const input = () => q('input') as HTMLInputElement
  const key = (k: string) => act(() => void input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))

  it('starts with the example sentences, the views, and the keyboard help', () => {
    run.mockClear()
    open()
    expect(input().placeholder).toBe('Tell Vera what to add, find or open')
    expect(host.textContent).toContain('Say it the way you would to a teammate.')
    expect(host.textContent).toContain('Block pool deck nov 2')
    expect(host.textContent).toContain('Open Week view')
    expect(host.textContent).toContain('Press T')
    expect(q('.cal-cmd-foot')?.textContent).toBe('↑↓ move↵ runP pencil it inD W M A viewsT today')
  })

  it('shows what it understood and writes only when Enter runs the create row', async () => {
    run.mockClear()
    open()
    type(input(), 'Private staff sync thu 10am for 30 min')
    const read = q('.cal-cmd-read')!
    expect(read.textContent).toContain('KindPrivate')
    expect(read.textContent).toContain('TitleStaff sync')
    expect(read.textContent).toContain('DayThu, Oct 22')
    expect(read.textContent).toContain('Time10 AM')
    expect(read.textContent).toContain('Length30 min')
    expect(q('[data-active="true"]')?.textContent).toContain('Add private: Staff sync')
    expect(run).not.toHaveBeenCalled()
    await act(async () => void key('Enter'))
    expect(run).toHaveBeenCalledTimes(1)
    const [row, parsed] = run.mock.calls[0] as unknown as [{ type: string }, { kind: string; date: string; startMin: number; durMin: number }]
    expect(row.type).toBe('create')
    expect(parsed).toMatchObject({ kind: 'private', date: '2026-10-22', startMin: 600, durMin: 30 })
  })

  it('moves with the arrow keys and runs the row it lands on', async () => {
    run.mockClear()
    open()
    key('ArrowDown')
    key('ArrowDown')
    await act(async () => void key('Enter'))
    expect(run.mock.calls[0][0]).toMatchObject({ type: 'view', view: 'month' })
  })

  it('finds a Plan by name', () => {
    open()
    type(input(), 'supper')
    expect(q('.cal-cmd-list')?.textContent).toContain('Plan · Pencil')
  })

  it('keeps the bar open and says why when a create fails', async () => {
    run.mockResolvedValueOnce('That to-do could not be saved.')
    open()
    type(input(), 'todo order mats tomorrow')
    await act(async () => void key('Enter'))
    expect(q('[role="alert"]')?.textContent).toBe('That to-do could not be saved.')
  })
})
