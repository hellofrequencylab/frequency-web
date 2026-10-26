import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUIDE_DATES, GUIDE_LAST_MODIFIED, type GuideSlug } from './guide-dates'

const constIn = (src: string, name: string) => new RegExp(`const ${name} = '(\\d{4}-\\d{2}-\\d{2})'`).exec(src)?.[1]

describe('guide dates', () => {
  for (const slug of Object.keys(GUIDE_DATES) as GuideSlug[]) {
    it(`${slug}: the sitemap date is the page's own PUBLISHED and UPDATED`, () => {
      const src = readFileSync(`app/(marketing)/${slug}/page.tsx`, 'utf8')
      expect(constIn(src, 'PUBLISHED')).toBe(GUIDE_DATES[slug].published)
      expect(constIn(src, 'UPDATED')).toBe(GUIDE_DATES[slug].updated)
      expect(GUIDE_LAST_MODIFIED[slug].toISOString().slice(0, 10)).toBe(GUIDE_DATES[slug].updated)
    })
  }
})
