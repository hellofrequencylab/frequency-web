import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({rpc:vi.fn(),insert:vi.fn(),error:vi.fn(), page:vi.fn()}))
vi.mock('./client',()=>({aiEnabled:()=>true}))
vi.mock('@/lib/log',()=>({log:{error:m.error}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc,from:()=>({insert:m.insert,select:()=>({gte:()=>({order:()=>({range:m.page})})})})})}))
import { featureOverBudget, recordAiUsage } from './usage'
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:0,error:null})})
it('read outage pauses paid work, including failed fallback pages',async()=>{
 m.rpc.mockResolvedValue({data:null,error:{message:'offline'}});m.page.mockResolvedValue({data:null,error:{message:'offline'}})
 expect(await featureOverBudget('vera-chat')).toBe(true);expect(m.error).toHaveBeenCalled()
})
it('malformed spend cannot masquerade as unused budget',async()=>{
 for(const bad of [NaN,Infinity,-1]){m.rpc.mockResolvedValue({data:bad,error:null});expect(await featureOverBudget('vera-chat')).toBe(true)}
})
it('Space-scoped calls also enforce the aggregate feature ceiling',async()=>{
 m.rpc.mockResolvedValueOnce({data:4,error:null}).mockResolvedValueOnce({data:2,error:null})
 expect(await featureOverBudget('space-copilot','space')).toBe(true)
 expect(m.rpc).toHaveBeenNthCalledWith(2,'ai_spend_today',{p_feature:'space-copilot',p_space:null})
})
it('at the global cap already pauses new paid work',async()=>{
 m.rpc.mockResolvedValue({data:25,error:null});expect(await featureOverBudget('vera-chat')).toBe(true)
})
it('legacy zero-cost ledger writes observe returned database errors',async()=>{
 m.insert.mockResolvedValue({error:{message:'offline'}})
 await expect(recordAiUsage({feature:'room-search',model:'gte-small',usage:{inputTokens:0,outputTokens:0},costUsd:0})).rejects.toEqual({message:'offline'})
 expect(m.error).toHaveBeenCalledWith('ai.accounting.legacy_write_failed',{feature:'room-search'})
})
