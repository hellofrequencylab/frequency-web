// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const state = vi.hoisted(() => ({
  ask: vi.fn(async () => ({ source: 'vera', questions: [{ field: 'title', label: 'Headline', question: 'Who is this for?' }] })),
}))
vi.mock('@/app/(main)/pages/canvas/actions', () => ({ askVeraAboutCanvasBlock: state.ask }))
import { VeraBlockCoach } from './vera-block-coach'

let root: Root
let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container?.remove(); state.ask.mockClear() })
const mount = async (fresh: boolean, values: Record<string, string | boolean> = {}) => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<VeraBlockCoach title="Banner" values={values} fresh={fresh} />))
}

it('asks once by herself when the block is created empty', async () => {
  await mount(true)
  expect(state.ask).toHaveBeenCalledExactlyOnceWith({ trigger: 'block-created', values: {}, spaceId: undefined })
  expect(container.textContent).toContain('Headline')
  expect(container.textContent).toContain('Who is this for?')
})

it('stays quiet on a block that is not new until asked', async () => {
  await mount(false, { title: 'Come as you are' })
  expect(state.ask).not.toHaveBeenCalled()
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ask Vera')!
  await act(async () => button.click())
  expect(state.ask).toHaveBeenCalledExactlyOnceWith({ trigger: 'asked', values: { title: 'Come as you are' }, spaceId: undefined })
  expect(container.querySelector('[data-field="title"]')).not.toBeNull()
})

it('writes nothing: there is no field, only questions', async () => {
  await mount(true)
  expect(container.querySelectorAll('input, textarea')).toHaveLength(0)
})
