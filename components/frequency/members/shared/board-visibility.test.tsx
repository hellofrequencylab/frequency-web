// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardVisibilitySwitch } from './board-visibility'
import { FqBoardHide } from '../circle/board-hide'
const mock=vi.hoisted(()=>({save:vi.fn(),toast:vi.fn()}))
vi.mock('@/app/(main)/crew/leaderboard/actions',()=>({setLeaderboardVisibility:mock.save}))
vi.mock('../shell/toast',()=>({fqToast:mock.toast}))
let host: HTMLDivElement
let root: Root
async function render(circle: boolean, hidden=false) {
 (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 await act(async()=>root.render(circle ? <FqBoardHide hidden={hidden} basePath="/circles/owned/stats"/> : <BoardVisibilitySwitch hidden={hidden}/>))
 return host.querySelector<HTMLButtonElement>('button')!
}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();vi.clearAllMocks()})
describe.each([false,true])('live visibility control (Circle=%s)',circle=>{
 it('saves the shared preference with the correct route boundary',async()=>{
  mock.save.mockResolvedValue({ok:true})
  const button=await render(circle)
  await act(async()=>button.click())
  if(circle) expect(mock.save).toHaveBeenCalledWith(true,'/circles/owned/stats')
  else expect(mock.save).toHaveBeenCalledWith(true)
  expect(button.getAttribute(circle?'aria-pressed':'aria-checked')).toBe(circle?'true':'false')
 })
 it.each(['refused','rejected'])('rolls back a %s write, reports failure and permits retry',async mode=>{
  if(mode==='rejected') mock.save.mockRejectedValueOnce(new Error('private backend details'))
  else mock.save.mockResolvedValueOnce({ok:false,error:'private backend details'})
  const button=await render(circle)
  await act(async()=>button.click())
  expect(button.getAttribute(circle?'aria-pressed':'aria-checked')).toBe(circle?'false':'true')
  expect(button.disabled).toBe(false)
  if(circle) expect(host.querySelector('[role="alert"]')?.textContent).toBe('That did not save. Try again.')
  else expect(mock.toast).toHaveBeenCalledWith('That did not save. Try again.')
  expect(host.textContent).not.toContain('private backend details')
  mock.save.mockResolvedValueOnce({ok:true})
  await act(async()=>button.click())
  expect(button.getAttribute(circle?'aria-pressed':'aria-checked')).toBe(circle?'true':'false')
 })
})
