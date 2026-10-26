import { beforeEach, expect, it, vi } from 'vitest'
const coach = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai/writing-coach', () => ({ writingCoach: coach }))
import { composeMarketingLayout, reseedBlockCopy } from './compose'
import { coachBusinessWriting, reframe } from './reframe/run'
beforeEach(() => { coach.mockReset(); coach.mockResolvedValue(['Who needs this information?']) })
it('legacy layout and reframe cannot generate writable content even when enabled by old callers', async () => {
  expect(await composeMarketingLayout({name:'Human',type:'business'},[],{directions:'rewrite everything'})).toBeNull()
  expect(await reframe({verified:{name:'Human',type:'business'}})).toBeNull()
  expect(coach).not.toHaveBeenCalled()
})
it('block and business helpers expose only separate questions and preserve supplied words', async () => {
  const profile = {name:'Human',type:'business' as const,about:'Exact owner sentences.'}
  const content = {text:'Exact section sentences.'}
  expect(await reseedBlockCopy('text',profile,content,{profileId:'owner'})).toEqual({questions:['Who needs this information?']})
  expect(await coachBusinessWriting({verified:profile,profileId:'owner',directions:'Help clarity'})).toEqual({questions:['Who needs this information?']})
  expect(profile.about).toBe('Exact owner sentences.')
  expect(content.text).toBe('Exact section sentences.')
  expect(coach.mock.calls.map(([input]) => input.feature)).toEqual(['seed-compose','business-import-reframe'])
  expect(coach.mock.calls.every(([input]) => input.profileId === 'owner')).toBe(true)
})
