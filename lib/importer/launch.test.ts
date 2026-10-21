import { describe, it, expect } from 'vitest'
import { LAUNCH_QUESTIONS, launchAnswersToInputs, launchReady } from './launch'

describe('the owner launch questions', () => {
  it('asks the name first and only the name is required', () => {
    expect(LAUNCH_QUESTIONS[0].id).toBe('name')
    expect(LAUNCH_QUESTIONS.filter((q) => q.required).map((q) => q.id)).toEqual(['name'])
  })

  it('writes in the house voice: no em or en dashes in any prompt', () => {
    const text = JSON.stringify(LAUNCH_QUESTIONS)
    expect(text).not.toMatch(/[–—]/)
  })
})

const links = (raw?: string) => {
  const i = launchAnswersToInputs({ name: 'X', links: raw })
  return { ...(i.websiteUrl ? { websiteUrl: i.websiteUrl } : {}), ...(i.socialHandles?.instagram ? { instagram: i.socialHandles.instagram } : {}) }
}

describe('the links answer', () => {
  it('reads a bare domain, a full url, an @handle and an instagram url', () => {
    expect(links('riveryoga.com')).toEqual({ websiteUrl: 'https://riveryoga.com' })
    expect(links('https://riveryoga.com/about')).toEqual({ websiteUrl: 'https://riveryoga.com/about' })
    expect(links('@river.yoga')).toEqual({ instagram: 'river.yoga' })
    expect(links('https://instagram.com/river.yoga/')).toEqual({ instagram: 'river.yoga' })
  })
  it('ignores blanks and things that are not a link', () => {
    expect(links('')).toEqual({})
    expect(links(undefined)).toEqual({})
    expect(links('call me')).toEqual({})
  })
})

describe('launchAnswersToInputs', () => {
  it('needs only a name', () => {
    expect(launchReady({})).toBe(false)
    expect(launchReady({ name: '  ' })).toBe(false)
    expect(launchReady({ name: 'River Yoga' })).toBe(true)
  })

  it('folds the answers into labeled sections, the same labels the staff form uses', () => {
    const inputs = launchAnswersToInputs({
      name: 'River Yoga',
      what: 'Small group yoga.',
      different: 'Eight people at most.',
      offer: 'Drop-in, $20',
      where: 'Encinitas, CA. Tue to Sat.',
      links: '@riveryoga',
      mood: 'calm',
    })
    expect(inputs.pastedContent).toContain('## Overview\nSmall group yoga.')
    expect(inputs.pastedContent).toContain('## What makes them different\nEight people at most.')
    expect(inputs.pastedContent).toContain('## Booking and schedule\nDrop-in, $20')
    expect(inputs.hints).toEqual({ type: 'business', name: 'River Yoga', city: 'Encinitas, CA' })
    expect(inputs.socialHandles).toEqual({ instagram: 'riveryoga' })
    expect(inputs.mood).toBe('calm')
  })

  it('is the owner\'s own launch, never a staff demo', () => {
    expect(launchAnswersToInputs({ name: 'A' }).consent).toEqual({ isDemo: false, ownerConfirmed: true })
  })

  it('drops an unknown mood and skipped answers instead of inventing them', () => {
    const inputs = launchAnswersToInputs({ name: 'A', mood: 'shouty', what: '   ' })
    expect(inputs.mood).toBeUndefined()
    expect(inputs.pastedContent).toBeUndefined()
  })
})
