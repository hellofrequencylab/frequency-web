import { describe, expect, it } from 'vitest'
import { NEW_WORLD_SECTIONS_CSS } from '@/components/sites/new-world-sections-css'

// A Space page wraps every block in the page rhythm (py-8 sm:py-10). New World's sections pad themselves and run flush, so the
// sheet zeroes the wrapper, or a published site shows an ink band under the menu and gaps between the sections.
describe('the New World section sheet', () => {
  it('zeroes the page rhythm around its own sections, inside the New World scope only', () => {
    expect(NEW_WORLD_SECTIONS_CSS).toContain('[data-house-theme="new-world"] [data-mw-own]>div{padding-block:0}')
    expect(NEW_WORLD_SECTIONS_CSS).toContain('[data-house-theme="new-world"] [data-mw-own]>div>*{margin-block:0}')
    expect(NEW_WORLD_SECTIONS_CSS).not.toMatch(/(^|\n)\s*\[data-mw-own\]/)
  })
})
