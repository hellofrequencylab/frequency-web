import { beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),eq:vi.fn(),fetch:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{expect(table).toBe('platform_settings');return {select:(columns:string)=>{expect(columns).toBe('value');return {eq:m.eq}},upsert:m.write}}})}))
vi.mock('@/lib/net/pinned-fetch',()=>({fetchPinned:m.fetch}))
import { guidanceWatchDependencies } from './discovery-guidance-store'
beforeEach(()=>{vi.resetAllMocks();m.eq.mockReturnValue({maybeSingle:m.read});m.read.mockResolvedValue({data:null,error:null});m.write.mockResolvedValue({error:null})})
it('uses the existing private text setting and rejects read failures rather than inventing a baseline',async()=>{
 const deps=guidanceWatchDependencies(()=>false)
 expect(await deps.read()).toEqual({version:1,sources:{}})
 expect(m.eq).toHaveBeenCalledWith('key','official_discovery_guidance_watch_v1')
 m.read.mockResolvedValue({data:null,error:{message:'unavailable'}})
 await expect(deps.read()).rejects.toThrow('Guidance state unavailable')
})
it('requests bounded pinned HTTPS content with redirects disabled',async()=>{
 const deps=guidanceWatchDependencies(()=>false)
 await deps.fetch('https://developers.google.com/search/docs/appearance/ai-features')
 expect(m.fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({maxBytes:524288,timeoutMs:8000,maxRedirects:0}))
 const accept=m.fetch.mock.calls[0][1].accept
 expect(accept(200,{'content-type':'text/html'})).toBe(true)
 expect(accept(302,{'content-type':'text/html'})).toBe(false)
 expect(accept(200,{'content-type':'application/json'})).toBe(false)
})
it('does not swallow persistence failure',async()=>{
 m.write.mockResolvedValue({error:{message:'unavailable'}})
 await expect(guidanceWatchDependencies(()=>false).write({version:1,sources:{}})).rejects.toThrow('could not be saved')
})
