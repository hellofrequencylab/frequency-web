import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}))
vi.mock('@/lib/collective/cross-listing-actions',()=>({requestCollectiveCrossListing:vi.fn(),respondCollectiveCrossListing:vi.fn()}))
import { CrossListingEditor } from './editor'
it('shows a named original subject before owner approval and keeps consent explicit',()=>{
  const html=renderToStaticMarkup(<CrossListingEditor spaceId="target" subjects={[]} targets={[]} rows={[{id:'share',kind:'circle',subject_id:'circle',source_space_id:'source',space_id:'target',status:'pending',label:'Weekly circle',subjectSlug:'weekly',sourceName:'Partner Collective'}]}/> )
  expect(html).toContain('href="/circles/weekly"')
  expect(html).toContain('Weekly circle')
  expect(html).toContain('From Partner Collective')
  expect(html).toContain('Approve listing')
  expect(html).toContain('Decline')
})
it('sender can cancel but cannot approve its partner request',()=>{
  const html=renderToStaticMarkup(<CrossListingEditor spaceId="source" subjects={[]} targets={[]} rows={[{id:'share',kind:'journey',subject_id:'journey',source_space_id:'source',space_id:'target',status:'pending'}]}/> )
  expect(html).not.toContain('Approve listing')
  expect(html).toContain('Cancel request')
})
