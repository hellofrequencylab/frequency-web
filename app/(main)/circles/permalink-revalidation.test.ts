import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A Circle permalink rename MOVES the page, and the circle's link is embedded far beyond its own
// routes: the Channel page and Manage hub list it, Space surfaces can, the browse cards do.
// Revalidating only the circle's own paths left every embedding surface serving cached HTML that
// pointed at the DEAD slug - reported live: after renaming meld -> meld-royal-temple, clicking the
// circle from its Channel cycled 404 -> back -> the same cached link, indefinitely.
//
// Source-shape guard (the house idiom for asserting a clause EXISTS): the permalink action must
// keep the layout-wide revalidation of both embedding sections. Rare operation, broad flush - the
// right trade.
describe('updateCirclePermalink flushes the surfaces that embed circle links', () => {
  const src = readFileSync(join(__dirname, 'admin-actions.ts'), 'utf8')
  const fn = src.slice(src.indexOf('export async function updateCirclePermalink'))
  const body = fn.slice(0, fn.indexOf('\nexport '))

  it('still revalidates the circle-side paths (old slug, new slug, the index)', () => {
    expect(body).toContain('revalidatePath(`/circles/${slug}`)')
    expect(body).toContain('revalidatePath(`/circles/${next}`)')
    expect(body).toContain("revalidatePath('/circles')")
  })

  it('flushes the Channel and Space sections layout-wide, so no embedded link goes stale', () => {
    expect(body).toContain("revalidatePath('/channels', 'layout')")
    expect(body).toContain("revalidatePath('/spaces', 'layout')")
  })
})
