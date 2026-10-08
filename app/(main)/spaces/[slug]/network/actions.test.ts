import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({profile:vi.fn(),visible:vi.fn(),window:vi.fn()}))
vi.mock('@/lib/auth',()=>({getMyProfileId:mocks.profile}))
vi.mock('@/lib/spaces/store',()=>({getVisibleSpaceBySlug:mocks.visible}))
vi.mock('@/lib/collective/network-store',()=>({loadCollectiveNetworkWindow:mocks.window}))
const {loadCollectiveNetworkMonth}=await import('./actions')
const parent={id:'parent',slug:'network',name:'Parent',status:'active',plan:'collective',networkConnected:true,ownerProfileId:'owner'}
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue(null);mocks.visible.mockResolvedValue(parent);mocks.window.mockResolvedValue([{slug:'public-event'}])})
it('resolves the parent for the current caller on every month request and delegates fresh child eligibility',async()=>{
  expect(await loadCollectiveNetworkMonth('network',2026,10)).toEqual([{slug:'public-event'}])
  expect(mocks.visible).toHaveBeenCalledWith('network',null)
  expect(mocks.window).toHaveBeenCalledWith(parent,'Parent',expect.any(String),expect.any(String))
  mocks.visible.mockResolvedValue(null)
  expect(await loadCollectiveNetworkMonth('network',2026,11)).toEqual([])
  expect(mocks.visible).toHaveBeenCalledTimes(2)
  expect(mocks.window).toHaveBeenCalledTimes(1)
})
it('invalid months, hidden parents and downgraded Collectives cannot trigger a feed read',async()=>{
  expect(await loadCollectiveNetworkMonth('network',2026,13)).toEqual([])
  expect(mocks.visible).not.toHaveBeenCalled()
  mocks.visible.mockResolvedValue({...parent,plan:'business'})
  expect(await loadCollectiveNetworkMonth('network',2026,10)).toEqual([])
  expect(mocks.window).not.toHaveBeenCalled()
})
it('propagates data failure rather than representing it as an empty successful calendar',async()=>{
  mocks.window.mockRejectedValue(new Error('directory unavailable'))
  await expect(loadCollectiveNetworkMonth('network',2026,10)).rejects.toThrow('directory unavailable')
})
