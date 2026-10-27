import {describe,it,expect,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const mock=vi.hoisted(()=>({menu:vi.fn()}))
vi.mock('@/lib/menus/read',()=>({getMenu:mock.menu}))
vi.mock('next/navigation',()=>({usePathname:()=>'/about',useRouter:()=>({push:vi.fn()})}))
vi.mock('next/image',()=>({default:({priority:_priority,...props}:Record<string,unknown>)=>createElement('img',props)}))
vi.mock('./site-root',()=>({useSite:()=>({page:{cta:'side'},side:'p'})}))
import {PublicHeader} from './public-header'
import {frequencyHeaderDefaults} from '@/lib/frequency/header-defaults'
describe('public SSR uses cached visitor-only editable navigation',()=>{
 it('includes edited public links in actual server markup, never private rows',async()=>{
  const menu=frequencyHeaderDefaults();menu.isDefault=false;menu.rootItems=[{id:'new-public',label:'New crawlable page',href:'/guides',position:0,colSpan:1,mode:'active',roleModes:{},minAccess:'visitor'},{id:'private',label:'Private admin label',href:'/admin',position:1,colSpan:1,mode:'active',roleModes:{},minAccess:'admin'}]
  mock.menu.mockResolvedValue(menu)
  const html=renderToStaticMarkup(await PublicHeader())
  expect(html).toContain('New crawlable page');expect(html).not.toContain('Private admin label')
  expect(mock.menu).toHaveBeenCalledWith('header')
 })
 it('keeps the current Frequency design when cached menu loading rejects',async()=>{
  mock.menu.mockRejectedValue(new Error('private storage details'))
  const html=renderToStaticMarkup(await PublicHeader())
  expect(html).toContain('For people');expect(html).toContain('For spaces');expect(html).not.toContain('private storage details')
 })
})
