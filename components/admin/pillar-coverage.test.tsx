import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PillarBalance } from './pillar-balance'
import type { BalancePractice } from '@/lib/quest/pillar-balance'
const render=(practices:BalancePractice[])=>renderToStaticMarkup(<PillarBalance practices={practices}/> )

describe('author reward values are descriptive bookkeeping',()=>{
  it('shows unequal per-log values without a deficient-area or equalization warning',()=>{
    const html=render([{pillar:'mind',weightClass:null,rewardZaps:10},{pillar:'body',weightClass:null,rewardZaps:3}])
    expect(html).toContain('Practice reward values')
    expect(html).toContain('per log')
    expect(html).toContain('primary Pillar')
    expect(html).toContain('>10</dd>')
    expect(html).toContain('>3</dd>')
    expect(html).not.toMatch(/same daily Zaps|Balance the Pillars|is light|are light|role="status"/)
  })
  it('does not praise equal totals as a personal or program ideal',()=>{
    const html=render(['mind','body','spirit','expression'].map(pillar=>({pillar,weightClass:'standard'})) as BalancePractice[])
    expect(html).not.toContain('Balanced.')
    expect(html).not.toContain('text-success')
    expect(html).toContain('not daily targets')
    expect(html).toContain('equal totals are not required')
  })
  it('keeps the empty view informational without four compulsory categories',()=>{
    const html=render([])
    expect(html).toContain('No categorized reward values yet')
    expect(html).not.toContain('across the four Pillars')
  })
})
