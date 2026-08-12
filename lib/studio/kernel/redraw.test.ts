import { describe, it, expect } from 'vitest'
import type { EntityManifest } from '@/lib/studio/kernel/manifest'
import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import {
  applyLock,
  changedFields,
  declaredLockKeys,
  lockLabel,
  lockedPaths,
} from './redraw'

// A tiny stand-in manifest, so the lock/diff rules are asserted against a shape this file
// controls rather than against whatever the Practice happens to declare today. The Practice
// assertions below are the separate "the real entity honours it" check.
const TOY: EntityManifest = {
  entity: 'toy',
  label: 'Toy',
  sections: [
    { key: 'identity', title: 'Identity', desc: 'The name.' },
    { key: 'content', title: 'The content', desc: 'The words.' },
  ],
  fields: [
    { path: 'title', label: 'Name', kind: 'text', section: 'identity' },
    { path: 'summary', label: 'Hook', kind: 'text', section: 'content' },
    { path: 'body', label: 'The guide', kind: 'longtext', section: 'content' },
  ],
  steer: { mood: true, directions: true, lock: ['content', 'title'] },
}

describe('declaredLockKeys', () => {
  it('keeps only the pins the manifest offers', () => {
    expect(declaredLockKeys(TOY, ['content', 'invented'])).toEqual(['content'])
  })

  it('de-duplicates and survives an entity that declares no lock at all', () => {
    expect(declaredLockKeys(TOY, ['title', 'title'])).toEqual(['title'])
    expect(declaredLockKeys({ ...TOY, steer: undefined }, ['content'])).toEqual([])
  })
})

describe('lockedPaths', () => {
  it('expands a SECTION pin to every field in it', () => {
    expect(lockedPaths(TOY, ['content']).sort()).toEqual(['body', 'summary'])
  })

  it('resolves a FIELD pin to that one path', () => {
    expect(lockedPaths(TOY, ['title'])).toEqual(['title'])
  })

  it('resolves an unknown pin to nothing', () => {
    expect(lockedPaths(TOY, ['nope'])).toEqual([])
  })
})

describe('applyLock', () => {
  it('deletes every pinned path from a patch, whatever the model returned', () => {
    const patch = { title: 'New name', summary: 'New hook', body: 'New guide' }
    expect(applyLock(TOY, ['content'], patch)).toEqual({ title: 'New name' })
  })

  it('passes an unpinned patch through untouched, and never mutates the input', () => {
    const patch = { title: 'New name', summary: 'New hook' }
    expect(applyLock(TOY, [], patch)).toEqual(patch)
    expect(patch).toEqual({ title: 'New name', summary: 'New hook' })
  })

  it('ignores a pin the manifest never offered, so a client cannot invent protection', () => {
    const patch = { title: 'New name' }
    expect(applyLock({ ...TOY, steer: { lock: ['content'] } }, ['title'], patch)).toEqual(patch)
  })
})

describe('changedFields', () => {
  it('reports only what moved, in manifest order, with the manifest label', () => {
    const before = { title: 'Old', summary: 'Same', body: 'Old guide' }
    const after = { title: 'New', summary: 'Same', body: 'New guide' }
    expect(changedFields(TOY, before, after)).toEqual([
      { path: 'title', label: 'Name', before: 'Old', after: 'New' },
      { path: 'body', label: 'The guide', before: 'Old guide', after: 'New guide' },
    ])
  })

  it('reads an unset field as empty rather than dropping the row', () => {
    expect(changedFields(TOY, {}, { summary: 'Written' })).toEqual([
      { path: 'summary', label: 'Hook', before: '', after: 'Written' },
    ])
  })

  it('compares only DECLARED fields, so an undeclared key is never reported', () => {
    expect(changedFields(TOY, { secret: 'a' }, { secret: 'b' })).toEqual([])
  })
})

describe('the Practice, end to end', () => {
  it('pins the whole practice content section behind one lock key', () => {
    expect(PRACTICE_MANIFEST.steer?.lock).toContain('content')
    expect(lockLabel(PRACTICE_MANIFEST, 'content')).toBe('The practice')
    expect(lockedPaths(PRACTICE_MANIFEST, ['content']).sort()).toEqual(['body', 'description', 'summary'])
  })

  it('lets a redraw rewrite the name and cadence while the pinned guide survives', () => {
    const veraSaid = {
      title: 'Two minute reset',
      summary: 'A rewritten hook',
      description: 'A rewritten description',
      body: 'A rewritten guide',
      cadence: 'Weekly',
    }
    expect(applyLock(PRACTICE_MANIFEST, ['content'], veraSaid)).toEqual({
      title: 'Two minute reset',
      cadence: 'Weekly',
    })
  })
})
