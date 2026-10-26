// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({review:vi.fn()}))
vi.mock('@/app/(main)/admin/marketing/agent/actions',()=>({reviewWinbackCoaching:m.review}))
import { WinbackCoachingReview } from './winback-coaching-review'
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
it('shows transient coaching without changing authored fields or offering an insert/send control',async()=>{
 const holder=document.createElement('div'), authored=document.createElement('textarea'), panel=document.createElement('div')
 authored.value='A human message stays unchanged.';holder.append(authored,panel);document.body.append(holder)
 const edited=vi.fn();authored.addEventListener('input',edited);authored.addEventListener('change',edited)
 const root=createRoot(panel)
 try{
  m.review.mockResolvedValue({source:'coach',questions:['How will you review current consent?']})
  await act(async()=>root.render(<WinbackCoachingReview/>))
  expect(m.review).not.toHaveBeenCalled()
  await act(async()=>panel.querySelector('button')!.click())
  expect(panel.textContent).toContain('How will you review current consent?')
  expect(panel.textContent).toContain('not saved to the proposal or sent')
  expect(authored.value).toBe('A human message stays unchanged.');expect(edited).not.toHaveBeenCalled()
  expect(panel.querySelector('textarea,input,[contenteditable="true"]')).toBeNull()
  expect([...panel.querySelectorAll('button')].every(button=>button.type==='button'&&!/insert|apply|save|send/i.test(button.textContent??''))).toBe(true)
 }finally{await act(async()=>root.unmount());holder.remove()}
})
