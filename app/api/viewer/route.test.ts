import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({user:vi.fn(),profile:vi.fn(),menu:vi.fn(),settings:vi.fn(),eq:vi.fn()}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({
 auth:{getUser:state.user},
 from:(table:string)=>{
  if(table!=='profiles')throw Error('unscoped table')
  return {select:()=>({eq:(field:string,id:string)=>{state.eq(field,id);return {maybeSingle:state.profile}}})}
 }
})}))
vi.mock('@/lib/menus/read',()=>({getMenu:state.menu,getMenuSettings:state.settings}))
import {GET} from './route'
import {frequencyHeaderDefaults} from '@/lib/frequency/header-defaults'
const menu=()=>({...frequencyHeaderDefaults(),isDefault:false,categories:[],rootItems:[{id:'public',label:'Edited link',href:'/about',position:0,colSpan:1,mode:'active' as const,roleModes:{},minAccess:'visitor' as const},{id:'secret',label:'Secret tools',href:'/admin',position:1,colSpan:1,mode:'active' as const,roleModes:{},minAccess:'admin' as const}]})
beforeEach(()=>{vi.clearAllMocks();state.settings.mockResolvedValue({openDelayMs:180,dwellMs:280,fadeMs:220});state.user.mockResolvedValue({data:{user:null}});state.profile.mockResolvedValue({data:null});state.menu.mockResolvedValue(menu())})
describe('existing private viewer seam supplies authorized public header data',()=>{
 it('projects only visitor rows without reading another profile',async()=>{
  const response=await GET();const body=await response.json()
  expect(body.navigation.links.map((l:{id:string})=>l.id)).toEqual(['public'])
  expect(JSON.stringify(body)).not.toContain('Secret tools')
  expect(state.eq).not.toHaveBeenCalled();expect(state.menu).toHaveBeenCalledWith('header')
  expect(response.headers.get('Cache-Control')).toBe('no-store, private')
 })
 it('uses validated own-row roles, not a role from user metadata or a query parameter',async()=>{
  state.user.mockResolvedValue({data:{user:{id:'auth-own',user_metadata:{web_role:'janitor'}}}})
  state.profile.mockResolvedValue({data:{display_name:'Member',handle:'own',avatar_url:null,community_role:'member',web_role:'none'}})
  const body=await(await GET()).json()
  expect(state.eq).toHaveBeenCalledWith('auth_user_id','auth-own')
  expect(body.navigation.links.map((l:{id:string})=>l.id)).toEqual(['public'])
 })
 it('preserves real admin visibility and existing identity fields',async()=>{
  state.user.mockResolvedValue({data:{user:{id:'auth-own'}}})
  state.profile.mockResolvedValue({data:{display_name:'Admin',handle:'own',avatar_url:null,community_role:'member',web_role:'janitor'}})
  const body=await(await GET()).json()
  expect(body.profile.handle).toBe('own');expect(body.navigation.links).toHaveLength(2)
 })
 it('keeps verified identity and coded navigation fallback when menu loading fails',async()=>{
  state.user.mockResolvedValue({data:{user:{id:'auth-own'}}});state.profile.mockResolvedValue({data:{display_name:'Member',handle:'own',community_role:'member',web_role:'none'}});state.menu.mockRejectedValue(new Error('private storage error'))
  const response=await GET();const body=await response.json()
  expect(body.signedIn).toBe(true);expect(body.navigation).toBeNull();expect(JSON.stringify(body)).not.toContain('private storage')
  expect(response.headers.get('Cache-Control')).toBe('no-store, private')
 })
})
