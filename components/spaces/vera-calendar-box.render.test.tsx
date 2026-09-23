// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { VeraCalendarBox } from './vera-calendar-box'

// Ask Vera, clarify before proposing (PROG-CAL11 slice 1). The two doors are mocked at the
// actions module: what this pins is the box's own behaviour. A clarification renders its question
// and options under [data-vera-clarification]; choosing an option calls the action again with the
// transcript Vera returned and the chosen value; the proposal that comes back renders as before;
// Start over drops the transcript. Nothing here writes: Accept is not pressed in this file.

const PLAN = '11111111-2222-4333-8444-555555555555'
const PLAN_B = '22222222-3333-4444-8555-666666666666'

const transcript = [
  { role: 'user', content: 'Archive the sound bath' },
  { role: 'assistant', content: [{ type: 'tool_use', id: 'q1', name: 'ask_clarification', input: { question: 'Which one?' } }] },
]

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  apply: vi.fn(),
}))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions', () => ({
  veraCalendarCommand: mocks.command,
  applyVeraChanges: mocks.apply,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  mocks.command.mockReset()
  mocks.apply.mockReset()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<VeraCalendarBox slug="lab" year={2026} month1={9} plans={[]} events={[]} />))
  return container!
}

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!

function type(input: HTMLInputElement, text: string) {
  setValue.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function settle(fn: () => void) {
  await act(async () => {
    fn()
    await new Promise((r) => setTimeout(r, 0))
  })
}

function openAndAsk(el: HTMLElement, ask: string) {
  act(() => {
    el.querySelector('button[aria-expanded]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  act(() => type(el.querySelector<HTMLInputElement>('#vera-ask')!, ask))
}

const buttonNamed = (el: ParentNode, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)

describe('VeraCalendarBox, clarify before proposing', () => {
  it('renders the question with its options, sends the answer with the transcript, then renders the proposal', async () => {
    mocks.command.mockResolvedValueOnce({
      data: {
        kind: 'clarification',
        question: 'Which sound bath do you mean?',
        options: [
          { label: 'Sound bath (Planning)', value: PLAN },
          { label: 'Sound bath, the sequel (Pencil)', value: PLAN_B },
        ],
        allowFreeText: false,
        transcript,
        timeZone: 'UTC',
      },
    })
    const el = mount()
    openAndAsk(el, 'Archive the sound bath')
    await settle(() => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mocks.command).toHaveBeenCalledTimes(1)
    expect(mocks.command.mock.calls[0][1]).not.toHaveProperty('transcript')

    const box = el.querySelector('[data-vera-clarification]')
    expect(box).not.toBeNull()
    expect(box!.textContent).toContain('Which sound bath do you mean?')
    expect(buttonNamed(box!, 'Sound bath (Planning)')).toBeDefined()
    expect(buttonNamed(box!, 'Sound bath, the sequel (Pencil)')).toBeDefined()
    expect(buttonNamed(box!, 'Start over')).toBeDefined()
    expect(box!.querySelector('#vera-answer')).toBeNull()
    expect(el.querySelector('[data-vera-proposal]')).toBeNull()
    expect(el.textContent).not.toContain('\u2014')

    // Choosing an option continues the same conversation: the transcript goes back with the value.
    mocks.command.mockResolvedValueOnce({
      data: { kind: 'proposal', changes: [{ kind: 'archive', planId: PLAN_B }], note: 'Archived the sequel.', timeZone: 'UTC' },
    })
    await settle(() => buttonNamed(box!, 'Sound bath, the sequel (Pencil)')!.click())
    expect(mocks.command).toHaveBeenCalledTimes(2)
    expect(mocks.command.mock.calls[1][0]).toBe('lab')
    expect(mocks.command.mock.calls[1][1]).toMatchObject({ ask: 'Archive the sound bath', mode: 'pencil', year: 2026, month1: 9, transcript, answer: PLAN_B })

    expect(el.querySelector('[data-vera-clarification]')).toBeNull()
    const proposal = el.querySelector('[data-vera-proposal]')
    expect(proposal).not.toBeNull()
    expect(proposal!.textContent).toContain('Archived the sequel.')
    // LIVE-467 corrected this line: archiving a Plan takes its penciled dates with it, and saying
    // "Nothing is deleted" was not true of what a reader would see on the grid.
    expect(proposal!.textContent).toContain('Archive that Plan. Its penciled dates go with it.')
    expect(buttonNamed(proposal!, 'Accept')).toBeDefined()
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('offers a free-text answer when Vera allows one, and Start over clears the question', async () => {
    mocks.command.mockResolvedValueOnce({
      data: {
        kind: 'clarification',
        question: 'What time should it start?',
        options: [
          { label: '7 PM', value: '19:00' },
          { label: '8 PM', value: '20:00' },
        ],
        allowFreeText: true,
        transcript,
        timeZone: 'UTC',
      },
    })
    const el = mount()
    openAndAsk(el, 'Pencil a sound bath on Oct 10')
    await settle(() => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const box = el.querySelector('[data-vera-clarification]')!
    const answer = box.querySelector<HTMLInputElement>('#vera-answer')
    expect(answer).not.toBeNull()
    expect(buttonNamed(box, 'Answer')!.disabled).toBe(true)
    act(() => type(answer!, 'half past six'))
    expect(buttonNamed(box, 'Answer')!.disabled).toBe(false)

    mocks.command.mockResolvedValueOnce({
      data: {
        kind: 'clarification',
        question: 'Morning or evening?',
        options: [
          { label: 'Morning', value: 'am' },
          { label: 'Evening', value: 'pm' },
        ],
        allowFreeText: false,
        transcript: [...transcript, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'q1', content: '{"answer":"half past six"}' }] }, transcript[1]],
        timeZone: 'UTC',
      },
    })
    await settle(() => {
      answer!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mocks.command.mock.calls[1][1]).toMatchObject({ transcript, answer: 'half past six' })
    // A second question replaces the first; the ask itself stays in the field.
    const again = el.querySelector('[data-vera-clarification]')!
    expect(again.textContent).toContain('Morning or evening?')
    expect(again.textContent).not.toContain('What time should it start?')
    expect(el.querySelector<HTMLInputElement>('#vera-ask')!.value).toBe('Pencil a sound bath on Oct 10')

    act(() => buttonNamed(again, 'Start over')!.click())
    expect(el.querySelector('[data-vera-clarification]')).toBeNull()
    expect(el.querySelector('[data-vera-proposal]')).toBeNull()
    expect(mocks.command).toHaveBeenCalledTimes(2)
  })

  it('shows an honest error in place when the continuation is refused, keeping the question', async () => {
    mocks.command.mockResolvedValueOnce({
      data: {
        kind: 'clarification',
        question: 'Which one?',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        allowFreeText: false,
        transcript,
        timeZone: 'UTC',
      },
    })
    const el = mount()
    openAndAsk(el, 'Move the sound bath')
    await settle(() => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    mocks.command.mockResolvedValueOnce({ error: 'Vera could not narrow this down. Try naming the Plan or the date, and ask again.' })
    await settle(() => buttonNamed(el.querySelector('[data-vera-clarification]')!, 'B')!.click())
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('could not narrow this down')
    expect(el.querySelector('[data-vera-clarification]')).not.toBeNull()
  })
})
