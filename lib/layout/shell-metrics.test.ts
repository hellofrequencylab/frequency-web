import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SHELL_ROW_CLASS, SHELL_ROW_GAP_CLASS, LEFT_RAIL_CLASS, RIGHT_RAIL_CLASS, RIGHT_RAIL_ML_CLASS, RAIL_STRIP_CLASS } from './shell-metrics'

const css = readFileSync('app/themes/frequency/members-shell.css', 'utf8')
const claim = readFileSync('app/spaces/claim/[token]/claim-layout.module.css', 'utf8')
const page = readFileSync('app/spaces/claim/[token]/page.tsx', 'utf8')

describe('claim preview follows the active Frequency shell', () => {
  it('pins the actual rail widths, gap, cap and automatic breakpoints', () => {
    for (const value of ['--fqm-l:248px', '--fqm-r:288px', 'gap:56px', 'max-width:860px', 'max-width:1239px', 'max-width:959px', 'max-width:767px', '--fqm-lw:76px', '--fqm-rw:76px']) expect(css).toContain(value)
    expect(css).toContain('padding:24px 40px 0')
    expect(css).toContain('@media (min-width: 1001px)')
    expect(css).toContain('.fqm-center { max-width: 1040px }')
    const core = readFileSync('app/themes/frequency/core.css', 'utf8')
    expect(core).toContain('--fq-gutter-mobile:18px')
    expect(core).toContain('--fq-gutter-desktop:40px')
  })
  it('reserves the two rails and two gutters in pixels at every breakpoint', () => {
    for (const [breakpoint, left, right] of [[768, 76, 76], [960, 248, 76], [1240, 248, 288]]) {
      expect(claim).toContain(`min-width: ${breakpoint}px`)
      expect(claim).toContain(`calc(100% - ${left + right + 2 * 56}px)`)
    }
    expect(claim).toContain('max-width: 860px')
    expect(claim).toContain('min-width: 1001px')
    expect(claim).toContain('min(1040px, calc(100% - 436px))')
    expect(claim).toContain('min(1040px, calc(100% - 648px))')
    expect(claim).not.toContain('rem')
  })
  it('uses the same row and column for ribbon, body and both bar copies', () => {
    expect(page).toContain("import styles from './claim-layout.module.css'")
    expect(page).toContain('const CLAIM_ROW = styles.row')
    expect(page).toContain('const CLAIM_COLUMN = styles.column')
    expect(page.match(/className=\{CLAIM_ROW\}/g)).toHaveLength(4)
    expect(page.match(/CLAIM_COLUMN/g)).toHaveLength(4)
    expect(page).not.toContain('px-safe') // row owns safe-area padding exactly once
    expect(page).not.toContain("from '@/lib/layout/shell-metrics'")
  })
})

describe('independent mega-menu geometry remains stable', () => {
  it('preserves the live menu exports rather than inheriting claim geometry', () => {
    expect([SHELL_ROW_CLASS, SHELL_ROW_GAP_CLASS, LEFT_RAIL_CLASS, RIGHT_RAIL_CLASS, RIGHT_RAIL_ML_CLASS, RAIL_STRIP_CLASS]).toEqual([
      'mx-auto w-full max-w-[105rem] px-4 sm:px-6 lg:px-8', 'gap-8 lg:gap-10', 'w-48', 'w-72', 'lg:ml-3', 'w-14',
    ])
  })
})
