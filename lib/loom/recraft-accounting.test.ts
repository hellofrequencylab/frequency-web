import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({reserve:vi.fn(),settle:vi.fn(),hold:vi.fn(),fetch:vi.fn()}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/ai/accounting',()=>({reserveAiAttempt:m.reserve,settleAiAttempt:m.settle,holdAiAttempt:m.hold}))
import {generateImages,vectorizeImage,removeBackground,upscaleImage,createStyle} from './recraft'
const context={feature:'entity-cover',profileId:'profile'}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('RECRAFT_API_KEY','synthetic-test');vi.stubGlobal('fetch',m.fetch);m.reserve.mockResolvedValue('id');m.settle.mockResolvedValue(undefined);m.hold.mockResolvedValue(undefined);m.fetch.mockResolvedValue(new Response(JSON.stringify({data:[{url:'https://example.test/image.png'}],image:{url:'https://example.test/image.svg'},id:'style'}),{status:200}))})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('reserves clamped vector quantity before dispatch and settles before returning',async()=>{
 const results=await generateImages({accounting:context,prompt:'synthetic',lane:'vector',n:8})
 expect(results).toHaveLength(1);expect(m.reserve).toHaveBeenCalledWith(context,'recraft-v3',0.48)
 expect(m.reserve.mock.invocationCallOrder[0]).toBeLessThan(m.fetch.mock.invocationCallOrder[0])
 expect(m.settle).toHaveBeenCalledWith('id',{inputTokens:0,outputTokens:0},0.48)
})
it('denied accounting never reaches the vendor',async()=>{
 m.reserve.mockRejectedValue(new Error('denied'))
 await expect(generateImages({accounting:context,prompt:'synthetic',lane:'raster'})).rejects.toThrow('denied');expect(m.fetch).not.toHaveBeenCalled()
})
it('unknown vendor failure stays held',async()=>{
 m.fetch.mockRejectedValue(new Error('timeout'))
 await expect(vectorizeImage(new Uint8Array([1]),undefined,context)).rejects.toThrow('timeout')
 expect(m.hold).toHaveBeenCalledWith('id','provider_failed');expect(m.settle).not.toHaveBeenCalled()
})
it('settlement failure does not return a generated URL',async()=>{
 m.settle.mockRejectedValue(new Error('ledger offline'))
 await expect(removeBackground(new Uint8Array([1]),undefined,context)).rejects.toThrow('ledger offline')
})
it('utility operations use their own tariffs, not image generation prices',async()=>{
 const bytes=new Uint8Array([1])
 // Every fetch gets a fresh response body.
 m.fetch.mockImplementation(async()=>new Response(JSON.stringify({image:{url:'https://example.test/image.png'},id:'style'})))
 await vectorizeImage(bytes,undefined,context);await removeBackground(bytes,undefined,context)
 await upscaleImage(bytes,undefined,'crisp',context);await createStyle('vector',[bytes],context)
 expect(m.reserve.mock.calls.map(c=>c[2])).toEqual([0.01,0.01,0.004,0.04])
})
