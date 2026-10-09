'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { requestCollectiveCrossListing, respondCollectiveCrossListing } from '@/lib/collective/cross-listing-actions'
import type { CrossListingRow, CrossListingSubject, CrossListingSpace } from '@/lib/collective/cross-listing-store'
import { isError, type ActionResult } from '@/lib/action-result'
export function CrossListingEditor({spaceId,subjects,rows,targets,canRequest=true}:{canRequest?:boolean;spaceId:string;subjects:CrossListingSubject[];rows:CrossListingRow[];targets:CrossListingSpace[]}) {
  const [subject,setSubject]=useState(''),[target,setTarget]=useState(''),[message,setMessage]=useState('')
  const [pending,startTransition]=useTransition()
  const router=useRouter()
  const run=(action:()=>Promise<ActionResult>)=>startTransition(async()=>{
    try { const result=await action();setMessage(isError(result)?result.error:'Saved.');if(!isError(result))router.refresh() } catch {setMessage('This listing could not be saved. Try again.')}
  })
  const selected=subjects.find(s=>`${s.kind}:${s.id}`===subject)
  return <div className="space-y-6">
    <p>A listing adds a link to the original Journey or Circle. It keeps its owner, editing permissions, price and entry rules. Either Space can remove the listing.</p>
    <div className="space-y-3">
      <label htmlFor="listing-subject">Journey or Circle</label>
      <Select id="listing-subject" value={subject} onChange={e=>setSubject(e.target.value)} disabled={pending}><option value="">Choose a published Journey or listed Circle</option>{subjects.map(s=><option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.label} ({s.kind})</option>)}</Select>
      <label htmlFor="listing-target">Collective or member Space</label>
      <Select id="listing-target" value={target} onChange={e=>setTarget(e.target.value)} disabled={pending}><option value="">Choose a Space</option>{targets.map(s=><option key={s.id} value={s.id}>{s.name ?? s.slug}</option>)}</Select>
      <Button disabled={pending || !canRequest || !selected || !target} onClick={()=>selected && run(()=>requestCollectiveCrossListing(selected.kind,selected.id,target))}>Request listing</Button>
      {!canRequest && <p>New listings need an active Collective or member Space with a visible profile. You can still remove existing listings.</p>}
      {!subjects.length && <p>Publish a Journey or list a Circle in this Space first.</p>}
    </div>
    <ul className="space-y-3">{rows.map(row=><li key={row.id} className="space-y-2">
      <p>{row.subjectSlug?<Link href={`/${row.kind==='journey'?'journeys':'circles'}/${row.subjectSlug}`} className="text-primary hover:underline">{row.label}</Link>:'No longer available'} · {row.status==='pending'?'awaiting approval':'listed'} · {row.source_space_id===spaceId?`To ${row.targetName ?? 'Space'}`:`From ${row.sourceName ?? 'Space'}`} </p>
      {row.space_id===spaceId && row.status==='pending' && <><Button disabled={pending || !row.subjectSlug} onClick={()=>run(()=>respondCollectiveCrossListing(row.id,'accepted'))}>Approve listing</Button><Button disabled={pending} onClick={()=>run(()=>respondCollectiveCrossListing(row.id,'declined'))}>Decline</Button></>}
      <Button disabled={pending} onClick={()=>run(()=>respondCollectiveCrossListing(row.id,'revoked'))}>{row.status==='pending'?'Cancel request':'Remove listing'}</Button>
    </li>)}</ul>
    {message && <p role="status">{message}</p>}
  </div>
}
