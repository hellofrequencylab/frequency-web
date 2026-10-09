import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({tables:{} as Record<string,Record<string,unknown>[]>,rpc:[] as {id:string;subject:Record<string,unknown>}[],failPage:false,ranges:[] as number[],subjectReads:0}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
  rpc:()=>query(state.rpc as unknown as Record<string,unknown>[],true),
  from:(table:string)=>{if(table==='journey_plans')state.subjectReads++;return query(state.tables[table] ?? [])},
})}))
function query(input:Record<string,unknown>[],rpc=false){
  let rows=input.slice(),from=0,to=999;const ordering:string[]=[]
  const chain={select:()=>chain,eq:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return chain},neq:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]!==value);return chain},in:(key:string,values:unknown[])=>{rows=rows.filter(row=>values.includes(row[key]));return chain},or:()=>chain,
    order:(key:string)=>{ordering.push(key);return chain},range:(a:number,b:number)=>{from=a;to=b;if(rpc)state.ranges.push(a);return chain},maybeSingle:async()=>({data:rows[0]??null,error:null}),
    then:(resolve:(result:unknown)=>void)=>{rows.sort((a,b)=>{for(const key of ordering){const cmp=String(a[key]).localeCompare(String(b[key]));if(cmp)return cmp}return 0});resolve({data:rows.slice(from,to+1),error:state.failPage&&from>=500?'unavailable':null})}}
  return chain
}
import { acceptedCrossListingSubjects, crossListingManagement } from './cross-listing-store'
const space=(id:string)=>({id,slug:id,name:id,owner_profile_id:'owner',plan:'collective',status:'active',visibility:'network',parent_id:null})
beforeEach(()=>Object.assign(state,{tables:{},rpc:[],failPage:false,ranges:[],subjectReads:0}))
it('exhausts 1201 accepted subjects past the REST ceiling without a race-prone subject reload',async()=>{
  state.rpc=Array.from({length:1201},(_,i)=>({id:String(i).padStart(4,'0'),subject:{id:`subject-${i}`,space_id:'original'}}))
  const rows=await acceptedCrossListingSubjects('journey','target')
  expect(rows).toHaveLength(1201);expect(rows[1200].space_id).toBe('original')
  expect(state.ranges).toEqual([0,500,1000]);expect(state.subjectReads).toBe(0)
})
it('returns no partial healthy inventory when a later consent page fails',async()=>{
  state.rpc=Array.from({length:1201},(_,i)=>({id:String(i),subject:{id:String(i)}}));state.failPage=true
  expect(await acceptedCrossListingSubjects('circle','target')).toEqual([])
})
it('exhausts eligible partner selector and own authoring inventory past 1200 rows',async()=>{
  state.tables.spaces=Array.from({length:1201},(_,i)=>space(`space-${String(i).padStart(4,'0')}`))
  state.tables.journey_plans=Array.from({length:1201},(_,i)=>({id:String(i),title:`Journey ${i}`,space_id:'own',visibility:'public',status:'approved'}))
  const result=await crossListingManagement('own')
  expect(result.targets).toHaveLength(1201);expect(result.subjects).toHaveLength(1201)
})
it('recipient management never uses an independently fetched hidden source subject as a preview',async()=>{
  state.tables.spaces=[space('target'),{...space('source'),visibility:'private'}]
  state.tables.journey_plans=[{id:'subject',title:'Hidden source title',slug:'hidden',space_id:'source',visibility:'public',status:'approved'}]
  state.tables.collective_cross_listings=[{id:'listing',kind:'journey',subject_id:'subject',source_space_id:'source',space_id:'target',requested_by:'owner',status:'accepted'}]
  const result=await crossListingManagement('target')
  expect(result.rows).toHaveLength(1);expect(result.rows[0].label).toBeUndefined();expect(result.rows[0].subjectSlug).toBeUndefined();expect(result.rows[0].sourceName).toBeUndefined()
})
