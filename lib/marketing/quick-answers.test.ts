import { describe, it, expect } from 'vitest'
import { quickAnswers, quickAnswerLines } from './quick-answers'
import { FOUNDING_PLACE } from '@/lib/site'

const abs = (p: string) => `https://example.test${p}`

describe('quickAnswers', () => {
  const answers = quickAnswers({ ladder: 'Member free, Business $49/mo', abs, memberThemes: ['Default', 'Midnight'] })
  const text = quickAnswerLines(answers).join('\n')

  it('answers what, who, cost, tips, how and where', () => {
    expect(answers.map((a) => a.q)).toEqual([
      'What is Frequency?',
      'Who is Frequency for?',
      'How much does Frequency cost?',
      'Does Frequency take a cut of tips or my own bookings?',
      'How does Frequency work?',
      'Where is Frequency available?',
    ])
  })

  it('uses the owner rulings word for word', () => {
    expect(text).toContain('no platform fee on any plan, plus card processing')
    expect(text).toContain("What's happening (https://example.test/discover/events)")
    expect(text).toContain('Default theme; members can switch to Midnight')
    expect(text).not.toMatch(/What's on\b/)
  })

  it('states place and zone from the canon, and the ladder it was handed', () => {
    expect(text).toContain(FOUNDING_PLACE)
    expect(text).toContain('America/Los_Angeles')
    expect(text).toContain('Member free, Business $49/mo')
  })

  it('carries no em dash and no weekly promise', () => {
    expect(text).not.toContain('—')
    expect(text).not.toMatch(/every week|weekly/i)
  })

  it('drops the theme sentence when a build offers one look', () => {
    const one = quickAnswers({ ladder: 'x', abs, memberThemes: ['Default'] })
    expect(one.map((a) => a.a).join(' ')).not.toContain('Settings, Appearance')
  })
})
