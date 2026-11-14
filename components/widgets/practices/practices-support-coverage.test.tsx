import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const state=vi.hoisted(()=>({profileId:'member' as string|null,read:vi.fn(),counts:[1,1,1,1],zaps:{total:12,byPillar:{m:9,b:3},complete:true}}))
const pillars=[{id:'m',slug:'mind',name:'Mind'},{id:'b',slug:'body',name:'Body'},{id:'s',slug:'spirit',name:'Spirit'},{id:'e',slug:'expression',name:'Expression'}]
vi.mock('@/lib/auth',()=>({getMyProfileId:async()=>state.profileId}))
vi.mock('@/lib/pillars',()=>({getPillars:async()=>pillars,getMemberPillarBalance:async(id:string)=>{state.read(id);return pillars.map((p,i)=>({...p,count:state.counts[i]}))}}))
vi.mock('@/lib/practices/attribution',()=>({getMemberPillarZaps:async()=>state.zaps}))
import { PracticesBalance } from './practices-balance'
const render=async()=>{const widget=await PracticesBalance();return widget?renderToStaticMarkup(widget):''}
beforeEach(()=>{vi.clearAllMocks();state.profileId='member';state.counts=[1,1,1,1];state.zaps={total:12,byPillar:{m:9,b:3},complete:true}})

describe('adopted supports are separate from performed practice and reward history',()=>{
 it('labels overlapping adoption counts without a normalized share or ideal-progress bar',async()=>{
  const html=await render()
  expect(html).toContain('Adopted practice supports')
  expect(html).toContain('more than one area')
  expect(html).toContain('not days practiced or how you are doing')
  expect(html).not.toMatch(/\d+%|role="progressbar"|aria-valuenow|balance out/)
  expect((html.match(/adopted practice</g)??[])).toHaveLength(4)
  expect(html).not.toContain('4 adopted practices')
 })
 it('retains the exact Zap ledger values and visible incomplete-history warning',async()=>{
  state.zaps.complete=false
  const html=await render()
  expect(html).toContain('data-pillar-zaps="9"')
  expect(html).toContain('data-pillar-zaps="3"')
  expect(html).toContain('>12</span> Zaps')
  expect(html).toContain('Some reward records could not be loaded. Displayed amounts may be incomplete.')
  expect(html).toContain('current-practice fallback for older logs')
 })
 it('keeps a welcoming empty state without implying missing support is a deficiency',async()=>{
  state.counts=[0,0,0,0];state.zaps.total=0;state.zaps.byPillar={m:0,b:0}
  const html=await render()
  expect(html).toContain('Adopt a practice from the library')
  expect(html).not.toContain('data-pillar-zaps')
  expect(html).not.toContain('balance out')
 })
 it('shows unavailable reward history even when the incomplete read returns zero Zaps',async()=>{
  state.counts=[0,0,0,0];state.zaps={total:0,byPillar:{m:0,b:0},complete:false}
  const html=await render()
  expect(html).toContain('Some reward records could not be loaded. Displayed amounts may be incomplete.')
  expect(html).not.toContain('more logs than we can count')
  expect(html).not.toContain('data-pillar-zaps')
 })
 it('does not read personal coverage or render for an anonymous viewer',async()=>{
  state.profileId=null
  expect(await render()).toBe('')
  expect(state.read).not.toHaveBeenCalled()
 })
})
