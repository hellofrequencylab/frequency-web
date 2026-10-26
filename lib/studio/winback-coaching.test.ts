import { beforeEach, describe, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({available:vi.fn(),budget:vi.fn(),limited:vi.fn(),complete:vi.fn()}))
vi.mock('@/lib/ai/usage',()=>({aiAvailable:m.available,featureOverBudget:m.budget}))
vi.mock('@/lib/ai/rate-limit',()=>({aiRateLimited:m.limited}))
vi.mock('@/lib/ai/complete',()=>({completeRaw:m.complete}))
vi.mock('@/lib/ai/voice',()=>({withVoice:(s:string)=>s}))
import { coachWinbackReview, deterministicWinback, isOperationalWinbackPayload } from './winback'
beforeEach(()=>{vi.resetAllMocks();m.available.mockResolvedValue(true);m.budget.mockResolvedValue(false);m.limited.mockResolvedValue(false);m.complete.mockResolvedValue({text:JSON.stringify({questions:['What useful reason does someone have to return?','How will you check current consent?']})})})
describe('ephemeral operator winback coaching',()=>{
 it('returns questions with attributed accounting and no recipient evidence',async()=>{
  const result=await coachWinbackReview('operator-A')
  expect(result.source).toBe('coach')
  const call=m.complete.mock.calls[0][0]
  expect(call.accounting).toEqual({feature:'studio-winback',profileId:'operator-A'})
  expect(call.messages[0].content).toContain('No individual recipient evidence')
  expect(call.messages[0].content).not.toMatch(/email:|profileId:|Member.s first name:/)
  expect(result).not.toHaveProperty('subject');expect(result).not.toHaveProperty('body')
 })
 it('keeps the operational template separate and rejects model-copy responses',async()=>{
  const draft=deterministicWinback('Ada')
  m.complete.mockResolvedValue({text:JSON.stringify({subject:'MODEL SUBJECT',body:'MODEL BODY',questions:['What do you think?']})})
  const result=await coachWinbackReview('operator-A')
  expect(result.source).toBe('checklist')
  expect(JSON.stringify(result)).not.toContain('MODEL')
  expect(deterministicWinback('Ada')).toEqual(draft)
 })
 it('uses the checklist without spending through switches, budgets or throttling',async()=>{
  m.available.mockResolvedValue(false);expect((await coachWinbackReview('operator-A')).source).toBe('checklist')
  m.available.mockResolvedValue(true);m.budget.mockResolvedValue(true);expect((await coachWinbackReview('operator-A')).source).toBe('checklist')
  m.budget.mockResolvedValue(false);m.limited.mockResolvedValue(true);expect((await coachWinbackReview('operator-A')).source).toBe('checklist')
  expect(m.limited).toHaveBeenCalledWith('studio-winback','operator-A')
  expect(m.complete).not.toHaveBeenCalled()
 })
 it('fails soft on provider failure and rejects unapproved payload provenance',async()=>{
  m.complete.mockRejectedValue(Error('provider unavailable'))
  expect((await coachWinbackReview('operator-A')).source).toBe('checklist')
  const draft=deterministicWinback('Ada')
  expect(isOperationalWinbackPayload({...draft,templateName:'Ada',copySource:'operational_winback_v1'})).toBe(true)
  expect(isOperationalWinbackPayload({...draft,templateName:'Ada'})).toBe(false)
  expect(isOperationalWinbackPayload({...draft,templateName:'Ada',copySource:'operational_winback_v1',body:'MODEL BODY'})).toBe(false)
 })
})
