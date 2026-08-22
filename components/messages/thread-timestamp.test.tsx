// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The hover timestamp in a DM thread, pinned as MARKUP SHAPE rather than rendered output.
//
// Rendering MessageThread here would mean standing up a Supabase client, a realtime channel and a
// server action for an assertion that is purely about where one element sits in the tree — so this
// reads the source, the same way the repo's other structural guards do.
//
// 🔴 THE DEFECT (owner report, 2026-08-22, with a screenshot). The timestamp was a flex SIBLING of
// the message bubble:
//
//     <div className="group flex items-end gap-1.5">
//       <span className="text-3xs …">{formatTime(msg.created_at)}</span>   ← no shrink-0, no nowrap
//       <div className="px-3 py-2 …">{msg.body}</div>
//     </div>
//
// inside a `max-w-[72%]` column. On any message long enough to claim the width — most of them —
// flex squeezed the span to a few pixels and "Aug 20, 8:14 PM" wrapped one word per line into a
// crushed column jammed against the edge.
//
// The fix is structural, so the guard is too: the timestamp lives in the COLUMN under the bubble
// run, where flex has no cross-axis to squeeze it on, and carries `whitespace-nowrap` so it could
// not wrap even if something tried.

const SRC = readFileSync(join(process.cwd(), 'components/messages/thread.tsx'), 'utf8')

describe('DM thread timestamp', () => {
  it('is a <time> element, not a bare span', () => {
    // Semantic, and it gives the machine-readable value the visible short form drops.
    expect(SRC).toMatch(/<time\s/)
    expect(SRC).toMatch(/dateTime=\{/)
  })

  it('cannot wrap', () => {
    const time = SRC.slice(SRC.indexOf('<time'), SRC.indexOf('</time>'))
    expect(time).toContain('whitespace-nowrap')
  })

  it('keeps its space at rest, so revealing it never reflows the transcript', () => {
    const time = SRC.slice(SRC.indexOf('<time'), SRC.indexOf('</time>'))
    // opacity-0, NOT hidden/invisible-with-no-box: the line is always laid out.
    expect(time).toContain('opacity-0')
    expect(time).toContain('group-hover:opacity-100')
  })

  it('is a child of the bubble COLUMN, and no longer a flex sibling of the bubble', () => {
    // The stack is the hover group and it is a flex-col; the timestamp sits inside it.
    expect(SRC).toMatch(/group flex flex-col gap-0\.5 max-w-\[72%\]/)
    // The old squeezing row is gone.
    expect(SRC).not.toContain('group flex items-end gap-1.5')
  })

  it('renders ONE timestamp per run of messages, taken from the last one', () => {
    const times = SRC.match(/<time\s/g) ?? []
    expect(times).toHaveLength(1)
    expect(SRC).toContain('group.msgs[group.msgs.length - 1]')
  })
})
