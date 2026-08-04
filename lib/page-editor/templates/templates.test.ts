import { describe, it, expect } from 'vitest'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'

// Every registered marketing template must be renderable by the CURRENT block
// config. A template that composes a retired or unregistered block type fails
// `isRenderable`, and the route silently falls back to the legacy coded page —
// exactly the invisible regression the DAWN 2 conversion existed to close
// (ADR-926). This guard turns that silence into a red test.

describe('regenerated templates are renderable by the current config', () => {
  for (const slug of ['about', 'the-lab', 'pricing', 'home', 'the-community', 'the-quest', 'spaces', 'circles']) {
    it(slug, () => {
      const data = getTemplate(slug)
      expect(data).toBeTruthy()
      expect(isRenderable(data)).toBe(true)
    })
  }
})
