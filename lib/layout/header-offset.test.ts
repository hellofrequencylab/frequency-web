import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { reDerivesHeaderHeight, APP_HEADER_H } from './header-offset'

// LIVE-492. The header's height is a token; a hand-written copy of it is the defect.
const CONSUMERS = [
  'components/layout/app-shell.tsx',
  'components/layout/admin-bar/admin-bar.tsx',
  'app/(main)/admin/layout.tsx',
  'components/admin/admin-rail-drawer-column.tsx',
]

describe('the app header has one height (LIVE-492)', () => {
  it('catches a hand-written offset', () => {
    expect(reDerivesHeaderHeight('className="sticky top-[calc(3.5rem+env(safe-area-inset-top))]"')).toBe(true)
    expect(reDerivesHeaderHeight('className="min-h-[calc(100vh-3.5rem)]"')).toBe(true)
    expect(reDerivesHeaderHeight('className="max-h-[calc(100vh-4.5rem)]"')).toBe(true)
  })

  it('passes the token itself', () => {
    expect(reDerivesHeaderHeight(`className="top-[${APP_HEADER_H}]"`)).toBe(false)
    expect(reDerivesHeaderHeight(`className="min-h-[calc(100dvh-${APP_HEADER_H})]"`)).toBe(false)
  })

  it('ignores a comment that merely EXPLAINS the old geometry', () => {
    // Every file below documents the bug it fixes, quoting the offset that used to be there.
    // A guard that fired on its own explanation would force the explanation out.
    expect(reDerivesHeaderHeight('// was calc(3.5rem + env(safe-area-inset-top)), which dropped the inset')).toBe(false)
    expect(reDerivesHeaderHeight('/* min-h-[calc(100vh-3.5rem)] compounded with the root */')).toBe(false)
  })

  it.each(CONSUMERS)('%s measures the header off the token, not by hand', (file) => {
    expect(reDerivesHeaderHeight(readFileSync(file, 'utf8'))).toBe(false)
  })

  it('keeps header + content at exactly one viewport in the shell', () => {
    const shell = readFileSync('components/layout/app-shell.tsx', 'utf8')
    // The root measures in dvh; the content row must measure in the SAME unit off the SAME token,
    // or the two disagree about what a viewport is while a mobile toolbar animates.
    expect(shell).toContain('min-h-dvh')
    expect(shell).toContain(`min-h-[calc(100dvh-${APP_HEADER_H})]`)
    expect(shell).not.toContain('min-h-[calc(100vh-3.5rem)]')
  })
})
