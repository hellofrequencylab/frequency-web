import { beforeEach, expect, it, vi } from 'vitest'
const coach = vi.hoisted(() => vi.fn())
const blockCoach = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai/writing-coach', () => ({ writingCoach: coach }))
vi.mock('@/lib/ai/vera/block-coach', () => ({ coachBlock: blockCoach }))
import { composeMarketingLayout, reseedBlockCopy } from './compose'
import { coachBusinessWriting, reframe } from './reframe/run'
import { WRITING_QUESTIONS } from '@/lib/ai/writing-questions'
beforeEach(() => {
  coach.mockReset(); coach.mockResolvedValue(['Who needs this information?'])
  blockCoach.mockReset()
  blockCoach.mockResolvedValue({ source: 'vera', blockType: 'text', questions: [{ field: 'text', label: 'Text', questionId: 'audience', question: 'Who is this for?' }] })
})
it('legacy layout and reframe cannot generate writable content even when enabled by old callers', async () => {
  expect(await composeMarketingLayout({name:'Human',type:'business'},[],{directions:'rewrite everything'})).toBeNull()
  expect(await reframe({verified:{name:'Human',type:'business'}})).toBeNull()
  expect(coach).not.toHaveBeenCalled()
  expect(blockCoach).not.toHaveBeenCalled()
})
it('block and business helpers expose only separate questions and preserve supplied words', async () => {
  const profile = {name:'Human',type:'business' as const,about:'Exact owner sentences.'}
  const content = {text:'Exact section sentences.'}
  expect(await reseedBlockCopy('text',profile,content,{profileId:'owner',spaceId:'space-a'})).toEqual({questions:['Who is this for?']})
  expect(await coachBusinessWriting({verified:profile,profileId:'owner',directions:'Help clarity'})).toEqual({questions:['Who needs this information?']})
  expect(profile.about).toBe('Exact owner sentences.')
  expect(content.text).toBe('Exact section sentences.')
  expect(blockCoach).toHaveBeenCalledOnce()
  expect(blockCoach.mock.calls[0][0]).toMatchObject({ blockType: 'text', values: content, profileId: 'owner', spaceId: 'space-a' })
  expect(coach.mock.calls.map(([input]) => input.feature)).toEqual(['business-import-reframe'])
  expect(coach.mock.calls.every(([input]) => input.profileId === 'owner')).toBe(true)
})
it('block coaching keeps the fixed writing questions when Vera has no answer', async () => {
  blockCoach.mockResolvedValue({ source: 'fallback', blockType: 'text', questions: [] })
  expect(await reseedBlockCopy('text',{name:'Human',type:'business'},{text:'x'})).toEqual({questions:WRITING_QUESTIONS})
})
