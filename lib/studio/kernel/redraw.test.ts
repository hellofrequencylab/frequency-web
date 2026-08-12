import { describe, it, expect } from 'vitest'
import { REPEAT_ITEM_SELF, type EntityManifest } from '@/lib/studio/kernel/manifest'
import { PRACTICE_MANIFEST } from '@/lib/studio/entities/practice'
import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import { JOURNEY_MANIFEST } from '@/lib/studio/entities/journey'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import {
  applyLock,
  changedFields,
  declaredLockKeys,
  displayRecord,
  displayText,
  lockLabel,
  lockedPaths,
  pathLabel,
  redrawBrief,
  settleRedraw,
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

// ── ADR-996: the lock reaches repeated collections, and the shared spine ────────────────────

/** A manifest with a REPEATED collection in its own section, which is the shape two of the
 *  three entities that generalized this actually have (Circle: agreements, Journey: arc). */
const TOY_WITH_REPEAT: EntityManifest = {
  ...TOY,
  sections: [...TOY.sections, { key: 'agreements', title: 'Agreements', desc: 'The norms.' }],
  repeats: [
    {
      arrayPath: 'agreements',
      section: 'agreements',
      itemLabel: (_item, index) => `Agreement ${index + 1}`,
      fields: [{ path: REPEAT_ITEM_SELF, label: 'wording', kind: 'text' }],
    },
  ],
  steer: { mood: true, directions: true, lock: ['content', 'title', 'agreements'] },
}

describe('lockedPaths over a repeated collection', () => {
  it('resolves a pin on a repeat SECTION to the collection path', () => {
    expect(lockedPaths(TOY_WITH_REPEAT, ['agreements'])).toEqual(['agreements'])
  })

  it('deletes the whole collection from a patch, so the pin actually holds', () => {
    const patch = { title: 'New name', agreements: ['a', 'b'] }
    expect(applyLock(TOY_WITH_REPEAT, ['agreements'], patch)).toEqual({ title: 'New name' })
  })

  it('is the gap the Practice could never have caught (it declares no repeats to pin)', () => {
    expect(lockedPaths(TOY, ['agreements'])).toEqual([])
  })
})

describe('the two entities that pin a collection', () => {
  it('a Circle pin on the agreements resolves and deletes', () => {
    expect(CIRCLE_MANIFEST.steer?.lock).toContain('agreements')
    expect(lockedPaths(CIRCLE_MANIFEST, ['agreements'])).toEqual(['agreements'])
    expect(applyLock(CIRCLE_MANIFEST, ['agreements'], { name: 'Kept', agreements: ['rewritten'] })).toEqual({
      name: 'Kept',
    })
  })

  it('a Journey pin on the arc resolves and deletes, and identity still covers the name', () => {
    expect(JOURNEY_MANIFEST.steer?.lock).toEqual(['identity', 'arc'])
    expect(lockedPaths(JOURNEY_MANIFEST, ['arc'])).toEqual(['arc'])
    expect(lockedPaths(JOURNEY_MANIFEST, ['identity'])).toContain('title')
    expect(applyLock(JOURNEY_MANIFEST, ['identity', 'arc'], { title: 'x', summary: 'kept', arc: [{}] })).toEqual({
      summary: 'kept',
    })
  })

  it('an Event declares no lock at all, so every requested pin is dropped', () => {
    expect(EVENT_MANIFEST.steer?.lock).toBeUndefined()
    expect(declaredLockKeys(EVENT_MANIFEST, ['identity', 'story'])).toEqual([])
    expect(applyLock(EVENT_MANIFEST, ['story'], { description: 'rewritten' })).toEqual({
      description: 'rewritten',
    })
  })
})

describe('pathLabel', () => {
  it('names a plain field by its own label', () => {
    expect(pathLabel(TOY_WITH_REPEAT, 'summary')).toBe('Hook')
  })

  it('names a repeated collection by its section title, which is what the author calls it', () => {
    expect(pathLabel(TOY_WITH_REPEAT, 'agreements')).toBe('Agreements')
  })

  it('falls back to the raw path so a diff row is never nameless', () => {
    expect(pathLabel(TOY_WITH_REPEAT, 'nope')).toBe('nope')
  })
})

describe('displayText', () => {
  it('renders scalars as themselves and a list joined', () => {
    expect(displayText('a')).toBe('a')
    expect(displayText(3)).toBe('3')
    expect(displayText(['one', 'two'])).toBe('one, two')
  })

  it('is total: null, undefined, and an object all read empty', () => {
    expect(displayText(null)).toBe('')
    expect(displayText(undefined)).toBe('')
    expect(displayText({ a: 1 })).toBe('')
    expect(displayRecord({ a: null, b: ['x'] })).toEqual({ a: '', b: 'x' })
  })
})

describe('redrawBrief', () => {
  it('carries the lead, the mood tone, the directions, and the pins by their human names', () => {
    const brief = redrawBrief({
      manifest: TOY_WITH_REPEAT,
      lead: 'Draft it again.',
      mood: 'calm',
      directions: 'Lean on the beginners.',
      locked: ['agreements'],
    })
    expect(brief).toContain('Draft it again.')
    expect(brief).toContain('Calm and trustworthy')
    expect(brief).toContain('How to approach it: Lean on the beginners.')
    expect(brief).toContain('Leave this exactly as it is, word for word: Agreements.')
  })

  it('never names a pin the manifest did not offer', () => {
    expect(redrawBrief({ manifest: TOY, lead: 'Go.', locked: ['invented'] })).not.toContain('invented')
  })

  it('falls back to the default mood and omits an empty directions line', () => {
    const brief = redrawBrief({ manifest: TOY, lead: 'Go.', directions: '   ' })
    expect(brief).toContain('Warm and grounded')
    expect(brief).not.toContain('How to approach it')
  })
})

describe('settleRedraw', () => {
  const current = { title: 'Old name', summary: 'Old hook', body: 'Old guide', agreements: 'a, b' }

  it('reports only what moved, in manifest order, with labels', () => {
    const settled = settleRedraw({
      manifest: TOY_WITH_REPEAT,
      locked: [],
      current,
      proposed: { title: 'New name', summary: 'Old hook', agreements: 'a, b, c' },
    })
    expect(settled.changedPaths).toEqual(['title', 'agreements'])
    expect(settled.changes[0]).toEqual({ path: 'title', label: 'Name', before: 'Old name', after: 'New name' })
    expect(settled.changes[1].label).toBe('Agreements')
  })

  it('DELETES a pinned path before comparing, so it can never reach the diff', () => {
    const settled = settleRedraw({
      manifest: TOY_WITH_REPEAT,
      locked: ['content', 'agreements'],
      current,
      proposed: { title: 'New name', body: 'A rewritten guide', agreements: 'wiped' },
    })
    expect(settled.changedPaths).toEqual(['title'])
    expect(settled.kept).toEqual(['The content', 'Agreements'])
  })

  it('ignores a path the manifest never declared', () => {
    const settled = settleRedraw({
      manifest: TOY_WITH_REPEAT,
      locked: [],
      current,
      proposed: { secret: 'smuggled' },
    })
    expect(settled.changes).toEqual([])
  })

  it('treats an unchanged value as no change, so "nothing moved" is honest', () => {
    const settled = settleRedraw({
      manifest: TOY_WITH_REPEAT,
      locked: [],
      current,
      proposed: { title: 'Old name', summary: 'Old hook' },
    })
    expect(settled.changes).toEqual([])
  })

  it('reads an unset current value as empty rather than dropping the row', () => {
    const settled = settleRedraw({
      manifest: TOY,
      locked: [],
      current: {},
      proposed: { summary: 'Written' },
    })
    expect(settled.changes).toEqual([
      { path: 'summary', label: 'Hook', before: '', after: 'Written' },
    ])
  })
})
