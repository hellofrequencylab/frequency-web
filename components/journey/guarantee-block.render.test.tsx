// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { JourneyGuaranteeBlock } from './guarantee-block'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  if (root) act(() => root!.unmount())
  if (container) container.remove()
  root = null
  container = null
})

function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(node))
  return container
}

describe('JourneyGuaranteeBlock', () => {
  it('renders nothing when the host wrote no guarantee', () => {
    expect(mount(<JourneyGuaranteeBlock guarantee="" />).innerHTML).toBe('')
  })

  it('renders the host sentence under its heading', () => {
    const el = mount(<JourneyGuaranteeBlock guarantee="Full refund within 14 days, no questions." />)
    expect(el.textContent).toContain('Your guarantee')
    expect(el.textContent).toContain('Full refund within 14 days, no questions.')
  })

  it('states the promise verbatim and invents no default refund language', () => {
    const el = mount(<JourneyGuaranteeBlock guarantee="Cancel before week two." />)
    expect(el.textContent).toContain('Cancel before week two.')
    expect(el.textContent).not.toMatch(/30 days|money.back|satisfaction/i)
  })
})
