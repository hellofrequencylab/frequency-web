import { describe,it,expect,vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FqEventCover } from './event-header'
vi.mock('next/image',()=>({default:({fill:_fill,unoptimized:_unoptimized,preload:_preload,...props}:Record<string,unknown>)=>createElement('img',props)}))
const props={src:'/event.jpg',alt:'Actual flyer',focus:'25% 70%',aspect:2,unoptimized:false,dateDay:'27',dateMonth:'Oct'}
describe('actual Frequency event artwork (later owner contain ruling)',()=>{
 it('retains original artwork and focal position with an aspect-shaped frame',()=>{
  const html=renderToStaticMarkup(<FqEventCover {...props}/>)
  expect(html).toContain('aspect-ratio:2')
  expect(html).toContain('fqm-evh-cover-art')
  expect(html.match(/object-position:25% 70%/g)).toHaveLength(2)
  expect(html.match(/alt="Actual flyer"/g)).toHaveLength(1)
  expect(html).toContain('aria-hidden="true"')
 })
 it.each([0,-1,NaN,Infinity])('rejects unusable aspect %s without writing invalid CSS',aspect=>{
  expect(renderToStaticMarkup(<FqEventCover {...props} aspect={aspect}/>)).not.toContain('aspect-ratio:')
 })
 it('has a date placeholder when artwork is absent',()=>{
  const html=renderToStaticMarkup(<FqEventCover {...props} src={null}/>)
  expect(html).toContain('is-empty');expect(html).toContain('27');expect(html).not.toContain('<img')
 })
})
