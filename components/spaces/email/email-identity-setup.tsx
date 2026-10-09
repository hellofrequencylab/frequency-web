'use client'
import { useState,useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FieldControl } from '@/components/studio/spark/field/field-control'
import { EMAIL_DOMAIN_MANIFEST } from '@/lib/studio/entities/email-domain'
import { isError } from '@/lib/action-result'
import { prepareEmailIdentity,provisionEmailIdentity,checkEmailIdentity,saveEmailIdentity,resetEmailIdentity } from '@/app/(main)/spaces/[slug]/settings/email/identity-actions'
import type { emailDomainDnsInstructions } from '@/lib/spaces/email-domain-dns'
export function EmailIdentitySetup({spaceId,slug,domain,paid,paidPlan=paid}:{spaceId:string;slug:string;domain:string|null;paid:boolean;paidPlan?:boolean}){
 const [values,setValues]=useState<Record<string,string>>({domain:domain??'',localPart:'hello',displayName:'',purpose:'conversation'})
 const [proof,setProof]=useState<{token:string;name:string;segments:string[];expiresAt:string}|null>(null)
 const [setup,setSetup]=useState<{domainId:string;dns:ReturnType<typeof emailDomainDnsInstructions>}|null>(null)
 const [ready,setReady]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');const [pending,start]=useTransition()
 const purpose=values.purpose as 'conversation'|'marketing'|'operational'
 function run(task:()=>Promise<void>){if(pending)return;setError('');start(async()=>{try{await task()}catch(e){setError(e instanceof Error?e.message:'Try again.')}})}
 const fields=EMAIL_DOMAIN_MANIFEST.fields.filter(f=>f.section===(ready?'sender':'domain'))
 const purposeField=EMAIL_DOMAIN_MANIFEST.fields.find(f=>f.path==='purpose')!
 return <section className="space-y-4 rounded-card border border-border bg-surface p-6">
  <h2 className="text-body font-semibold text-text">Sender identity</h2>
  <p className="text-body-sm text-muted">Free Spaces send with their name through Frequency. Paid Spaces can use a verified domain. Replies stay with the Space.</p>
  {!paid?paidPlan?<p className="text-body-sm text-muted">Your paid email identity capability is not active yet. Frequency sending remains available while it is resolved.</p>:<Link href={`/spaces/${slug}/settings/billing`} className="text-body-sm text-primary-strong">View Space plans for your own email domain</Link>:<>
   {!domain&&<p className="text-body-sm text-muted">Connect your website domain in Space settings first.</p>}
   {fields.map(def=><FieldControl key={def.path} def={def} value={values[def.path]??''} onChange={v=>{setValues({...values,[def.path]:String(v)});if(def.path==='domain'){setProof(null);setSetup(null);setReady(false)}}} disabled={pending||!domain}/>)}
   {!proof&&!setup&&<Button disabled={pending||!domain} onClick={()=>run(async()=>{const r=await prepareEmailIdentity(spaceId,values.domain);if(isError(r))throw new Error(r.error);setProof(r.data.ownership);setMessage('Add the TXT record below, then check ownership. Website connection alone does not verify email.')})}>Prepare domain</Button>}
   {proof&&!setup&&<div className="space-y-2 text-body-sm"><p>TXT name: <code>{proof.name}</code></p><p>TXT value: one record containing these quoted segments:</p><pre className="whitespace-pre-wrap break-all rounded-control bg-surface-elevated p-3">{proof.segments.map(s=>`"${s}"`).join(' ')}</pre><p className="text-muted">Keep your existing mailbox MX records. If DNS has not updated, check again. Ownership proof expires after one hour.</p><Button disabled={pending} onClick={()=>run(async()=>{const r=await provisionEmailIdentity(spaceId,values.domain,proof.token);if(isError(r))throw new Error(r.error);setSetup(r.data);setMessage('Add the provider records below. Sending and receiving are verified separately.')})}>Check ownership and connect</Button><Button variant="ghost" disabled={pending} onClick={()=>run(async()=>{const r=await prepareEmailIdentity(spaceId,values.domain);if(isError(r))throw new Error(r.error);setProof(r.data.ownership)})}>Refresh ownership proof</Button></div>}
   {setup&&<Button variant="ghost" disabled={pending} onClick={()=>{setProof(null);setSetup(null);setReady(false);setMessage('Choose the domain to prepare. Existing domain records stay in place.')}}>Set up another domain</Button>}
   {setup&&<div className="space-y-3 text-body-sm"><p>Manual DNS setup. Automatic DNS connection is unavailable.</p><ul className="space-y-2">{setup.dns.records.map((r,i)=><li key={i} className="break-all"><code>{r.type} {r.name} {r.value}{r.priority!==undefined?` priority ${r.priority}`:''}</code></li>)}</ul><p>Sending: {ready?'Verified':'Waiting for DNS'}. Receiving: not connected. Use a reply subdomain to preserve Google Workspace or Microsoft 365 mailboxes.</p><Button disabled={pending} onClick={()=>run(async()=>{const r=await checkEmailIdentity(spaceId,setup.domainId);if(isError(r))throw new Error(r.error);setReady(r.data.sendingReady);setSetup({domainId:r.data.domainId,dns:r.data.dns});setMessage(r.data.sendingReady?'Choose your sender name and address.':'DNS is still pending. Keep these records and check again later.')})}>Check sending records</Button></div>}
   {ready&&setup&&<Button disabled={pending} onClick={()=>run(async()=>{const r=await saveEmailIdentity(spaceId,setup.domainId,values.localPart,values.displayName,purpose);if(isError(r))throw new Error(r.error);setMessage('Sender selected for new messages of this type. Existing queued messages keep their original identity.')})}>Use this sender</Button>}
  </>}
  {!paid&&<FieldControl def={purposeField} value={values.purpose} onChange={v=>setValues({...values,purpose:String(v)})} disabled={pending}/>}
  <Button variant="ghost" disabled={pending} onClick={()=>run(async()=>{const r=await resetEmailIdentity(spaceId,purpose);if(isError(r))throw new Error(r.error);setMessage('New messages of this type use Frequency. Previously sent replies keep their routing.')})}>Use Frequency sender</Button>
  {pending&&<p role="status" className="text-body-sm text-muted">Checking email setup…</p>}{message&&<p role="status" className="text-body-sm text-muted">{message}</p>}{error&&<p role="alert" className="text-body-sm text-danger">{error}</p>}
 </section>
}
