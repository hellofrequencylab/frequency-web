import { describe, it, expect } from 'vitest'
import { quickAnswers, quickAnswerLines, homeFaq } from './quick-answers'
import { FOUNDING_PLACE } from '@/lib/site'

const abs = (p: string) => `https://example.test${p}`

describe('quickAnswers', () => {
  const answers = quickAnswers({ ladder: 'Member free, see /pricing for current rates', abs, memberThemes: ['Default', 'Bold'] })
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
    expect(text).toContain('Tips have no platform fee on any plan, though card processing still applies.')
    expect(text).toContain("What's happening (https://example.test/discover/events)")
    expect(text).toContain('Members can change themes in Settings, Appearance.')
    expect(text).not.toMatch(/Midnight|100% of the bookings|paid tickets and memberships open at Business|Free Spaces use the fee-only selling rate|—/i)
    expect(text).not.toMatch(/What's on\b/)
  })

  it('states place and zone from the canon, and the ladder it was handed', () => {
    expect(text).toContain(FOUNDING_PLACE)
    expect(text).toContain('America/Los_Angeles')
    expect(text).toContain('Member free, see /pricing for current rates')
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

describe('homeFaq', () => {
  it('is the quick answers with site-relative links and no priced ladder', () => {
    const text = quickAnswerLines(homeFaq()).join('\n')
    expect(text).toContain('(/discover/events)')
    expect(text).not.toContain('The ladder:')
    expect(text).not.toContain('—')
  })
})
