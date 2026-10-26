import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({limited:true,throttle:vi.fn(),complete:vi.fn()}))
vi.mock('@/lib/ai/client',()=>({aiEnabled:()=>true}))
vi.mock('@/lib/ai/usage',()=>({featureOverBudget:async()=>false}))
vi.mock('@/lib/ai/rate-limit',()=>({aiRateLimited:async(feature:string,profileId?:string|null)=>{state.throttle(feature,profileId);return state.limited}}))
vi.mock('@/lib/ai/complete',()=>({completeText:async(input:unknown)=>{state.complete(input);return{text:'{"questionIds":["detail"]}'}}}))
import { reseedBlockCopy } from './compose'
import { coachBusinessWriting } from './reframe/run'
import { WRITING_QUESTIONS } from '@/lib/ai/writing-questions'
beforeEach(()=>{state.limited=true;state.throttle.mockClear();state.complete.mockClear()})
it('both importer coaching paths throttle the actor at the shared seam and never spend when limited',async()=>{
 const profile={name:'Human words',type:'business' as const}
 expect(await reseedBlockCopy('text',profile,{text:'Human paragraph'},{profileId:'operator-a'})).toEqual({questions:WRITING_QUESTIONS})
 expect(await coachBusinessWriting({verified:profile,profileId:'operator-a'})).toEqual({questions:WRITING_QUESTIONS})
 expect(state.throttle.mock.calls).toEqual([['seed-compose','operator-a'],['business-import-reframe','operator-a']])
 expect(state.complete).not.toHaveBeenCalled()
})
it('allowed guidance retains the same attributed features without a second actor throttle',async()=>{
 state.limited=false
 await coachBusinessWriting({verified:{name:'Human words',type:'business'},profileId:'operator-a'})
 expect(state.throttle).toHaveBeenCalledExactlyOnceWith('business-import-reframe','operator-a')
 expect(state.complete).toHaveBeenCalledOnce()
 expect(state.complete.mock.calls[0][0]).toMatchObject({accounting:{feature:'business-import-reframe',profileId:'operator-a'}})
})
