import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({rpc:vi.fn(),error:vi.fn()}))
vi.mock('@/lib/platform-flags',()=>({aiEnabledFlag:async()=>true,listFlagEvents:async()=>[]}))
vi.mock('@/lib/ai/client',()=>({aiEnabled:()=>true}))
vi.mock('@/lib/log',()=>({log:{error:m.error}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc,from:()=>({select:async()=>({count:10})})})}))
import {getAiControlsData} from './load-ai'
beforeEach(()=>vi.resetAllMocks())
it('unavailable accounting is not displayed as zero spending',async()=>{
 m.rpc.mockResolvedValue({data:null,error:{message:'offline'}})
 const result=await getAiControlsData();expect(result.accountingAvailable).toBe(false);expect(result.totalSpend).toBeNull();expect(result.rows).toEqual([]);expect(m.error).toHaveBeenCalled()
})
it('operator snapshot separates actual usage, reserved work and uncertain spend',async()=>{
 m.rpc.mockResolvedValue({data:[{feature:'vera-chat',spent:'1.2',reserved:'0.3',uncertain:'0.4',pending_ids:['attempt']}],error:null})
 const result=await getAiControlsData();expect(result.accountingAvailable).toBe(true);expect(result.totalSpend).toBe(1.2);expect(result.rows.find(r=>r.feature==='vera-chat')).toMatchObject({spent:1.2,reserved:0.3,uncertain:0.4,pendingIds:['attempt']})
})
it('non-finite accounting values are unavailable rather than healthy',async()=>{
 m.rpc.mockResolvedValue({data:[{feature:'vera-chat',spent:'NaN',reserved:0,uncertain:0}],error:null})
 expect((await getAiControlsData()).accountingAvailable).toBe(false)
})
