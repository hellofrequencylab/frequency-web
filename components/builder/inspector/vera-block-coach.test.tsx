// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const WORDING = 'Who is this for?'
const state = vi.hoisted(() => ({
  ask: vi.fn(async () => ({
    source: 'vera',
    blockType: 'Banner',
    questions: [
      { field: 'title', label: 'Headline', questionId: 'audience', question: 'Who is this for?' },
      { field: 'subtitle', label: 'Subtitle', questionId: 'newcomer', question: 'What should a newcomer expect?' },
    ],
  })),
  track: vi.fn(),
}))
vi.mock('@/app/(main)/pages/canvas/actions', () => ({ askVeraAboutCanvasBlock: state.ask }))
vi.mock('@/components/analytics/track-provider', () => ({ trackClient: state.track }))
import { VeraBlockCoach } from './vera-block-coach'

let root: Root
let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container?.remove(); state.ask.mockClear(); state.track.mockClear() })

/** The coach under a stand-in for the inspector's field list: the same `data-field` rows the real one draws. */
const mount = async (fresh: boolean, values: Record<string, string | boolean> = {}) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <div>
        <ul data-inspector>
          <li data-field="title"><input defaultValue="Typed by the owner" /></li>
          <li data-field="subtitle"><textarea defaultValue="" /></li>
        </ul>
        <VeraBlockCoach title="Banner" values={values} fresh={fresh} />
      </div>,
    ),
  )
}
const coach = () => container.querySelector('section')!
const button = (name: string) => [...coach().querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name || b.textContent === name)!

it('asks once by herself when the block is created empty', async () => {
  await mount(true)
  expect(state.ask).toHaveBeenCalledExactlyOnceWith({ trigger: 'block-created', values: {}, spaceId: undefined })
  expect(coach().textContent).toContain('Headline')
  expect(coach().textContent).toContain(WORDING)
})

it('stays quiet on a block that is not new until asked', async () => {
  await mount(false, { title: 'Come as you are' })
  expect(state.ask).not.toHaveBeenCalled()
  await act(async () => button('Ask Vera').click())
  expect(state.ask).toHaveBeenCalledExactlyOnceWith({ trigger: 'asked', values: { title: 'Come as you are' }, spaceId: undefined })
  expect(coach().querySelector('[data-field="title"]')).not.toBeNull()
})

it('writes nothing: there is no field, only questions', async () => {
  await mount(true)
  expect(coach().querySelectorAll('input, textarea')).toHaveLength(0)
})

it('answering moves the cursor to the field, changes no value, and fires accepted once with ids only', async () => {
  await mount(true)
  const input = container.querySelector<HTMLInputElement>('[data-inspector] [data-field="title"] input')!
  await act(async () => button('Answer this in Headline').click())
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('Typed by the owner')
  expect(state.track).toHaveBeenCalledExactlyOnceWith('editor.vera_question_accepted', {
    blockType: 'Banner', field: 'title', questionId: 'audience', source: 'vera', position: 0, shown: 2,
  })
  // The question stays up while they write, and going back to the field is not a second accept.
  expect(coach().textContent).toContain(WORDING)
  await act(async () => button('Back to the field: Headline').click())
  expect(state.track).toHaveBeenCalledOnce()
})

it('not now puts the question away and fires dismissed once, keeping its original position', async () => {
  await mount(true)
  await act(async () => button('Not now: the question about Subtitle').click())
  expect(state.track).toHaveBeenCalledExactlyOnceWith('editor.vera_question_dismissed', {
    blockType: 'Banner', field: 'subtitle', questionId: 'newcomer', source: 'vera', position: 1, shown: 2,
  })
  expect(coach().querySelector('[data-field="subtitle"]')).toBeNull()
  expect(coach().querySelector('[data-field="title"]')).not.toBeNull()
})

it('never sends the wording, the label or what is in a field', async () => {
  await mount(true, { title: 'Typed by the owner' })
  await act(async () => button('Answer this in Headline').click())
  await act(async () => button('Not now: the question about Subtitle').click())
  expect(state.track).toHaveBeenCalledTimes(2)
  for (const [, props] of state.track.mock.calls) {
    expect(Object.keys(props as object).sort()).toEqual(['blockType', 'field', 'position', 'questionId', 'shown', 'source'])
    const sent = JSON.stringify(props)
    for (const secret of [WORDING, 'What should a newcomer expect?', 'Headline', 'Subtitle', 'Typed by the owner']) expect(sent).not.toContain(secret)
  }
})

it('a fresh ask starts the questions over', async () => {
  await mount(true)
  await act(async () => button('Not now: the question about Subtitle').click())
  await act(async () => button('Ask Vera').click())
  expect(coach().querySelector('[data-field="subtitle"]')).not.toBeNull()
})
