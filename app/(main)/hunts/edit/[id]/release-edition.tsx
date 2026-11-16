'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { StudioNote } from '@/components/studio/kit/studio-field'
import { useTrailPublish } from '@/components/hunts/trail-publish-context'
import type { ReleasePreview } from '@/lib/hunts/edition-store'
import { previewReleaseAction, releaseEditionAction } from '../../edition-actions'

// THE RELEASE STEP (FH-044S, ADR-1972): a Trail that already has a published edition releases its open
// draft as the next edition through releaseEditionAction, which carries each printed code with its
// place and retires the outgoing edition. Before the tap the author reads what the release will do:
// where every stop's code goes, which codes retire, and how many people are part way through the
// outgoing edition (they get the owner's 7 days to finish on it). Dark with the editor.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ReleaseEditionPanel() {
  const ctx = useTrailPublish()
  const [preview, setPreview] = useState<ReleasePreview | null | undefined>(undefined)
  const [readError, setReadError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [releasing, setReleasing] = useState(false)
  const [released, setReleased] = useState<number | null>(null)
  const huntId = ctx?.huntId
  const revision = ctx?.revision

  // Read again whenever a save lands, so the moves match the draft the tap would release.
  useEffect(() => {
    if (!huntId) return
    let live = true
    void previewReleaseAction({ huntId }).then((res) => {
      if (!live) return
      if ('error' in res) {
        setReadError(res.error)
        return
      }
      setReadError(null)
      setPreview(res.data)
    })
    return () => {
      live = false
    }
  }, [huntId, revision])

  if (!ctx) return null

  const release = async () => {
    setReleasing(true)
    const res = await releaseEditionAction({
      huntId: ctx.huntId, baseRevision: ctx.revision, label, visibility: ctx.visibility, permissionConfirmed: ctx.permissionConfirmed,
    })
    setReleasing(false)
    if ('error' in res) return ctx.onBlocked(res.error)
    if ('conflict' in res.data) return ctx.onConflict(res.data.currentRevision)
    if ('blocked' in res.data) return ctx.onBlocked(res.data.items.find((i) => !i.ok)?.message ?? 'Something on the checklist is still open.')
    setReleased(res.data.versionNo)
    ctx.onPublished()
  }

  if (released !== null) {
    return (
      <div className="rounded-card border border-primary bg-surface p-4 text-body text-text">
        Edition {released} is live. The trail keeps its link, and the printed codes moved with their places.
      </div>
    )
  }
  if (readError) return <StudioNote>{readError}</StudioNote>
  if (preview === undefined) return <StudioNote>Reading what this release changes.</StudioNote>
  if (preview === null) return <StudioNote>There is no new draft to release yet. Edit a stop to start the next edition.</StudioNote>

  const moved = preview.moves.filter((m) => m.to !== null && m.to !== m.from)
  const dropped = preview.moves.filter((m) => m.to === null)

  return (
    <section className="space-y-4" aria-labelledby="release-edition-heading">
      <h2 id="release-edition-heading" className="text-body font-semibold text-text">
        Release edition {preview.incomingNo}
      </h2>
      <p className="text-body-sm text-muted">
        Edition {preview.incomingNo} replaces edition {preview.outgoingNo}. The trail keeps its link. Each printed code stays where it is and points at the stop at the same place.
      </p>

      <div className="space-y-2">
        <p className="text-body-sm font-semibold text-text">Where the printed codes go</p>
        <ul className="space-y-1 text-body-sm">
          {preview.moves.map((m) => (
            <li key={m.from} className={m.to === null ? 'text-warning' : 'text-muted'}>
              Stop {m.from}{m.place ? `, ${m.place}` : ''}:{' '}
              {m.to === null ? 'this place is gone, so its code retires.' : m.to === m.from ? `stays stop ${m.to}.` : `becomes stop ${m.to}.`}
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-muted">
          {moved.length === 0 && dropped.length === 0 ? 'Every stop keeps its place and number.' : `${plural(moved.length, 'stop moves', 'stops move')}, ${plural(dropped.length, 'place is', 'places are')} dropped.`}{' '}
          {preview.retiredCodes === 0
            ? 'No printed code retires.'
            : `${plural(preview.retiredCodes, 'printed code retires', 'printed codes retire')}: it still opens the trail and counts for nothing. Take it down when you can.`}
        </p>
      </div>

      <StudioNote>
        {preview.pinnedRuns === 0
          ? `Nobody is part way through edition ${preview.outgoingNo}.`
          : `${plural(preview.pinnedRuns, 'person is', 'people are')} part way through edition ${preview.outgoingNo}. They can keep checking in on it for ${preview.graceDays} days after you release. After that their run is a record they keep, and they start edition ${preview.incomingNo} fresh.`}
      </StudioNote>

      <Field label="Name this edition" hint={`Players see it beside their old runs. Leave it empty for "Edition ${preview.incomingNo}".`}>
        <Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} disabled={ctx.published || releasing} />
      </Field>

      <Button size="lg" className="w-full" onClick={release} disabled={!ctx.ready || ctx.published} loading={releasing}>
        Release edition {preview.incomingNo}
      </Button>
    </section>
  )
}
