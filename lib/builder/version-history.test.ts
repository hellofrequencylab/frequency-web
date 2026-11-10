import { expect, it } from 'vitest'
import { selectedVersionIndex, versionTimeline } from './version-history'

const old = { id: '1', createdAt: '2026-11-10T12:00:00Z', author: 'Ari' }
const recent = { id: '2', createdAt: '2026-11-10T16:00:00Z', author: 'Blake' }

it('sorts a copy of the version metadata from oldest to newest', () => {
  const versions = Object.freeze([recent, { ...old, snapshot: { private: true } }])
  expect(versionTimeline(versions)).toStrictEqual([old, recent])
  expect(versions[0]).toBe(recent)
})

it('keeps one preview per version and omits unreadable entries', () => {
  expect(versionTimeline([recent, { ...old, id: '' }, { ...old, createdAt: 'bad date' }, old, {
    ...old, author: 'Duplicate',
  }])).toEqual([old, recent])
})

it.each([
  ['1', 0],
  ['2', 1],
  ['missing', 1],
  [null, 1],
] as const)('resolves the selected ID %s to index %s', (selected, expected) => {
  expect(selectedVersionIndex([old, recent], selected)).toBe(expected)
})

it('has no selected index when there are no versions', () => {
  expect(selectedVersionIndex([], null)).toBe(-1)
})
