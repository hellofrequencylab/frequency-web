import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({staff:vi.fn(),allowed:vi.fn(),complete:vi.fn(),db:vi.fn(),update:vi.fn(),execute:vi.fn()}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/staff',()=>({getStaffMember:m.staff,staffCanNow:m.allowed}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.db}))
vi.mock('@/lib/studio/agent',()=>({proposeWinbacks:vi.fn(),executeAction:m.execute}))
vi.mock('@/lib/marketing/content',()=>({proposeContentDrafts:vi.fn()}))
vi.mock('@/lib/ai/usage',()=>({aiAvailable:async()=>true,featureOverBudget:async()=>false}))
vi.mock('@/lib/ai/rate-limit',()=>({aiRateLimited:async()=>false}))
vi.mock('@/lib/ai/complete',()=>({completeRaw:m.complete}))
vi.mock('@/lib/ai/voice',()=>({withVoice:(s:string)=>s}))
import { reviewWinbackCoaching, approveAction } from './actions'
beforeEach(()=>{vi.resetAllMocks();m.staff.mockResolvedValue({profileId:'operator-A'});m.allowed.mockResolvedValue(true);m.complete.mockResolvedValue({text:'{"questionIds":["consent"]}'})})
it('requires current marketing permission and never persists coaching',async()=>{
 m.allowed.mockResolvedValue(false);expect(await reviewWinbackCoaching()).toBeNull();expect(m.complete).not.toHaveBeenCalled()
 m.allowed.mockResolvedValue(true);expect((await reviewWinbackCoaching())?.source).toBe('coach')
 expect(m.complete.mock.calls[0][0].accounting.profileId).toBe('operator-A')
 expect(m.db).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled()
})
it('blocks legacy/unattributed copy before changing approval state',async()=>{
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{kind:'email_contact',payload:{subject:'MODEL SUBJECT',body:'MODEL BODY'}},error:null}),update:m.update}
 m.db.mockReturnValue({from:()=>q})
 await expect(approveAction('legacy')).rejects.toThrow('needs a new human-reviewed')
 expect(m.update).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled()
})
