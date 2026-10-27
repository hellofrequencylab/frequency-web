import {describe,it,expect} from 'vitest'
import {projectPublicHeader} from './header-projection'
import {frequencyHeaderDefaults} from './header-defaults'
import {applyRegistryGates} from '@/lib/menus/gates'
import {defaultMenu} from '@/lib/menus/defaults'
import type {ResolvedItem} from '@/lib/menus/types'
const item=(over:Partial<ResolvedItem>={}):ResolvedItem=>({id:'row',label:'Editable',href:'/about',position:0,colSpan:1,mode:'active',roleModes:{},minAccess:'visitor',...over})
const custom=()=>({...frequencyHeaderDefaults(),isDefault:false,rootItems:[item()]})
describe('public header projection and current editor defaults',()=>{
 it('keeps exact current coded fallback for missing/default and unedited modern seeds',()=>{
  expect(projectPublicHeader(frequencyHeaderDefaults(),{viewerRole:'visitor'})).toBeNull()
  expect(projectPublicHeader({...applyRegistryGates(frequencyHeaderDefaults()),isDefault:false},{viewerRole:'visitor'})).toBeNull()
  expect(defaultMenu('header').categories.map(c=>c.label)).toEqual(['For people','For spaces','Features'])
 })
 it('projects edited/new rows and preserves legitimate empty customization',()=>{
  const menu=custom();menu.rootItems=[item({label:'Renamed pricing',href:'/pricing'}),item({id:'new',label:'New guide',href:'/guides'})]
  expect(projectPublicHeader(menu,{viewerRole:'visitor'})?.links.map(l=>l.label)).toEqual(['Renamed pricing','New guide'])
  expect(projectPublicHeader({...menu,categories:[],rootItems:[]},{viewerRole:'visitor'})).toEqual({groups:[],links:[],cards:[]})
 })
 it('filters hidden, gated, operated-Space and unsafe links before serialization',()=>{
  const menu=custom();menu.categories=[];menu.rootItems=[item(),item({id:'hidden',label:'Secret label',mode:'hidden'}),item({id:'admin',href:'/admin',minAccess:'admin'}),item({id:'bad',href:'javascript:alert(1)'}),item({id:'op',requiresOperatedSpaces:true})]
  const result=projectPublicHeader(menu,{viewerRole:'visitor'})
  expect(result?.links.map(l=>l.id)).toEqual(['row'])
  expect(JSON.stringify(result)).not.toMatch(/Secret label|roleModes|javascript|staffDomain/)
  expect(projectPublicHeader(menu,{viewerRole:'admin',operatesSpaces:true})?.links.map(l=>l.id)).toEqual(['row','admin','op'])
 })
 it('keeps intentional ghosts non-hidden and respects role overrides',()=>{
  const menu=custom();menu.categories=[];menu.rootItems=[item({mode:'ghost',minAccess:'crew',ghostMessage:'Upgrade preview'}),item({id:'staff-only',roleModes:{visitor:'hidden'}})]
  expect(projectPublicHeader(menu,{viewerRole:'visitor'})?.links).toEqual([expect.objectContaining({ghost:true,ghostTier:'crew',ghostMessage:'Upgrade preview'})])
 })
 it('projects edited featured cards while hiding unsafe and unauthorized targets',()=>{
  const menu=custom();menu.railCards=[{id:'public-card',side:'right',title:'Edited feature',body:'Current description',href:'/about',position:0,mode:'active',roleModes:{}},{id:'private-card',side:'left',title:'Private admin',body:'Private',href:'/admin/unknown-area',position:1,mode:'active',roleModes:{}}]
  expect(projectPublicHeader(menu,{viewerRole:'visitor'})?.cards.map(card=>card.id)).toEqual(['public-card'])
 })
 it('distinguishes canonical wings from feature jobs after a content-only edit',()=>{
  const menu=custom()
  expect(projectPublicHeader(menu,{viewerRole:'visitor'})?.groups.map(g=>g.design)).toEqual(['people','spaces','packages'])
 })
 it('does not project a gated parent even when its leaf itself is public',()=>{
  const menu=custom();menu.rootItems=[];menu.categories=[{id:'admin-group',label:'Private tools',position:0,colSpan:1,minAccess:'admin',items:[item()],children:[]}]
  expect(projectPublicHeader(menu,{viewerRole:'visitor'})?.groups).toEqual([])
 })
})
