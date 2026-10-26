// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const mocks=vi.hoisted(()=>({approve:vi.fn(),refresh:vi.fn()}))
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}))
vi.mock('../actions',()=>({approveBusinessImport:mocks.approve,updateImportField:vi.fn(),reseedBusinessImport:vi.fn(),reresearchWithInfo:vi.fn(),setBusinessListed:vi.fn()}))
vi.mock('./seeder-images',()=>({SeederImages:()=>null}))
import { ReviewBoard } from './review-board'
import { buildReviewModel } from '../review-model'
import { coerceExtraction } from '@/lib/importer/extract/coerce'
let root:Root;let container:HTMLDivElement
afterEach(()=>{act(()=>root?.unmount());container?.remove();vi.clearAllMocks()})
it('shows missing rejected prose honestly and requires explicit manual Apply',async()=>{
 const extracted=coerceExtraction({about:{value:'INVENTED ABOUT',kind:'generated'},story:{value:'INVENTED STORY',kind:'fact',snippet:'unrelated'}},[],'Owner Studio')
 const model=buildReviewModel(extracted.draft,extracted.ledger)
 const fields=model.sections.flatMap(section=>section.fields)
 expect(fields.find(field=>field.path==='about')?.value).toBe('')
 expect(fields.find(field=>field.path==='story')?.value).toBe('')
 mocks.approve.mockResolvedValue({ok:true,profileHref:'/spaces/owner',siteHref:'/sites/owner'})
 container=document.createElement('div');document.body.append(container);root=createRoot(container)
 await act(async()=>root.render(<ReviewBoard intakeId="intake-owner" initialModel={model} status="review" isDemo initialMood="warm" appliedSpaceId={null} initialImages={[]} initialImagePlan={[]} initialLockHero initialLockLayout={false} initialListed={false} initialDirections="" />))
 expect(container.textContent).not.toContain('INVENTED')
 expect(container.textContent).toContain('Missing text stays Not set')
 expect(container.textContent).toContain('Not set')
 expect(mocks.approve).not.toHaveBeenCalled()
 const apply=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes('Approve and seed'))!
 expect(apply).toBeDefined();expect(apply.disabled).toBe(false)
 await act(async()=>apply.click())
 expect(mocks.approve).toHaveBeenCalledExactlyOnceWith('intake-owner')
 expect(container.textContent).not.toContain('INVENTED')
})
