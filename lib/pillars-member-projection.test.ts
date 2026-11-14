import { beforeEach, describe, expect, it, vi } from 'vitest'
const MIND='11111111-1111-4111-8111-111111111111',BODY='22222222-2222-4222-8222-222222222222',SPIRIT='33333333-3333-4333-8333-333333333333',EXPRESSION='44444444-4444-4444-8444-444444444444'
const fixture=vi.hoisted(()=>({rows:[] as Array<Record<string,unknown>>,selected:[] as string[],filters:[] as Array<[string,unknown]>}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from(table:string){
 let projection=''
 const query={
  select(columns:string){projection=columns;fixture.selected.push(columns);return query},
  eq(column:string,value:unknown){if(table==='member_practices')fixture.filters.push([column,value]);return query},
  async order(){
   if(table==='pillars')return{data:[MIND,BODY,SPIRIT,EXPRESSION].map((id,i)=>({id,slug:['mind','body','spirit','expression'][i],name:['Mind','Body','Spirit','Expression'][i],display_order:i})),error:null}
   if(table!=='member_practices')throw Error('Unexpected query table '+table)
   const nested=/^practice:practices\((.+)\)$/.exec(projection)
   if(!nested)throw Error('Expected explicit nested Practice projection')
   const fields=nested[1].split(',').map(field=>field.trim())
   return{data:fixture.rows.map(row=>({practice:Object.fromEntries(fields.filter(field=>Object.hasOwn(row,field)).map(field=>[field,row[field]]))})),error:null}
  },
 }
 return query
}})}))
import {getMemberPractices} from './practices'
import {getMemberPillarBalance} from './pillars'
beforeEach(()=>{fixture.rows=[{id:'legacy-practice',title:'A quiet walk',domain_id:BODY,secondary_domain_id:SPIRIT,focus_details:{}}];fixture.selected.length=0;fixture.filters.length=0})

describe('actual member Practice projection carries current secondary support',()=>{
 it('selects the existing secondary column and returns it through the real normalization path',async()=>{
  const practices=await getMemberPractices('member')
  expect(fixture.selected[0]).toMatch(/\bsecondary_domain_id\b/)
  expect(practices[0].secondary_domain_id).toBe(SPIRIT)
  expect(practices[0].focus_details).toEqual({})
  expect(fixture.filters).toEqual([['profile_id','member'],['active',true]])
 })
 it('makes a legacy secondary with no focus map visible in actual adopted support counts',async()=>{
  expect((await getMemberPillarBalance('member')).map(row=>row.count)).toEqual([0,1,1,0])
  expect(fixture.filters).toEqual([['profile_id','member'],['active',true]])
 })
 it('does not infer an unrecorded third or fourth support from reward or historical fields',async()=>{
  fixture.rows[0].pillar_id=EXPRESSION
  fixture.rows[0].primary_pct=100
  expect((await getMemberPillarBalance('member')).map(row=>row.count)).toEqual([0,1,1,0])
 })
})
