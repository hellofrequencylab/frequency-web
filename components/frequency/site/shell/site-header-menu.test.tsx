// @vitest-environment jsdom
import {act,createElement} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {SiteHeader} from './site-header'
import {projectPublicHeader} from '@/lib/frequency/header-projection'
import {frequencyHeaderDefaults} from '@/lib/frequency/header-defaults'
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})}))
vi.mock('next/navigation',()=>({usePathname:()=>'/about',useRouter:()=>({push:vi.fn()})}))
vi.mock('next/link',()=>({default:({href,children,...props}:{href:string;children:React.ReactNode})=>createElement('a',{href,...props},children)}))
vi.mock('next/image',()=>({default:({priority:_priority,...props}:Record<string,unknown>)=>createElement('img',props)}))
vi.mock('./site-root',()=>({useSite:()=>({page:{cta:'side'},side:'p'})}))
const fetcher=vi.fn()
let host:HTMLDivElement,root:Root
let frames:FrameRequestCallback[]=[]
beforeEach(()=>{
 vi.useFakeTimers();frames=[]
 vi.stubGlobal('fetch',fetcher);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.push(cb);return frames.length});vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.useRealTimers();vi.clearAllMocks()})
async function flushFrames(){while(frames.length){const batch=frames.splice(0);await act(async()=>batch.forEach(cb=>cb(0)))}}
async function render(){await act(async()=>root.render(<SiteHeader/>))}
function payload(){const menu=frequencyHeaderDefaults();menu.isDefault=false;menu.categories=[{id:'edited-wing',label:'Edited heading',position:0,colSpan:1,items:[{id:'new',label:'New published link',href:'/guides',position:0,colSpan:1,mode:'active',roleModes:{},minAccess:'visitor'},{id:'second',label:'Second public row',href:'/about',position:1,colSpan:1,mode:'active',roleModes:{},minAccess:'visitor'},{id:'hidden',label:'Hidden row',href:'/about',position:1,colSpan:1,mode:'hidden',roleModes:{},minAccess:'visitor'},{id:'admin',label:'Private row',href:'/admin',position:2,colSpan:1,mode:'active',roleModes:{},minAccess:'admin'}],children:[]}];return{signedIn:false,navigation:projectPublicHeader(menu,{viewerRole:'visitor'})}}
describe('edited menus reach the actual Frequency header',()=>{
 it('renders edited/new desktop rows, filters inaccessible rows, and opens keyboard focus into the existing panel',async()=>{
  fetcher.mockResolvedValue({ok:true,json:async()=>payload()});await render()
  const trigger=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Edited heading'))!
  expect(trigger.className).toContain('mm-trig')
  await act(async()=>trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})))
  await flushFrames()
  const link=host.querySelector<HTMLAnchorElement>('#fq-mm-panel a[href="/guides"]')!
  expect(link.textContent).toContain('New published link');expect(document.activeElement).toBe(link)
  expect(host.textContent).not.toMatch(/Hidden row|Private row/)
 })
 it('uses the same edited rows in the actual phone sheet and retains Escape/focus return',async()=>{
  fetcher.mockResolvedValue({ok:true,json:async()=>payload()});await render()
  const trigger=host.querySelector<HTMLButtonElement>('[aria-controls="fq-mm-sheet"]')!
  await act(async()=>trigger.click());await flushFrames()
  const sheet=host.querySelector('#fq-mm-sheet')!
  expect(sheet.textContent).toContain('Edited heading');expect(sheet.querySelector('a[href="/guides"]')).not.toBeNull()
  expect(sheet.getAttribute('aria-modal')).toBe('true')
  expect(sheet.querySelector('a[href="/pricing"]')).not.toBeNull()
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  await act(async()=>{await vi.advanceTimersByTimeAsync(250)})
  expect(document.activeElement).toBe(trigger)
 })
 it('lets a nested ghost dialog own Escape without closing its underlying menu',async()=>{
  const data=payload()
  data.navigation!.groups[0].items.push({id:'preview',label:'Preview crew',href:'/upgrade',ghost:true,ghostTier:'crew'})
  fetcher.mockResolvedValue({ok:true,json:async()=>data});await render()
  const trigger=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Edited heading'))!
  await act(async()=>trigger.click());await flushFrames()
  const preview=host.querySelector<HTMLButtonElement>('[aria-label="Preview crew"]')!
  await act(async()=>preview.click());await flushFrames()
  expect(document.querySelector('[role="dialog"][aria-label="Upgrade to Crew"]')).not.toBeNull()
  await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  await act(async()=>{await vi.advanceTimersByTimeAsync(250)})
  expect(document.querySelector('[role="dialog"][aria-label="Upgrade to Crew"]')).toBeNull()
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
 })
 it('honors edited hover, dwell and fade settings while using the same Frequency panel',async()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
  fetcher.mockResolvedValue({ok:true,json:async()=>({...payload(),menuTimings:{openDelayMs:500,dwellMs:750,fadeMs:300}})});await render()
  const trigger=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Edited heading'))!
  await act(async()=>trigger.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})))
  await act(async()=>{await vi.advanceTimersByTimeAsync(499)})
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
  await act(async()=>{await vi.advanceTimersByTimeAsync(1)});await flushFrames()
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  const header=host.querySelector<HTMLElement>('#nav')!
  expect(header.style.getPropertyValue('--fq-dur-base')).toBe('300ms')
  await act(async()=>header.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body})))
  await act(async()=>{await vi.advanceTimersByTimeAsync(749)})
  expect(trigger.getAttribute('aria-expanded')).toBe('true')
  await act(async()=>{await vi.advanceTimersByTimeAsync(1)})
  expect(trigger.getAttribute('aria-expanded')).toBe('false')
 })
 it('retains current Frequency navigation when the scoped request rejects',async()=>{
  fetcher.mockRejectedValue(new Error('offline'));await render()
  expect(host.textContent).toContain('For people');expect(host.textContent).toContain('For spaces');expect(host.textContent).toContain('Features')
  expect(fetcher).toHaveBeenCalledWith('/api/viewer',{credentials:'same-origin',cache:'no-store'})
 })
})
