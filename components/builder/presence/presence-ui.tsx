import { MousePointer2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { PresenceState } from '@/lib/editor-crdt/awareness'

const MAX_FACES = 5
const peerName = (peer: PresenceState) => peer.name.trim() || 'Collaborator'

export function EditorPresenceFaces({ peers }: { peers: readonly PresenceState[] }) {
  if (peers.length === 0) return null

  const remaining = peers.length - MAX_FACES
  return (
    <ul aria-label="Collaborators in this editor" className="flex flex-wrap items-center gap-1">
      {peers.slice(0, MAX_FACES).map((peer) => {
        const name = peerName(peer)
        return (
          <li key={peer.userId} title={name}>
            <span aria-hidden="true"><Avatar src={null} name={name} size="xs" /></span>
            <span className="sr-only">{name}</span>
          </li>
        )
      })}
      {remaining > 0 && (
        <li>
          <Badge size="sm" aria-hidden="true">+{remaining}</Badge>
          <span className="sr-only">{remaining} more {remaining === 1 ? 'collaborator' : 'collaborators'}</span>
        </li>
      )}
    </ul>
  )
}

type NodeBounds = Readonly<{ left: number; top: number; width: number; height: number }>

export function EditorSelectionOverlay({ peers, bounds }: {
  peers: readonly PresenceState[]
  /** Coordinates relative to the canvas overlay, supplied by the editor that owns the DOM. */
  bounds: ReadonlyMap<string, NodeBounds>
}) {
  const selections = new Map<string, { box: NodeBounds; peers: PresenceState[] }>()
  for (const peer of peers) {
    if (!peer.selectedNid) continue
    const current = selections.get(peer.selectedNid)
    if (current) {
      current.peers.push(peer)
      continue
    }
    const box = bounds.get(peer.selectedNid)
    if (
      !box || ![box.left, box.top, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 || box.height <= 0
    ) continue
    selections.set(peer.selectedNid, { box, peers: [peer] })
  }

  if (selections.size === 0) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from(selections, ([nid, { box, peers: selected }]) => (
        <div key={nid} className="absolute border-2" style={{ ...box, borderColor: selected[0].color }}>
          <div className="flex max-w-full flex-wrap gap-1">
            {selected.slice(0, MAX_FACES).map((peer) => (
              <Badge
                key={peer.userId}
                size="sm"
                className="max-w-full"
                icon={<MousePointer2 style={{ color: peer.color }} />}
              >
                <span className="truncate">{peerName(peer)}</span>
              </Badge>
            ))}
            {selected.length > MAX_FACES && <Badge size="sm">+{selected.length - MAX_FACES}</Badge>}
          </div>
        </div>
      ))}
    </div>
  )
}
