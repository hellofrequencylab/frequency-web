// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GetStarted } from './get-started'
let root:Root|undefined;let host:HTMLDivElement|undefined
afterEach(()=>{act(()=>root?.unmount());host?.remove()})
const steps=[{key:'circle',label:'Join a Circle',blurb:'Find your people.',cta:'Find a Circle',href:'/circles',done:false},{key:'practice',label:'Adopt a practice',blurb:'Make time for yourself.',cta:'Find a practice',href:'/practices',done:false}]
it('opens the real first incomplete step for a new member, and Later reveals the next flow',()=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 act(()=>root!.render(<GetStarted steps={steps}/>))
 expect(host.querySelector('a')?.getAttribute('href')).toBe('/circles')
 expect(host.textContent).toContain('2 left')
 act(()=>[...host!.querySelectorAll('button')].find(b=>b.textContent==='Later')!.click())
 expect(host.querySelector('a')?.getAttribute('href')).toBe('/practices')
})
it('keeps completed steps disabled and removes the checklist when all are done',()=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 act(()=>root!.render(<GetStarted steps={[{...steps[0],done:true},steps[1]]}/>))
 expect(host.querySelector('button')?.disabled).toBe(true)
 expect(host.querySelector('a')?.getAttribute('href')).toBe('/practices')
 act(()=>root!.render(<GetStarted steps={steps.map(s=>({...s,done:true}))}/>))
 expect(host.innerHTML).toBe('')
})
