// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountTools, type AccountToolsProps } from './account-tools'
const { viewAs, context } = vi.hoisted(() => ({viewAs: vi.fn(async () => {}), context: vi.fn(async () => ({href: '/feed'}))}))
vi.mock('@/app/(main)/view-as-actions', () => ({setViewAsRole: viewAs}))
vi.mock('@/app/(main)/context-actions', () => ({setOperatorContext: context}))
let root: Root
let host: HTMLDivElement
const props: AccountToolsProps = { realRole:'host', currentRole:'host', previewVisitor:false, context:{kind:'personal'}, available:[{kind:'personal', label:'Personal', href:'/feed'},{kind:'operator',spaceId:'space-owned',label:'Owned Space',href:'/spaces/owned'}],demoHidden:true }
async function render(overrides: Partial<AccountToolsProps> = {}) {
 (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
 host=document.createElement('div'); document.body.append(host); root=createRoot(host)
 await act(async()=>root.render(<AccountTools {...props} {...overrides}/>))
}
afterEach(async()=>{ if(root) await act(async()=>root.unmount());host?.remove();vi.clearAllMocks() })
describe('active Frequency account tools',()=>{
 it('shows server-allowed identities, selected preview state and demo preference',async()=>{
  await render({currentRole:'member',previewVisitor:true})
  expect(host.querySelector<HTMLSelectElement>('[aria-label="View as role"]')?.value).toBe('visitor')
  expect([...host.querySelectorAll('[aria-label="Operating as"] option')].map(x=>x.textContent)).toEqual(['Personal','Owned Space'])
  expect(host.querySelector('[aria-label="Demo content"]')?.getAttribute('aria-checked')).toBe('false')
 })
 it('the real demo switch remains visible in the sheet and updates the per-viewer cookie',async()=>{
  await render()
  const toggle=host.querySelector<HTMLButtonElement>('[aria-label="Demo content"]')!
  expect(toggle.className).toBe('fqm-acct-row')
  await act(async()=>toggle.click())
  expect(document.cookie).toContain('fq_hide_demo=0')
  expect(toggle.getAttribute('aria-checked')).toBe('true')
 })
 it('offers only downgrade roles and dispatches selecting own role as clearing preview',async()=>{
  await render({currentRole:'member'})
  const select=host.querySelector<HTMLSelectElement>('[aria-label="View as role"]')!
  expect([...select.options].map(x=>x.value)).not.toContain('janitor')
  expect([...select.options].map(x=>x.value)).not.toContain('mentor')
  await act(async()=>{select.value='host';select.dispatchEvent(new Event('change',{bubbles:true}))})
  expect(viewAs).toHaveBeenCalledWith(null)
 })
 it('keeps the current identity usable after a rejected action',async()=>{
  context.mockRejectedValueOnce(new Error('offline'))
  await render()
  const select=host.querySelector<HTMLSelectElement>('[aria-label="Operating as"]')!
  await act(async()=>{select.value='operator:space-owned';select.dispatchEvent(new Event('change',{bubbles:true}))})
  expect(context).toHaveBeenCalledWith('operator:space-owned')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Try again')
  expect(select.disabled).toBe(false)
 })
 it('hides role preview for ordinary members and empty single-context controls',async()=>{
  await render({realRole:'member',currentRole:'member',available:[props.available[0]]})
  expect(host.querySelector('[aria-label="View as role"]')).toBeNull()
  expect(host.querySelector('[aria-label="Operating as"]')).toBeNull()
 })
})
