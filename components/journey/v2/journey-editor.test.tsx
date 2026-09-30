import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// LIVE-689: the Journey builder draws every block in its STORED order, the order the member's
// player reads (lib/journeys/tree.ts). Before, a phase drew "the lessons, then a Practices group,
// then the modules", so a practice stored first was drawn last and the arrows swapped rows the
// operator could not see. Asserted on the rendered markup: the order the titles appear in.

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(main)/journeys/[slug]/edit/actions', () => {
  const stub = vi.fn(async () => ({ data: undefined }))
  return {
    addPhaseAction: stub,
    addModuleAction: stub,
    addLessonAction: stub,
    addPracticeBlockAction: stub,
    addExtraCreditAction: stub,
    updateBlockAction: stub,
    removeBlockAction: stub,
    moveBlockAction: stub,
    reorderBlocksAction: stub,
    draftSlotCoachingAction: stub,
    populateWeekAction: stub,
    setBlockPracticeAction: stub,
    mintPracticeForBlockAction: stub,
    setLeafAnchorAction: stub,
    setLeafWarmupMessageAction: stub,
  }
})

import { JourneyEditor, type EditorBlock } from './journey-editor'

const block = (id: string, parentId: string | null, blockType: string, sortOrder: number, title: string): EditorBlock => ({
  id,
  parentId,
  blockType,
  title,
  body: '',
  sortOrder,
  check: null,
  domainId: null,
  practiceId: blockType === 'practice' ? `practice-${id}` : null,
  coachingPrompt: null,
  extraCredit: false,
  bonusZaps: 0,
})

/** The titles of the given blocks, in the order they appear in the markup. */
const drawnOrder = (html: string, titles: string[]) =>
  titles
    .map((t) => ({ t, at: html.indexOf(`value="${t}"`) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.t)

describe('JourneyEditor draws the stored order (LIVE-689)', () => {
  // Stored deliberately out of array order, practices first and last, a module in the middle.
  const blocks: EditorBlock[] = [
    block('recap', 'p1', 'check', 4, 'Recap check'),
    block('m1', 'p1', 'module', 3, 'Module Evening'),
    block('intro', 'p1', 'lesson', 1, 'Intro lesson'),
    block('breathe', 'p1', 'practice', 0, 'Breathe practice'),
    block('walk', 'p1', 'practice', 2, 'Walk practice'),
    block('m1-sit', 'm1', 'practice', 0, 'Sit practice'),
    block('m1-read', 'm1', 'reading', 1, 'Evening reading'),
    block('p1', null, 'phase', 0, 'Week one'),
  ]
  const html = renderToStaticMarkup(<JourneyEditor slug="first-light" blocks={blocks} />)

  it('a practice stored before a lesson is drawn before it, and a module sits in its place', () => {
    expect(
      drawnOrder(html, ['Week one', 'Breathe practice', 'Intro lesson', 'Walk practice', 'Module Evening', 'Sit practice', 'Evening reading', 'Recap check']),
    ).toEqual(['Week one', 'Breathe practice', 'Intro lesson', 'Walk practice', 'Module Evening', 'Sit practice', 'Evening reading', 'Recap check'])
  })

  it('no longer gathers practices into a separate group drawn after the lessons', () => {
    expect(html).not.toMatch(/>\s*Practices\s*</)
  })

  it('every phase, module and step carries a drag grip', () => {
    expect(html.match(/title="Drag to reorder"/g)?.length).toBe(blocks.length)
  })
})
