import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PresenceState } from '@/lib/editor-crdt/awareness'
import { EditorPeersProvider, LivePresenceFaces, selectedKey } from './presence-live'

const peer = (userId: string, selectedNid: string | null = null): PresenceState => ({ userId, name: userId, color: '#112233', selectedNid })

describe('live presence wiring', () => {
  it('draws no faces without a live session (EDITOR_COLLAB off)', () => {
    expect(renderToStaticMarkup(<LivePresenceFaces />)).toBe('')
  })

  it('draws the faces a live session provides', () => {
    const html = renderToStaticMarkup(
      <EditorPeersProvider peers={[peer('Ana'), peer('Bo')]}>
        <LivePresenceFaces />
      </EditorPeersProvider>,
    )
    expect(html).toContain('Collaborators in this editor')
    expect(html).toContain('Ana')
    expect(html).toContain('Bo')
  })

  it('measures only the distinct nodes peers have selected', () => {
    expect(selectedKey([peer('a', 'nbbbbbbb'), peer('b', 'naaaaaaa'), peer('c', 'nbbbbbbb'), peer('d')])).toBe('naaaaaaa nbbbbbbb')
    expect(selectedKey([peer('a')])).toBe('')
  })
})
