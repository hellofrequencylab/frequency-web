import { describe, expect, it } from 'vitest'
import { isPastPencil } from './past-pencil'

describe('isPastPencil', () => {
  it('is true only when every date of a Pencil is before today', () => {
    expect(isPastPencil('pencil', ['2026-09-22', '2026-09-24'], '2026-11-25')).toBe(true)
    expect(isPastPencil('pencil', ['2026-09-22', '2026-11-25'], '2026-11-25')).toBe(false)
  })
  it('never folds a Pencil with no dates, or a Plan past Pencil', () => {
    expect(isPastPencil('pencil', [], '2026-11-25')).toBe(false)
    expect(isPastPencil('plan', ['2026-09-22'], '2026-11-25')).toBe(false)
    expect(isPastPencil('production', ['2026-09-22'], '2026-11-25')).toBe(false)
  })
})
