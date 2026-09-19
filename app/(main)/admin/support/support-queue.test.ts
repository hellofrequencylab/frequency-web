import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'

// SCAN-639: the support queue is the first Index/Queue to consume the kit FilterBar.
// A local chip row with the same URL keys is the defect the row named.

describe('support queue FilterBar', () => {
  const raw = readFileSync('app/(main)/admin/support/page.tsx', 'utf8')
  const page = sourceWithoutComments('app/(main)/admin/support/page.tsx', { imports: true })

  it('imports the kit FilterBar', () => {
    expect(raw).toContain("from '@/components/admin/filter-bar'")
    expect(page).toContain('<FilterBar')
  })

  it('does not keep the hand-rolled status chip row', () => {
    expect(page).not.toMatch(/rounded-pill px-3 py-1 text-meta font-semibold/)
    expect(page).not.toContain('aria-current={active')
  })

  it('still reads status, type, and q on the server', () => {
    expect(page).toContain('parseStatus')
    expect(page).toContain('parseType')
    expect(page).toContain('search="q"')
  })
})

describe('page-contents does not export a second FilterBar', () => {
  const src = sourceWithoutComments('components/templates/page-contents.tsx')

  it('renames the local category-chip bar', () => {
    expect(src).not.toMatch(/function FilterBar/)
    expect(src).toContain('function LinkChipBar')
  })
})
