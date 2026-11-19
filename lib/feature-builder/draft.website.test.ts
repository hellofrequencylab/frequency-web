import { describe, expect, it } from 'vitest'
import { NEW_SPACE_THEME } from '@/lib/theme/mega-theme'
import { PREVIEW_KIT_ORDER } from '@/lib/theme/preview-tokens'
import { FEATURES } from './catalog'
import { cleanDraft, missingField, websiteKitFrom } from './draft'

describe('the website and email builders (LIVE-2483)', () => {
  it('keeps a preview kit and falls back to the house default for anything else', () => {
    expect(websiteKitFrom(PREVIEW_KIT_ORDER[0])).toBe(PREVIEW_KIT_ORDER[0])
    expect(websiteKitFrom('not-a-kit')).toBe(NEW_SPACE_THEME)
    expect(websiteKitFrom(undefined)).toBe(NEW_SPACE_THEME)
  })

  it('needs a name and a headline for a website, and from, subject and message for an email', () => {
    expect(missingField('website', cleanDraft('website', { name: 'Sunrise Yoga' }))).toBe('headline')
    expect(missingField('website', cleanDraft('website', { name: 'Sunrise Yoga', headline: 'Yoga at dawn' }))).toBeNull()
    expect(missingField('email', cleanDraft('email', { from: 'Sunrise Yoga', subject: 'Hello' }))).toBe('body')
  })

  it('offers all four builders, and calls only the email draft ready instead of live', () => {
    expect(FEATURES.every((f) => f.open)).toBe(true)
    expect(FEATURES.filter((f) => f.doneWord === 'ready').map((f) => f.id)).toEqual(['email'])
  })
})
