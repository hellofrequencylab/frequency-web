// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CreateFlow, type FlowStep } from './create-flow'

vi.mock('next/navigation', () => ({ usePathname: () => '/spaces/new', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))

let container: HTMLDivElement | null = null
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = root = null
})

function mount(ui: React.ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(ui))
  return container
}

const steps = (onFinish = vi.fn()): FlowStep[] => [
  { id: 'a', label: 'One', title: 'First step here', body: <p>body a</p> },
  { id: 'b', label: 'Two', title: 'Second step now', body: <p>body b</p>, canContinue: false },
  { id: 'c', label: 'Three', title: 'Last step', body: <p>body c</p>, nextLabel: 'Finish', onNext: onFinish },
]

const button = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

describe('CreateFlow', () => {
  it('framed: one step at a time, the kit banner, and Change opens the named step', () => {
    const onIndex = vi.fn()
    const c = mount(<CreateFlow steps={steps()} index={0} onIndexChange={onIndex} kit={{ label: 'Nocturne', changeStepId: 'c' }} />)
    expect(c.textContent).toContain('body a')
    expect(c.textContent).not.toContain('body b')
    expect(c.textContent).toContain('Nocturne kit is picked')
    act(() => button(c, 'Change')!.click())
    expect(onIndex).toHaveBeenCalledWith(2)
  })

  it('stacked: every step is a section and only the open one shows its body', () => {
    const c = mount(<CreateFlow steps={steps()} index={1} onIndexChange={() => {}} layout="stacked" />)
    expect(c.querySelectorAll('section').length).toBe(3)
    expect(c.textContent).toContain('body b')
    expect(c.textContent).not.toContain('body a')
  })

  it('canContinue false disables Continue, and the last step runs its own onNext', () => {
    const finish = vi.fn()
    const c = mount(<CreateFlow steps={steps(finish)} index={1} onIndexChange={() => {}} layout="stacked" />)
    expect(button(c, 'Continue')!.disabled).toBe(true)
    act(() => root!.render(<CreateFlow steps={steps(finish)} index={2} onIndexChange={() => {}} layout="stacked" />))
    act(() => button(c, 'Finish')!.click())
    expect(finish).toHaveBeenCalled()
  })
})
