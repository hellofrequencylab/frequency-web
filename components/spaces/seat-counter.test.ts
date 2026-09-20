import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SRC = 'components/spaces/seat-counter.tsx'

describe('SeatCounter never names Collective (LIVE-433)', () => {
  const src = readFileSync(SRC, 'utf8')

  it('does not type the retired Collective plan', () => {
    expect(src).not.toMatch(/Collective/)
  })

  it('points a full meter at Plan and billing, not a plan wall', () => {
    expect(src).toContain('Every operator seat is taken.')
    expect(src).toContain('Extra seats are on Plan and billing.')
    expect(src).toContain('Admins, moderators, and editors use a seat. Members are free.')
  })
})
