import { describe, it, expect } from 'vitest'
import { buildVeraOpening, buildWelcomeSlides } from './vera-welcome'

describe('buildVeraOpening', () => {
  it('continues from the member intent rather than asking cold', () => {
    const o = buildVeraOpening({ firstName: 'Mara', intent: 'meet people who run trails', interests: null, location: null })
    expect(o.message).toContain('Mara')
    expect(o.message).toContain('meet people who run trails')
    // It must NOT open with the cold "what brought you here" greeting.
    expect(o.message.toLowerCase()).not.toContain('what brought you here')
    expect(o.stage).toBe('orient')
    expect(o.suggestions.length).toBeGreaterThan(0)
  })

  it('falls back to interests when there is no stated intent', () => {
    const o = buildVeraOpening({ firstName: 'Sam', intent: null, interests: 'vinyl, cold plunges', location: null })
    expect(o.message).toContain('vinyl, cold plunges')
  })

  it('still greets warmly with neither intent nor interests', () => {
    const o = buildVeraOpening({ firstName: null, intent: null, interests: null, location: null })
    expect(o.message).toContain('Welcome in')
    expect(o.message).toContain('circle')
  })

  it('sanitizes wrapping quotes and trailing periods from intent', () => {
    const o = buildVeraOpening({ firstName: 'Lee', intent: '"a running club."', interests: null, location: null })
    // No doubled quotes or stray trailing period inside the quoted phrase.
    expect(o.message).toContain('"a running club."')
    expect(o.message).not.toContain('""')
  })
})

describe('buildWelcomeSlides', () => {
  it('reflects the member intent on the first slide and stays a 2-slide deck', () => {
    const slides = buildWelcomeSlides({ firstName: 'Mara', intent: 'find a running club', interests: null, location: null })
    expect(slides).toHaveLength(2)
    expect(slides[0].title).toContain('Mara')
    expect(slides[0].body).toContain('find a running club')
    expect(slides[1].title.toLowerCase()).toContain('circle')
  })

  it('degrades gracefully with no context', () => {
    const slides = buildWelcomeSlides({ firstName: null, intent: null, interests: null, location: null })
    expect(slides).toHaveLength(2)
    expect(slides[0].title.length).toBeGreaterThan(0)
  })
})
