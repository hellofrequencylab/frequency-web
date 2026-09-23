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
  undo: vi.fn(),
  log: vi.fn(),
}))

vi.mock('@/app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions', () => ({
  veraCalendarCommand: mocks.command,
  applyVeraChanges: mocks.apply,
  undoVeraChanges: mocks.undo,
  listVeraChangeLog: mocks.log,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  mocks.command.mockReset()
  mocks.apply.mockReset()
  mocks.undo.mockReset()
  mocks.log.mockReset()
  mocks.log.mockResolvedValue({ data: { entries: [] } })
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
      data: {
        kind: 'proposal',
        changes: [{ kind: 'archive', planId: PLAN_B }],
        note: 'Archived the sequel.',
        timeZone: 'UTC',
        context: { plans: { [PLAN_B]: 'Sound bath, the sequel' }, entries: {} },
      },
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
    // "Nothing is deleted" was not true of what a reader would see on the grid. The name is the
    // SERVER's: this box was mounted with no Plans at all and still says which one it is.
    expect(proposal!.textContent).toContain('Archive "Sound bath, the sequel". Its penciled dates go with it.')
    expect(proposal!.textContent).not.toContain('that Plan')
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

// THE SECOND GATE (owner ruling: Vera changes nothing without explicit permission). A destructive
// line arrives unticked; ticking it reveals its own confirmation, whose visible words name what is
// lost; Accept waits for that second box. What a line SAYS comes from the context the server
// returned with the proposal, which is how a Plan this box has never held still gets named and how
// a field change admits it is overwriting something.

const lineBoxes = (el: ParentNode) => [...el.querySelectorAll<HTMLInputElement>('[data-vera-lines] input[type="checkbox"]')]

describe('VeraCalendarBox, the confirmation gate', () => {
  const ARCHIVE = { kind: 'archive', planId: PLAN }
  const RETITLE = { kind: 'retitle', planId: PLAN, title: 'Autumn retreat, 2026' }

  async function propose(changes: unknown[], context: unknown) {
    mocks.command.mockResolvedValueOnce({ data: { kind: 'proposal', changes, note: '', timeZone: 'UTC', context } })
    const el = mount()
    openAndAsk(el, 'Archive the autumn retreat')
    await settle(() => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    return el
  }

  it('arrives unticked, names the Plan the browser never held, and asks before it will apply', async () => {
    const el = await propose([ARCHIVE, RETITLE], { plans: { [PLAN]: 'Autumn retreat' }, entries: {} })
    const proposal = el.querySelector('[data-vera-proposal]')!
    expect(proposal.textContent).toContain('Archive "Autumn retreat"')
    expect(proposal.textContent).not.toContain('that Plan')

    // Apply-all is not the default: the archive is off, the retitle is on.
    const boxes = lineBoxes(el)
    expect(boxes[0].checked).toBe(false)
    expect(boxes[1].checked).toBe(true)
    expect(el.querySelector('[data-vera-confirm]')).toBeNull()
    expect(buttonNamed(proposal, 'Accept')!.disabled).toBe(false)

    // Ticking the archive is not enough: its own confirmation appears and Accept goes out of reach.
    act(() => boxes[0].click())
    const confirm = el.querySelector('[data-vera-confirm="0"]')
    expect(confirm).not.toBeNull()
    const label = confirm!.querySelector('label')!
    expect(label.textContent).toContain('Yes, archive "Autumn retreat" and delete its penciled dates.')
    expect(label.textContent).toContain('no restore control')
    // The visible words ARE the accessible name: no aria-label overrides them.
    expect(confirm!.querySelector('input')!.getAttribute('aria-label')).toBeNull()
    expect(buttonNamed(proposal, 'Accept')!.disabled).toBe(true)
    expect(proposal.textContent).toContain('Tick the confirmation under the marked line before you accept.')
    expect(el.textContent).not.toContain('\u2014')

    // Confirmed, Accept sends the archive with its position, so the action will not refuse it.
    mocks.apply.mockResolvedValueOnce({ data: { results: [{ index: 0, ok: true, message: 'Archived it.' }, { index: 1, ok: true, message: 'Renamed it.' }] } })
    act(() => lineBoxes(el)[1].click())
    expect(buttonNamed(proposal, 'Accept')!.disabled).toBe(false)
    await settle(() => buttonNamed(proposal, 'Accept')!.click())
    // The fourth argument is the batch an Undo reverses; an ordinary proposal has none.
    expect(mocks.apply).toHaveBeenCalledWith('lab', [ARCHIVE, RETITLE], [0], undefined)
  })

  it('takes the confirmation back when the line it belongs to is unticked', async () => {
    const el = await propose([ARCHIVE], { plans: { [PLAN]: 'Autumn retreat' }, entries: {} })
    act(() => lineBoxes(el)[0].click())
    act(() => lineBoxes(el)[1].click())
    expect(lineBoxes(el)[1].checked).toBe(true)

    act(() => lineBoxes(el)[0].click())
    expect(el.querySelector('[data-vera-confirm]')).toBeNull()

    // Ticking it again starts the confirmation over rather than remembering the old yes.
    act(() => lineBoxes(el)[0].click())
    expect(lineBoxes(el)[1].checked).toBe(false)
    expect(buttonNamed(el.querySelector('[data-vera-proposal]')!, 'Accept')!.disabled).toBe(true)
  })

  it('says a field change is a replacement, and how much it replaces', async () => {
    const el = await propose(
      [{ kind: 'field', target: 'plan', id: PLAN, path: 'notes', value: 'Bring the small gong.' }],
      { plans: { [PLAN]: 'Autumn retreat' }, entries: {}, current: { [`plan:${PLAN}:notes`]: { chars: 3200, text: null } } },
    )
    const proposal = el.querySelector('[data-vera-proposal]')!
    expect(proposal.textContent).toContain('Set Notes on "Autumn retreat" to "Bring the small gong.". That replaces the 3,200 characters there now.')
    // Nothing destructive here, so the line is ticked and there is no second box to find.
    expect(lineBoxes(el)[0].checked).toBe(true)
    expect(el.querySelector('[data-vera-confirm]')).toBeNull()
  })
})

// THE CHANGE LOG AND UNDO (PROG-CAL11 slice 3). The record is read only when its disclosure is
// opened, so the ordinary ask-and-accept path costs no extra round trip. Undo is not a button that
// acts: it asks the server for the reverses and they arrive as an ordinary PROPOSAL with the same
// lines, the same ticking and the same second box on anything destructive. Nothing leaves the log:
// a batch that was undone says so and keeps its lines.

const logRow = {
  id: '77777777-7777-4777-8777-777777777777',
  at: '2026-09-23T10:00:00.000Z',
  lines: [
    { message: 'Renamed "Winter sits" to "Autumn retreat".', reason: null },
    { message: 'Added the to-do "Book the room".', reason: 'Undo cannot remove a to-do. Open the Plan and delete it there.' },
  ],
  reversible: 1,
  undoOf: null,
  undoneBy: null,
}

const openLog = async (el: HTMLElement) => {
  act(() => {
    el.querySelector('button[aria-expanded]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle(() => {
    el.querySelector<HTMLButtonElement>('[data-vera-log] button')!.click()
  })
  return el.querySelector('[data-vera-log]')!
}

describe('VeraCalendarBox, the change log', () => {
  it('reads the record only when it is opened, and shows what each line could not put back', async () => {
    mocks.log.mockResolvedValue({ data: { entries: [logRow] } })
    const el = mount()
    act(() => {
      el.querySelector('button[aria-expanded]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // Opening Ask Vera is not opening the log: nothing is read until the disclosure is used.
    expect(mocks.log).not.toHaveBeenCalled()
    await settle(() => {
      el.querySelector<HTMLButtonElement>('[data-vera-log] button')!.click()
    })
    const log = el.querySelector('[data-vera-log]')!
    expect(mocks.log).toHaveBeenCalledWith('lab')
    expect(log.textContent).toContain('Renamed "Winter sits" to "Autumn retreat".')
    expect(log.textContent).toContain('Undo cannot remove a to-do.')
    expect(buttonNamed(log, 'Undo')).not.toBeUndefined()
    expect(el.textContent).not.toMatch(/[–—]/)
  })

  it('offers no Undo on a batch that was already undone, and keeps its lines', async () => {
    mocks.log.mockResolvedValue({ data: { entries: [{ ...logRow, undoneBy: 'x' }] } })
    const log = await openLog(mount())
    expect(buttonNamed(log, 'Undo')).toBeUndefined()
    expect(log.textContent).toContain('Undone')
    expect(log.textContent).toContain('Renamed "Winter sits" to "Autumn retreat".')
  })

  it('offers no Undo when nothing in the batch can come back, and says so', async () => {
    mocks.log.mockResolvedValue({ data: { entries: [{ ...logRow, reversible: 0 }] } })
    const log = await openLog(mount())
    expect(buttonNamed(log, 'Undo')).toBeUndefined()
    expect(log.textContent).toContain('Nothing here can be put back')
  })

  it('turns Undo into a proposal that still has to be ticked and accepted', async () => {
    mocks.log.mockResolvedValue({ data: { entries: [logRow] } })
    const el = mount()
    const log = await openLog(el)
    mocks.undo.mockResolvedValueOnce({
      data: {
        kind: 'proposal',
        changes: [{ kind: 'retitle', planId: PLAN, title: 'Winter sits' }],
        note: 'Putting back the one change in that batch. This is a proposal like any other: tick what you want, then accept.',
        timeZone: 'UTC',
        context: { plans: { [PLAN]: 'Autumn retreat' }, entries: {} },
        undoOf: logRow.id,
      },
    })
    await settle(() => buttonNamed(log, 'Undo')!.click())
    expect(mocks.undo).toHaveBeenCalledWith('lab', logRow.id)
    // Nothing was applied by pressing Undo: what arrived is a proposal.
    expect(mocks.apply).not.toHaveBeenCalled()
    const proposal = el.querySelector('[data-vera-proposal]')!
    expect(proposal.textContent).toContain('Rename "Autumn retreat" to "Winter sits".')
    expect(proposal.textContent).toContain('This is a proposal like any other')

    // Accepting it sends the batch it reverses, so the new record points back at it.
    mocks.apply.mockResolvedValueOnce({ data: { results: [{ index: 0, ok: true, message: 'Renamed it back.' }] } })
    await settle(() => buttonNamed(proposal, 'Accept')!.click())
    expect(mocks.apply).toHaveBeenCalledWith('lab', [{ kind: 'retitle', planId: PLAN, title: 'Winter sits' }], [], logRow.id)
    // The record is read again once the batch lands, so the log shows the undo without a refresh.
    expect(mocks.log).toHaveBeenCalledTimes(2)
  })

  it('says out loud when a batch landed but was not written to the record', async () => {
    mocks.command.mockResolvedValueOnce({
      data: { kind: 'proposal', changes: [{ kind: 'retitle', planId: PLAN, title: 'Autumn retreat, 2026' }], note: '', timeZone: 'UTC', context: { plans: {}, entries: {} } },
    })
    const el = mount()
    openAndAsk(el, 'Rename it')
    await settle(() => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    mocks.apply.mockResolvedValueOnce({
      data: {
        results: [{ index: 0, ok: true, message: 'Renamed it.' }],
        logError: 'The changes landed, but they were not written to the change log, so Undo will not offer them.',
      },
    })
    await settle(() => buttonNamed(el.querySelector('[data-vera-proposal]')!, 'Accept')!.click())
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Undo will not offer them')
  })
})
