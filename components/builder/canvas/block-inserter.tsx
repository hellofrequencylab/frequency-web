'use client'

// ADD A BLOCK, PRESETS FIRST (PROG-E6B). The presets are on show: a block with starting words in it, named for
// what it does. The blank blocks sit behind one more tap, under them. Either lands under the block the inspector
// is on and is saved to the draft by the same write as every other change. The server decides what each id holds
// (lib/builder/canvas-presets.ts); this draws the choice. Third come the sections that show the Space's own live
// data (PROG-E6F), only the ones this Space may place now; each says what it shows. Every target is 44px and nothing waits on hover.

import { Button } from '@/components/ui/button'
import type { CanvasInserterView } from '@/lib/builder/canvas-presets'
import type { InsertSource } from '@/lib/builder/canvas-tree'

export function BlockInserter({
  inserter, under, off, onInsert,
}: {
  inserter: CanvasInserterView
  /** The name of the block the new one goes under. */
  under: string | null
  /** Why nothing can be added right now (a read-only page, a save in flight), or null. */
  off: string | null
  onInsert: (source: InsertSource, id: string) => void
}) {
  const blocked = off !== null || under === null
  return (
    <section aria-label="Add a block" className="space-y-2">
      <h2 className="text-body-sm font-semibold">Add a block</h2>
      <p className="text-meta text-muted">
        {off ?? (under ? `Start from a preset. It goes in under ${under}, with words you can change.` : 'Pick a block in Layers first. The new one goes in under it.')}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" data-inserter="presets">
        {inserter.presets.map((preset) => (
          <li key={preset.id} className="flex min-w-0 flex-col gap-1 rounded-control border border-border bg-surface p-3">
            <Button type="button" size="sm" variant="primarySoft" className="min-h-11 self-start" disabled={blocked || preset.disabled} onClick={() => onInsert('preset', preset.id)}>
              {preset.label}
            </Button>
            <span className="text-meta text-muted">{preset.disabled ? preset.reason : preset.say}</span>
          </li>
        ))}
      </ul>
      <details data-inserter="blanks">
        <summary className="flex min-h-11 cursor-pointer items-center text-body-sm">Or start with a blank block</summary>
        <ul className="mt-2 flex flex-wrap gap-2">
          {inserter.blanks.map((blank) => (
            <li key={blank.id}>
              <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={blocked || blank.disabled} title={blank.disabled ? blank.reason : undefined} aria-label={`Add a blank ${blank.label}`} onClick={() => onInsert('blank', blank.id)}>
                {blank.label}
              </Button>
            </li>
          ))}
        </ul>
      </details>
      {inserter.live && inserter.live.length > 0 && (
        <details data-inserter="live">
          <summary className="flex min-h-11 cursor-pointer items-center text-body-sm">Or show something from your Space</summary>
          <p className="text-meta text-muted">These fill in from the Space itself, so they stay up to date on their own.</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {inserter.live.map((section) => (
              <li key={section.id} className="flex min-w-0 flex-col gap-1 rounded-control border border-border bg-surface p-3">
                <Button type="button" size="sm" variant="secondary" className="min-h-11 self-start" disabled={blocked || section.disabled} aria-label={`Add ${section.label}`} onClick={() => onInsert('live', section.id)}>
                  {section.label}
                </Button>
                <span className="text-meta text-muted">{section.disabled ? section.reason : section.say}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
