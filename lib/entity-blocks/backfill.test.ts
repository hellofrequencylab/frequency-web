import { describe, expect, it } from 'vitest'
import { backfillLayout } from './backfill'
import { hasNativeNodeStorage } from './legacy-write-guard'

const legacy = {
  rows: [{ id: 'r1', columns: 1, cells: [['text']] }],
  content: { text: { text: 'Alpha' } },
}

describe('backfillLayout', () => {
  it('skips an empty value', () => {
    expect(backfillLayout(null, 'space')).toEqual({ action: 'skip', reason: 'empty' })
  })

  it('converts a legacy document to node storage and keeps its content', () => {
    const v = backfillLayout(legacy, 'space')
    expect(v.action).toBe('convert')
    if (v.action !== 'convert') return
    expect(hasNativeNodeStorage(v.next)).toBe(true)
    expect(JSON.stringify(v.next)).toContain('Alpha')
  })

  it('is a no-op on its own output', () => {
    const first = backfillLayout(legacy, 'space')
    if (first.action !== 'convert') throw new Error('expected convert')
    expect(backfillLayout(first.next, 'space')).toEqual({ action: 'skip', reason: 'already-native' })
  })

  it('reports a value that is not a layout', () => {
    expect(backfillLayout('nope', 'member')).toEqual({ action: 'invalid' })
  })
})
