import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('@/components/practice/log-practice-button',()=>({LogPracticeButton:()=>null}))
import { JourneyBoard } from './journey-board'
import type { PillarCount } from '@/lib/pillars'
const coverage: PillarCount[]=[{slug:'mind',name:'Mind',count:1},{slug:'body',name:'Body',count:1},{slug:'spirit',name:'Spirit',count:1},{slug:'expression',name:'Expression',count:1}]

describe('feed support counts name the adoption unit',()=>{
 it('shows overlapping current supports as adoption counts, not a wellbeing score or practiced days',()=>{
  const html=renderToStaticMarkup(<JourneyBoard practices={[]} pillarBalance={coverage} stageIndex={99}/>)
  expect(html).toContain('Adopted practice supports')
  expect(html).toContain('Areas can overlap. These are adopted practices, not days practiced.')
  expect(html).not.toContain('Your pillars')
  expect(html).not.toContain('4 adopted practices')
  expect(html).toContain('Mind')
  expect(html).toContain('Expression')
 })
 it('keeps existing progressive disclosure without changing support counts into a new onboarding gate',()=>{
  const html=renderToStaticMarkup(<JourneyBoard practices={[]} pillarBalance={coverage} stageIndex={0}/>)
  expect(html).not.toContain('Adopted practice supports')
 })
})
