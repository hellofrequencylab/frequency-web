import { describe, it, expect } from 'vitest'
import {
  PICKER_ACTION_LABEL,
  PICKER_FEELS,
  PICKER_NICHES,
  actionsForNiche,
  nicheFromHint,
  pickerQuestions,
  resolvePicker,
} from './space-picker'
import { MEGA_ACTIONS, MEGA_NICHES, MEGA_THEMES } from '@/lib/theme/mega-theme'

describe('the picker config (ADR-1883)', () => {
  it('has a card for every niche, each offering known actions with a label', () => {
    expect(PICKER_NICHES.map((n) => n.id).sort()).toEqual([...MEGA_NICHES].sort())
    for (const n of PICKER_NICHES) {
      expect(n.actions.length).toBeGreaterThan(0)
      for (const a of n.actions) expect(PICKER_ACTION_LABEL[a]).toBeTruthy()
    }
    expect(Object.keys(PICKER_ACTION_LABEL).sort()).toEqual([...MEGA_ACTIONS].sort())
  })

  it('points every feel at a real theme, and every feel is live', () => {
    for (const f of PICKER_FEELS) expect(MEGA_THEMES.some((t) => t.id === f.theme)).toBe(true)
    expect(PICKER_FEELS.filter((f) => f.live).map((f) => f.theme)).toEqual(['midnight', 'frequency', 'bold', 'temple', 'wildheart', 'network'])
  })

  it('skips question one when a door already named the niche', () => {
    expect(pickerQuestions(null)).toEqual(['niche', 'action', 'feel', 'site'])
    expect(pickerQuestions('studios')).toEqual(['action', 'feel', 'site'])
  })
})

describe('resolvePicker', () => {
  it('maps valid answers to the stored values', () => {
    expect(resolvePicker({ niche: 'venues', action: 'tour', feel: 'night', site: 'river-yoga.com' })).toEqual({
      niche: 'venues',
      action: 'tour',
      theme: 'midnight',
      sourceUrl: 'https://river-yoga.com/',
    })
  })

  it('lets the niche from a door win over a typed answer', () => {
    expect(resolvePicker({ niche: 'coaches', action: 'try' }, 'studios')).toMatchObject({ niche: 'studios', action: 'try' })
  })

  it('reads anything invalid as no answer', () => {
    expect(resolvePicker({ niche: 'bogus', action: 'donate', feel: 'bogus', site: 'http://x.com' })).toEqual({
      niche: null,
      action: null,
      theme: null,
      sourceUrl: null,
    })
    expect(resolvePicker({})).toEqual({ niche: null, action: null, theme: null, sourceUrl: null })
  })

  it('drops an action the niche does not offer, and a feel that does not exist', () => {
    expect(resolvePicker({ niche: 'coaches', action: 'tickets' }).action).toBeNull()
    expect(resolvePicker({ niche: 'coaches', action: 'book', feel: 'nope' }).theme).toBeNull()
    expect(resolvePicker({ niche: 'coaches', action: 'book', feel: 'calm' }).theme).toBe('temple')
    expect(actionsForNiche(null)).toContain('ask')
  })

  it('reads a niche hint from a query value or a cookie', () => {
    expect(nicheFromHint('hosts')).toBe('hosts')
    expect(nicheFromHint(['nonprofits', 'x'])).toBe('nonprofits')
    expect(nicheFromHint('seq-unknown')).toBeNull()
    expect(nicheFromHint(undefined)).toBeNull()
  })
})
