// @vitest-environment jsdom
// LIVE-2389: a comment row offers Report to a signed-in member on someone else's comment, and it
// opens the same content report dialog the post menu opens, aimed at that comment.
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const dialog = vi.fn()
vi.mock('@/components/report-dialog', () => ({
  ContentReportDialog: (props: { targetType: string; targetId: string; open: boolean }) => {
    dialog(props)
    return props.open ? <div data-testid="report-dialog">{`${props.targetType}:${props.targetId}`}</div> : null
  },
}))
vi.mock('@/components/profile-flair', () => ({ ProfileFlair: () => null }))
vi.mock('./post-body', () => ({ PostBody: ({ body }: { body: string }) => <div>{body}</div> }))

const author = (id: string) => ({ id, display_name: `Member ${id}`, handle: id, avatar_url: null, membership_tier: null })
const leaf = (id: string, by: string) => ({
  id, body: `words ${id}`, created_at: '2026-11-18T00:00:00Z', parent_id: 'post', author: author(by),
  reaction_count: 0, viewer_reacted: false, reactions: [],
})
vi.mock('@/app/(main)/feed/actions', () => ({
  toggleReaction: vi.fn(),
  createReply: vi.fn(),
  fetchReplies: async () => ({
    comments: [
      { ...leaf('c-mine', 'me'), replies: [leaf('c-nested', 'other')] },
      { ...leaf('c-theirs', 'other'), replies: [] },
    ],
    total: 3,
  }),
}))

import { PostReplies } from './post-replies'

let root: Root, container: HTMLDivElement
async function render(myProfileId: string | null) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<PostReplies postId="post" initialCount={3} postReactions={[]} myProfileId={myProfileId} />)
  })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const reportButtons = () => [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Report')
afterEach(() => { act(() => root?.unmount()); container?.remove(); dialog.mockClear() })

it('offers Report on other members comments only, never on your own', async () => {
  await render('me')
  // Three comments are on screen; the viewer wrote one of them.
  expect(container.textContent).toContain('words c-mine')
  expect(reportButtons()).toHaveLength(2)
})

it('offers no Report to a signed-out viewer', async () => {
  await render(null)
  expect(container.textContent).toContain('words c-theirs')
  expect(reportButtons()).toHaveLength(0)
})

it('opens the content report dialog aimed at that comment, and loads it only on the tap', async () => {
  await render('me')
  expect(dialog).not.toHaveBeenCalled()
  await act(async () => { reportButtons()[1].click() })
  await vi.waitFor(() => expect(document.querySelector('[data-testid="report-dialog"]')).toBeTruthy())
  expect(document.querySelector('[data-testid="report-dialog"]')?.textContent).toBe('comment:c-theirs')
})
