'use client'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/field'
import { selectedVersionIndex, versionTimeline, type EditorVersionSummary } from '@/lib/builder/version-history'

const FORMAT_DATE = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
})

export function HistoryScrubber({ versions, selectedId, onPreview, onRestore }: {
  versions: readonly EditorVersionSummary[]
  selectedId: string | null
  onPreview: (versionId: string) => void
  /** Copies the selected version into the draft (BLD-403). Left out, the button stays off. */
  onRestore?: (versionId: string) => void
}) {
  const timeline = versionTimeline(versions)
  const index = selectedVersionIndex(timeline, selectedId)
  const selected = timeline[index]
  if (!selected) {
    return <EmptyState title="No versions yet" description="Your first publish adds a version to the timeline." />
  }

  const date = FORMAT_DATE.format(new Date(selected.createdAt))
  const label = `Version ${index + 1} of ${timeline.length}, ${date} UTC`
  const choose = (next: number) => {
    const version = timeline[next]
    if (version && next !== index) onPreview(version.id)
  }

  return (
    <section aria-label="Version history" className="min-w-0 space-y-3">
      <h2 className="text-lead font-semibold">Version history</h2>
      <div className="rounded-card border border-border bg-surface p-4">
        <p className="text-body font-semibold">Version {index + 1} of {timeline.length}</p>
        <p className="text-body-sm text-muted">
          <time dateTime={selected.createdAt}>{date} UTC</time>
          {selected.author.trim() ? <> · {selected.author}</> : null}
        </p>
      </div>
      <label className="block text-body-sm text-muted">
        Preview a version
        <Input
          variant="seamless"
          className="mt-2 block w-full accent-current"
          type="range"
          min={0}
          max={timeline.length - 1}
          step={1}
          value={index}
          disabled={timeline.length === 1}
          aria-valuetext={label}
          onChange={(event) => choose(event.currentTarget.valueAsNumber)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={index === 0} onClick={() => choose(index - 1)}>Earlier</Button>
        <Button type="button" variant="secondary" disabled={index === timeline.length - 1} onClick={() => choose(index + 1)}>Later</Button>
        <Button type="button" variant="secondary" disabled={!onRestore} onClick={() => onRestore?.(selected.id)}>Restore to draft</Button>
      </div>
      <p className="text-body-sm text-muted">
        Previewing a version leaves your draft unchanged.{' '}
        {onRestore ? 'Restore copies it into your draft. Publish when it looks right.' : 'Restore is currently unavailable.'}
      </p>
    </section>
  )
}
