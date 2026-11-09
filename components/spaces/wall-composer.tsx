'use client'

import { useState } from 'react'
import { Hand } from 'lucide-react'
import { Composer } from '@/components/feed/composer'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { arrivalsSentence, type WallArrival } from '@/lib/spaces/community-wall-core'
import { createWallPost } from '@/app/(main)/spaces/[slug]/(profile)/community/actions'

// The Community wall's composer: the same box the Circle feed uses, posting through the wall's own
// action so the database decides who may write (ADR-1938). A client wrapper only because the
// composer's write override is a function and cannot cross the server boundary on its own.
//
// LIVE-2095 adds two things the handoff mock asks for (project files, community-wall/mock):
//  - the ARRIVALS strip above the box: who joined this week, and one button that starts a welcome
//    post for them. It shows only to a viewer who may post, because it is a prompt to act.
//  - the KINDS: Poll and Ask for everyone who may post, Announce for the Space team. The chips are
//    the composer's own; this wrapper only turns them on and passes the pick through.

export function WallComposer({
  spaceId,
  slug,
  spaceName,
  canAnnounce = false,
  arrivals = [],
}: {
  spaceId: string
  slug: string
  spaceName: string
  /** The Space team: owner and staff ladder. The database re-checks (private.is_space_member). */
  canAnnounce?: boolean
  arrivals?: WallArrival[]
}) {
  // "Wave hello" seeds the box with a welcome. The composer reads initialBody once on mount, so the
  // seed remounts it (key). There is no draft to lose at that moment: the button sits above an
  // empty box and goes away once the welcome is written or the strip is dismissed.
  const [seed, setSeed] = useState<{ body: string; n: number }>({ body: '', n: 0 })
  const [waved, setWaved] = useState(false)

  const faces = arrivals.slice(0, 4)
  const sentence = arrivalsSentence(arrivals.map((a) => a.displayName))

  function wave() {
    const names = arrivals.slice(0, 3).map((a) => a.displayName.trim().split(/\s+/)[0]).filter(Boolean)
    const who =
      names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    setSeed((s) => ({ body: `Welcome to ${spaceName}, ${who}! Say hi and tell us what brought you here.`, n: s.n + 1 }))
    setWaved(true)
  }

  return (
    <div className="space-y-3">
      {arrivals.length > 0 && !waved ? (
        <div
          role="region"
          aria-label="New this week"
          className="flex flex-col gap-3 rounded-card border border-border bg-surface-elevated p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 -space-x-2">
              {faces.map((a) => (
                <Avatar key={a.profileId} src={a.avatarUrl} name={a.displayName} size="sm" ring />
              ))}
            </div>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text">{sentence}</p>
              <p className="text-meta text-muted">
                Say hello. A new member who gets a reply in their first week usually comes back.
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={wave}>
            <Hand className="h-4 w-4" aria-hidden />
            Wave hello
          </Button>
        </div>
      ) : null}

      <Composer
        key={seed.n}
        scopeId={spaceId}
        visibility="cluster"
        placeholder={`Share something with ${spaceName}…`}
        initialBody={seed.body}
        submitKinds
        canAnnounce={canAnnounce}
        announce={{ label: 'Announce', hint: 'Announce: a notice from the team, marked as one on the wall' }}
        onSubmit={async ({ body, imageUrl, kind, pollOptions }) => {
          const res = await createWallPost({ spaceId, slug, body, imageUrl, kind, pollOptions })
          if ('error' in res) return { error: res.error }
        }}
      />
    </div>
  )
}
