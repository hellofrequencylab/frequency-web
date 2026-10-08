import { describe, expect, it } from 'vitest'
import { collectiveNetworkOpen, publicMemberSpaces, liveNetworkUpcoming, type MemberSpaceRow, type NetworkParent } from './network'
import type { CalendarEvent } from '@/lib/calendar/item'
const parent: NetworkParent = { id: 'parent', slug: 'network', status: 'active', plan: 'collective', networkConnected: true, ownerProfileId: 'owner' }
const row: MemberSpaceRow = { id: 'child', slug: 'child', name: 'Child', brand_name: null, brand_logo_url: null, parent_id: 'parent', owner_profile_id: 'owner', status: 'active', visibility: 'network', network_connected: true, type: 'community' }
const item: CalendarEvent = { slug: 'event', title: 'Event', dayKey: '2026-10-09', timeLabel: '', whenLabel: '', startInstantIso: null, location: null, goingCount: 0, coverUrl: null, isCancelled: false, layer: 'events' }
describe('Collective public projection', () => {
  it('excludes private, suspended, off-network, unrelated and cross-owner children even for owner views', () => {
    const unsafe: Partial<MemberSpaceRow>[] = [{visibility:'private'}, {status:'suspended'}, {network_connected:false}, {parent_id:'other'}, {owner_profile_id:'other'}, {type:'root'}]
    expect(publicMemberSpaces([row, ...unsafe.map((change,i)=>({...row,id:`unsafe${i}`,...change}))],parent)).toEqual([{id:'child',slug:'child',name:'Child',logoUrl:null}])
  })
  it('drops duplicate children and exposes only the public card fields', () => {
    expect(publicMemberSpaces([row,row],parent)).toHaveLength(1)
    expect(Object.keys(publicMemberSpaces([row],parent)[0]).sort()).toEqual(['id','logoUrl','name','slug'])
  })
  it.each([{status:'suspended'}, {networkConnected:false}, {ownerProfileId:null}, {plan:'business'}] as Partial<NetworkParent>[])('closes the network after parent eligibility changes: %j', change => {
    expect(collectiveNetworkOpen({...parent,...change})).toBe(false)
    expect(publicMemberSpaces([row],{...parent,...change})).toEqual([])
  })
  it('accepts the nonprofit Collective but does not turn canceled calendar context into invitations', () => {
    expect(collectiveNetworkOpen({...parent,plan:'nonprofit_collective'})).toBe(true)
    expect(liveNetworkUpcoming([item,{...item,slug:'cancelled',isCancelled:true},{...item,slug:'past',dayKey:'2026-10-01'},{...item,slug:'private',layer:'private'}],'2026-10-08')).toEqual([item])
  })
})
