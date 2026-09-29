import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'

// LIVE-652 — reportContent stored a report without reading its target.
//
// THE DEFECT. The action allowed the target TYPE and that an id was sent, then
// inserted. A report could name any UUID and land in the moderation queue as
// something a moderator cannot open. SEC-3 (the moderation action acts on the
// report's own target) was already done; this is SEC-4 existence.
//
// SOURCE-SHAPE: the failure is a missing read between the empty-id guard and
// the reports insert. A runtime happy-path of a real post still saving would
// not notice the hole.

const FILE = path.join(import.meta.dirname, 'report-actions.ts')
const src = sourceWithoutComments(FILE)

const TARGETS: ReadonlyArray<{ type: string; table: string }> = [
  { type: 'post', table: 'posts' },
  { type: 'comment', table: 'posts' },
  { type: 'dispatch', table: 'dispatches' },
  { type: 'member', table: 'profiles' },
  { type: 'event', table: 'events' },
  { type: 'guestbook', table: 'spotlight_guestbook' },
]

describe('reportContent refuses a target that does not exist (LIVE-652)', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(500)
    expect(src).toContain('export async function reportContent')
    expect(src).toContain('async function reportTargetExists')
  })

  it('reads the target after the empty-id guard and before the reports insert', () => {
    const a = src.indexOf('Missing report target')
    const b = src.search(/from\('reports'\)\.insert/)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    const mid = src.slice(a, b)
    expect(
      /reportTargetExists/.test(mid),
      'a report is stored without reading its target, so a report can name a post, member or event that does not exist (LIVE-652).',
    ).toBe(true)
  })

  it('returns the same refusal as a bad type when the target is missing', () => {
    expect(src).toContain("fail('Invalid report target')")
    const a = src.indexOf('Missing report target')
    const b = src.search(/from\('reports'\)\.insert/)
    expect(src.slice(a, b)).toContain("fail('Invalid report target')")
  })

  it.each(TARGETS)('reads $table for a $type target', ({ type, table }) => {
    const helperStart = src.indexOf('async function reportTargetExists')
    const helperEnd = src.indexOf('export async function reportContent')
    expect(helperStart).toBeGreaterThan(0)
    expect(helperEnd).toBeGreaterThan(helperStart)
    const helper = src.slice(helperStart, helperEnd)
    const caseIdx = helper.indexOf(`case '${type}'`)
    expect(caseIdx, `no case for ${type}`).toBeGreaterThan(-1)
    const nextCase = helper.indexOf('case ', caseIdx + 1)
    const body = helper.slice(caseIdx, nextCase < 0 ? undefined : nextCase)
    expect(body).toContain(`.from('${table}')`)
  })
})
