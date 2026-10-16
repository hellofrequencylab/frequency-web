import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
const mocks=vi.hoisted(()=>({caller:vi.fn(),parent:vi.fn(),members:vi.fn(),events:vi.fn(),hero:vi.fn(),tools:vi.fn()}))
vi.mock('@/lib/layout/index-hero',()=>({resolveIndexHero:mocks.hero}))
vi.mock('@/lib/auth',()=>({getCallerProfile:mocks.caller}))
vi.mock('@/lib/spaces/store',()=>({getVisibleSpaceBySlug:mocks.parent}))
vi.mock('@/lib/spaces/profile-metadata',()=>({spaceProfileMetadata:vi.fn()}))
vi.mock('@/lib/collective/network-store',()=>({listPublicCollectiveMembers:mocks.members,loadCollectiveNetworkWindow:mocks.events}))
vi.mock('@/lib/collective/network-tools-store',()=>({networkToolsAccess:mocks.tools}))
vi.mock('./actions',()=>({loadCollectiveNetworkMonth:vi.fn()}))
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NOT_FOUND')}}))
vi.mock('@/components/templates',()=>({IndexTemplate:({children,action,heroOverlay}:{children:ReactNode;action?:ReactNode;heroOverlay?:boolean})=><main data-hero={heroOverlay}>{action}{children}</main>}))
vi.mock('@/components/events/event-calendar',()=>({EventCalendar:()=> <div>Calendar</div>}))
vi.mock('@/components/spaces/brand-anchor',()=>({BrandAnchor:()=> null}))
const {default:Page}=await import('./page')
const parent={id:'parent',slug:'network',name:'Parent',status:'active',plan:'collective',networkConnected:true,ownerProfileId:'owner',timeZone:'America/Los_Angeles'}
beforeEach(()=>{vi.clearAllMocks();mocks.hero.mockResolvedValue({heroOverlay:true});mocks.caller.mockResolvedValue(null);mocks.parent.mockResolvedValue(parent);mocks.members.mockResolvedValue([{id:'child',slug:'child',name:'Public child',logoUrl:null}]);mocks.events.mockResolvedValue([])})
it('renders the public directory/calendar for a visitor without owner controls',async()=>{
  const markup=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'network'})}))
  expect(markup).toContain('/spaces/child')
  expect(markup).toContain('Shared calendar')
  expect(markup).toContain('data-hero="true"')
  expect(mocks.hero).toHaveBeenCalledWith('/spaces/network/network')
  expect(markup).not.toContain('Manage member Spaces')
  expect(mocks.parent).toHaveBeenCalledWith('network',null)
})
it('links owners to separate management without broadening the public member projection',async()=>{
  mocks.caller.mockResolvedValue({id:'owner'})
  const markup=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'network'})}))
  expect(markup).toContain('/spaces/network/settings/billing')
  expect(markup).toContain('Manage member Spaces')
  expect(mocks.members).toHaveBeenCalledWith(parent)
})
it('does not read either public feed when the parent is invisible or no longer Collective',async()=>{
  for(const value of [null,{...parent,plan:'business'}]){
    mocks.parent.mockResolvedValue(value)
    await expect(Page({params:Promise.resolve({slug:'network'})})).rejects.toThrow('NOT_FOUND')
  }
  expect(mocks.members).not.toHaveBeenCalled()
  expect(mocks.events).not.toHaveBeenCalled()
})
it('sends a Network owner or central admin to the Chapters area, and nobody else (SCAN-983)',async()=>{
  mocks.parent.mockResolvedValue({...parent,plan:'network'})
  mocks.caller.mockResolvedValue({id:'central'})
  mocks.tools.mockResolvedValue({parent:{id:'parent'},isOwner:false})
  let markup=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'network'})}))
  expect(markup).toContain('/spaces/network/settings/chapters')
  expect(mocks.tools).toHaveBeenCalledWith('parent','central')
  mocks.caller.mockResolvedValue({id:'leader'})
  mocks.tools.mockResolvedValue(null)
  markup=renderToStaticMarkup(await Page({params:Promise.resolve({slug:'network'})}))
  expect(markup).not.toContain('Manage chapters')
})
it('never asks the Network tools about a Collective',async()=>{
  mocks.caller.mockResolvedValue({id:'owner'})
  await Page({params:Promise.resolve({slug:'network'})})
  expect(mocks.tools).not.toHaveBeenCalled()
})
