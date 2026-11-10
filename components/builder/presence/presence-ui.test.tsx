import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { createPeerBook, PRESENCE_TTL_MS, type PresenceState } from '@/lib/editor-crdt/awareness'
import { EditorPresenceFaces, EditorSelectionOverlay } from './presence-ui'

const nodeId = 'nlocal001'
const peer = (userId: string, name: string, selectedNid: string | null = nodeId): PresenceState => ({
  userId, name, selectedNid, color: '#123456',
})
const box = { left: 20, top: 30, width: 200, height: 100 }

it('renders an accessible, bounded face list using the existing ephemeral peer book', () => {
  const book = createPeerBook()
  for (let i = 0; i < 7; i++) book.hear(peer(`user-${i}`, `Editor ${i}`), 0, 'self')
  book.hear(peer('self', 'Current editor'), 0, 'self')
  const html = renderToStaticMarkup(<EditorPresenceFaces peers={book.list()} />)

  expect(html).toContain('Collaborators in this editor')
  expect(html.match(/<li[ >]/g)).toHaveLength(6)
  expect(html).toContain('Editor 0')
  expect(html).toContain('2 more collaborators')
  expect(html).not.toMatch(/Current editor|Editor 5|user-0/)

  expect(book.prune(PRESENCE_TTL_MS)).toBe(true)
  expect(renderToStaticMarkup(<EditorPresenceFaces peers={book.list()} />)).toBe('')
})

it('draws one non-interactive selection outline with the peers at that node', () => {
  const peers = [peer('a', 'Ari'), peer('b', 'Blake'), peer('c', 'Outside', 'noutside1'), peer('d', 'Idle', null)]
  const html = renderToStaticMarkup(<EditorSelectionOverlay peers={peers} bounds={new Map([[nodeId, box]])} />)

  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('pointer-events-none')
  expect(html.match(/border-width|class="absolute border-2"/g)).toHaveLength(1)
  expect(html).toContain('left:20px;top:30px;width:200px;height:100px')
  expect(html).toContain('Ari')
  expect(html).toContain('Blake')
  expect(html).not.toMatch(/Outside|Idle|<button|tabindex/)
})

it.each([0, -1, Infinity])('ignores unusable node geometry with width %s', (width) => {
  const bounds = new Map([[nodeId, { ...box, width }]])
  expect(renderToStaticMarkup(<EditorSelectionOverlay peers={[peer('a', 'Ari')]} bounds={bounds} />)).toBe('')
})
