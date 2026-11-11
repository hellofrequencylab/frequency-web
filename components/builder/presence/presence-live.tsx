'use client'

// LIVE PRESENCE WIRING (BLD-401). The shell half of presence: who else is in the editor, and where their
// selection sits on the canvas. The peers come from the editing provider's peer book (lib/editor-crdt/provider.ts,
// `presence` option) through whoever owns the live session; this file only carries them to the UI and measures
// node boxes. It imports no CRDT runtime (only a type), so it is safe in any editor chunk, and it never touches a
// document: presence is ephemeral and travels on the channel only. With no session (EDITOR_COLLAB off) the list is
// empty and every piece here renders nothing.

import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react'
import type { PresenceState } from '@/lib/editor-crdt/awareness'
import { EditorPresenceFaces, EditorSelectionOverlay, type NodeBounds } from './presence-ui'

const NO_PEERS: readonly PresenceState[] = []
const NO_BOUNDS: ReadonlyMap<string, NodeBounds> = new Map()

const PeersContext = createContext<readonly PresenceState[]>(NO_PEERS)

/** The live session's owner provides its peers here; a shell's top bar reads them with LivePresenceFaces. */
export function EditorPeersProvider({ peers, children }: { peers: readonly PresenceState[]; children: ReactNode }) {
  return <PeersContext.Provider value={peers}>{children}</PeersContext.Provider>
}

export const useEditorPeers = () => useContext(PeersContext)

/** Faces for a top bar, from the nearest live session. Nothing without one. */
export function LivePresenceFaces() {
  return <EditorPresenceFaces peers={useEditorPeers()} />
}

/** The attribute a canvas node carries so its box can be measured for a peer's selection outline. */
export const PRESENCE_NID_ATTR = 'data-presence-nid'

/** The sorted, distinct node ids the peers have selected, as one dependency key. */
export const selectedKey = (peers: readonly PresenceState[]) =>
  [...new Set(peers.map((p) => p.selectedNid).filter((n): n is string => !!n))].sort().join(' ')

/** Boxes of the nodes the peers have selected, relative to `root`. Re-measured when the selections or the root's
 *  size change. Only the selected nodes are measured, so an empty room costs nothing. */
export function usePeerSelectionBounds(root: RefObject<HTMLElement | null>, peers: readonly PresenceState[]) {
  const [bounds, setBounds] = useState<ReadonlyMap<string, NodeBounds>>(NO_BOUNDS)
  const key = selectedKey(peers)

  useEffect(() => {
    const el = root.current
    const wanted = new Set(key ? key.split(' ') : [])
    const measure = () => {
      if (!el || wanted.size === 0) return setBounds(NO_BOUNDS)
      const base = el.getBoundingClientRect()
      const next = new Map<string, NodeBounds>()
      for (const node of el.querySelectorAll<HTMLElement>(`[${PRESENCE_NID_ATTR}]`)) {
        const nid = node.getAttribute(PRESENCE_NID_ATTR)
        if (!nid || !wanted.has(nid)) continue
        const r = node.getBoundingClientRect()
        next.set(nid, { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height })
      }
      setBounds(next)
    }
    const frame = requestAnimationFrame(() => measure())
    const observer = el && wanted.size > 0 && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
    if (el) observer?.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [root, key])

  return bounds
}

/** Peer selection outlines over the nodes inside `root` (which must be `position: relative`). */
export function LiveSelectionOverlay({ root, peers }: { root: RefObject<HTMLElement | null>; peers: readonly PresenceState[] }) {
  const bounds = usePeerSelectionBounds(root, peers)
  return <EditorSelectionOverlay peers={peers} bounds={bounds} />
}
