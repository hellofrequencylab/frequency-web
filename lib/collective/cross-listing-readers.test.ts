import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({ids:['shared'],rows:[{id:'own',space_id:'target',status:'active',unlisted:false,is_space_primary:false,created_at:'2026-01-01'},{id:'shared',space_id:'source',status:'active',unlisted:false,is_space_primary:false,access:'space_paid_members',created_at:'2026-02-01'}]}))
vi.mock('./cross-listing-store',()=>({acceptedCrossListingSubjects:async()=>state.rows.filter(row=>state.ids.includes(row.id) && !row.unlisted && row.status==='active')}))
vi.mock('@/lib/auth',()=>({getMyProfileId:async()=>null,isPlatformStaff:async()=>false}))
vi.mock('@/lib/spaces/store',()=>({loadRootSpaceId:async()=>null}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{
  let rows=state.rows.slice()
  const chain={select:()=>chain,eq:(column:string,value:unknown)=>{rows=rows.filter(row=>Reflect.get(row,column)===value);return chain},in:(column:string,values:unknown[])=>{rows=rows.filter(row=>values.includes(Reflect.get(row,column)));return chain},or:()=>{rows=rows.filter(row=>!row.unlisted);return chain},order:()=>chain,limit:async()=>({data:rows,error:null})}
  return chain
}})}))
import { listPublicSpaceCircles } from '@/lib/circles/store'
beforeEach(()=>{state.ids=['shared'];state.rows[1].unlisted=false;state.rows[1].status='active'})
it('merges an accepted Circle listing without replacing its source Space or entry rules',async()=>{
  const rows=await listPublicSpaceCircles('target')
  expect(rows.map(row=>row.id)).toEqual(['shared','own'])
  expect(rows[0].space_id).toBe('source')
  expect(rows[0].access).toBe('space_paid_members')
})
it('revocation, unlisting and lifecycle changes remove the shared Circle',async()=>{
  state.ids=[];expect((await listPublicSpaceCircles('target')).map(row=>row.id)).toEqual(['own'])
  state.ids=['shared'];state.rows[1].unlisted=true;expect((await listPublicSpaceCircles('target')).map(row=>row.id)).toEqual(['own'])
  state.rows[1].unlisted=false;state.rows[1].status='inactive';expect((await listPublicSpaceCircles('target')).map(row=>row.id)).toEqual(['own'])
})
