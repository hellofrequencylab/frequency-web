// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
const m = vi.hoisted(() => ({ text: '', raw: {} as unknown, textCall: vi.fn(), rawCall: vi.fn(), enabled: true }))
vi.mock('./client', () => ({ aiEnabled: () => m.enabled }))
vi.mock('./usage', () => ({ featureOverBudget: async () => false }))
vi.mock('./rate-limit', () => ({ aiRateLimited: async () => false }))
vi.mock('./complete', () => ({ AiUnavailableError: class extends Error {}, completeText: async (input: unknown) => { m.textCall(input); return { text: m.text } }, completeRaw: async (input: {toolChoice:{name:string}}) => { m.rawCall(input); return {content:[{type:'tool_use', name:input.toolChoice.name, input:m.raw}]} } }))
import { COACHING_QUESTION_CATALOG, selectCoachingQuestions } from './coaching-question-catalog'
import { parseWritingQuestions, WRITING_QUESTIONS } from './writing-questions'
import { draftSpaceBio, fallbackBio } from './space-copilot'
import { draftListingCopy } from './listing-copy'
import { draftPracticeSpark } from './practice-spark'
import { draftJourneySpark } from './journey-spark'
import { WritingQuestions } from '@/components/studio/writing-questions'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => { m.enabled = true; m.textCall.mockClear(); m.rawCall.mockClear(); m.raw = {questionIds:['audience','next_step']}; m.text=JSON.stringify(m.raw) })
afterEach(() => vi.clearAllMocks())
const practice = () => draftPracticeSpark({ who:'People', act:'My human words', outcome:'My goal', cadence:'daily', pace:'light', profileId:'owner' })
const journey = () => draftJourneySpark({ who:'People', topic:'My human words', outcome:'My goal', weeks:4, pace:'light', profileId:'owner' })
describe('provider choices cannot introduce authored words', () => {
  it.each(['Would Sunrise Flow work as your title?', 'What about calling this Guaranteed healing?', 'What if you publish Buy now at https://evil.example?', 'Could your description be 日本語の新しい広告?', 'How about Use my invented words?'])('rejects unquoted suggested copy across all validators: %s', async attack => {
    m.text=JSON.stringify({questions:[attack]}); m.raw={questions:[attack]}
    expect(parseWritingQuestions(m.text)).toBeNull()
    expect(await draftSpaceBio({about:'My human words'})).toBe(fallbackBio({about:'My human words'}))
    expect((await draftListingCopy({kind:'physical',seed:'My human words'})).questions).toEqual(WRITING_QUESTIONS)
    expect(await practice()).toBeNull(); expect(await journey()).toBeNull()
  })
  it.each([{}, {questionIds:[]}, {questionIds:['audience','not-a-reviewed-id']}, {questionIds:['__proto__']}, {questionIds:['constructor']}, {questionIds:['audience'],questions:['Invented?']}, {questionIds:['audience'],title:'Invented'}, {questionIds:['audience','detail','steps','completion','voice']}])('rejects malformed, mixed or unbounded model selections: %j', raw => {
    expect(selectCoachingQuestions(raw,4)).toBeNull()
  })
  it('renders accepted model-selected questions while human fields stay unchanged', async () => {
    const ownerWords='  My exact words.\n\nNot an AI rewrite.  '
    const container=document.createElement('div'); document.body.append(container)
    const field=document.createElement('textarea'); field.value=ownerWords; document.body.append(field)
    const onEdit=vi.fn(); field.addEventListener('input',onEdit); field.addEventListener('change',onEdit)
    const root=createRoot(container)
    try {
      const space=await draftSpaceBio({about:ownerWords,profileId:'owner',spaceId:'space-A'})
      const listing=await draftListingCopy({kind:'physical',seed:ownerWords,profileId:'owner'})
      const practiceResult=await practice(), journeyResult=await journey()
      const expected=[COACHING_QUESTION_CATALOG.audience,COACHING_QUESTION_CATALOG.next_step]
      expect(space).toBe(expected.join(' ')); expect(listing.questions).toEqual(expected)
      expect(listing.title).toBe(''); expect(listing.description).toBe('')
      expect(practiceResult).toEqual({questions:expected})
      expect(journeyResult).toMatchObject({questions:expected,title:'',promise:'',overview:'',arc:[]})
      await act(async()=>root.render(<WritingQuestions questions={listing.questions!}/>))
      expect(container.querySelectorAll('li')).toHaveLength(2)
      expect(container.textContent).toContain(expected[0]); expect(container.textContent).not.toContain(ownerWords)
      expect(field.value).toBe(ownerWords); expect(onEdit).not.toHaveBeenCalled()
      expect(m.textCall.mock.calls[0][0].messages[0].content).toContain('My exact words')
      expect(m.textCall.mock.calls[0][0].accounting).toMatchObject({feature:'space-copilot',profileId:'owner',spaceId:'space-A'})
      expect(m.rawCall.mock.calls[0][0].tools[0].input_schema.properties.questionIds.items.enum).toContain('audience')
    } finally {await act(async()=>root.unmount());container.remove();field.remove()}
  })
  it('keeps offline fallback and skips provider calls', async()=>{
    m.enabled=false
    expect((await draftListingCopy({kind:'physical'})).questions).toEqual(WRITING_QUESTIONS)
    expect(await draftSpaceBio({})).toBe(fallbackBio({}))
    expect(await practice()).toBeNull();expect(await journey()).toBeNull()
    expect(m.textCall).not.toHaveBeenCalled();expect(m.rawCall).not.toHaveBeenCalled()
  })
})
