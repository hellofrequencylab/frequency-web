// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, container: HTMLDivElement
function render(node: React.ReactNode) { container = document.createElement('div'); document.body.append(container); root = createRoot(container); act(() => root.render(node)) }
function named(name: string) { const button = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name); expect(button).toBeTruthy(); return button! }
import { ReactionCounts } from './reaction-button'
import { PostReplies } from './post-replies'
vi.mock('@/app/(main)/feed/actions', () => ({ toggleReaction: vi.fn(), createReply: vi.fn(), fetchReplies: async () => ({ comments: [], total: 3 }) }))
vi.mock('@/components/profile-flair', () => ({ ProfileFlair: () => null }))
afterEach(() => { act(() => root?.unmount()); container?.remove() })
it.each([['❤️', 'Love this'], ['🙌🏽', 'Celebrate'], ['😂', 'Funny']])('keeps the visible count in the accessible reaction name for %s', (key, label) => {
  const toggle = vi.fn()
  render(<ReactionCounts base={new Map([[key, { count: 3, mine: true }]])} toggle={toggle} failed={false} pending={false} />)
  const button = named(`${label} · 3`)
  expect(button.textContent).toContain('3')
  expect(button.getAttribute('aria-pressed')).toBe('true')
  act(() => button.click())
  expect(toggle).toHaveBeenCalledWith(key)
})
it('keeps the comments count in both accessible action names and exposes the expanded state', async () => {
  render(<PostReplies postId="fixture" initialCount={3} postReactions={[]} />)
  const hide = named('Hide comments · 3')
  expect(hide.textContent).toContain('3')
  expect(hide.getAttribute('aria-expanded')).toBe('true')
  await act(async () => { await Promise.resolve() })
  act(() => hide.click())
  const show = named('Show comments · 3')
  expect(show.getAttribute('aria-expanded')).toBe('false')
})
