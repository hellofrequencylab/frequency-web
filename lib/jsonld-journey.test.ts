import { describe, expect, it } from 'vitest'
import { journeySchema } from './jsonld'
import type { JourneyPlan, JourneyPlanItem } from './journey-plans'

const plan = { slug: 'come-home', title: 'Come Home', summary: 'A slow return.', cover_image: null } as unknown as JourneyPlan
const item = (over: Partial<JourneyPlanItem>) => ({ id: 'x', practice: null, note: null, est_minutes: null, ...over }) as unknown as JourneyPlanItem

describe('journeySchema (JRN-014)', () => {
  it('lists only real steps, never phases or modules', () => {
    const out = journeySchema(plan, [
      item({ id: 'p', block_type: 'phase' as never, title: 'Week 1' }),
      item({ id: 'm', block_type: 'module' as never, title: 'Module' }),
      item({ id: 'l', block_type: 'lesson', title: 'Arrive', est_minutes: 10 }),
      item({ id: 'q', block_type: 'practice', practice: { id: 'pr', title: 'Breathe', description: 'Slowly.' } as never, est_minutes: 5 }),
    ])
    expect(out.step.map((s) => s.name)).toEqual(['Arrive', 'Breathe'])
    expect(out.step[1].text).toBe('Slowly.')
    expect(out.totalTime).toBe('PT15M')
  })
  it('leads with the Journey cover when it is a public https url', () => {
    expect(journeySchema({ ...plan, cover_image: 'https://cdn.example.com/c.jpg' } as JourneyPlan, []).image[0]).toBe('https://cdn.example.com/c.jpg')
    expect(journeySchema({ ...plan, cover_image: 'covers/c.jpg' } as JourneyPlan, []).image).toHaveLength(1)
  })
})
