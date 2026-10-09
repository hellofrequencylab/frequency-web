import 'server-only'
import { randomUUID } from 'node:crypto'
import { asSpacePlan, SPACE_EMAIL_CUSTOM_IDENTITY_KEY } from '@/lib/pricing/plans'
import { spaceHasEntitlement } from './entitlements'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSiteDomain } from '@/lib/sites/domain'
import { emailOwnershipChallenge, verifyEmailDomainOwnership } from './email-domain-ownership'
import { requireSpaceEmailIdentityOwner, createSpaceEmailIdentity, resolveSpaceEmailIdentity } from './email-identity-registry'
import { createEmailProviderDomain, reconcileEmailProviderDomain, inspectEmailProviderDomain, requestEmailProviderVerification } from './email-domain-provider'
import { advanceEmailDomainOperation, type EmailDomainOperation } from './email-domain-operation'
import { emailDomainDnsInstructions, type EmailDnsRecord } from './email-domain-dns'

type Result={data:Record<string,unknown>|null;error:{code?:string}|null}
type Query={select(s:string):Query;eq(k:string,v:unknown):Query;insert(v:Record<string,unknown>):Query;update(v:Record<string,unknown>):Query;upsert(v:Record<string,unknown>,opts?:Record<string,unknown>):Query;delete():Query;single():Promise<Result>;maybeSingle():Promise<Result>}
const db=()=>createAdminClient() as unknown as {from(t:string):Query;rpc(name:string,args:Record<string,unknown>):Promise<Result>}
async function ownedDomain(spaceId:string,raw:string) {
 const space=await requireSpaceEmailIdentityOwner(spaceId)
 const parsed=parseSiteDomain(raw)
 if(!parsed.ok) throw new Error(parsed.error)
 const assigned=space.domain?.toLowerCase()
 if(!assigned||(parsed.domain!==assigned&&!parsed.domain.endsWith(`.${assigned}`))) throw new Error('Connect this domain to the Space before preparing email.')
 return {space,domain:parsed.domain}
}
async function operation(spaceId:string,domain:string,ownerId:string) {
 const table=db().from('space_email_domain_operations')
 let {data,error}=await table.select('*').eq('space_id',spaceId).eq('domain',domain).eq('owner_profile_id',ownerId).maybeSingle()
 if(error) throw new Error('Email setup record is unavailable.')
 if(!data) {
  const inserted=await db().from('space_email_domain_operations').insert({space_id:spaceId,owner_profile_id:ownerId,domain,nonce:randomUUID()}).select('*').single()
  data=inserted.data;error=inserted.error
  if(error?.code==='23505') ({data,error}=await db().from('space_email_domain_operations').select('*').eq('space_id',spaceId).eq('domain',domain).eq('owner_profile_id',ownerId).maybeSingle())
 }
 if(error||!data) throw new Error('This domain is already being connected or its setup record is unavailable.')
 return data
}
export async function prepareEmailDomainSetup(spaceId:string,raw:string) {
 const {space,domain}=await ownedDomain(spaceId,raw)
 const op=await operation(spaceId,domain,space.owner_profile_id)
 return {domain,ownership:emailOwnershipChallenge(spaceId,space.owner_profile_id,domain,Date.now(),{id:String(op.id),nonce:String(op.nonce)}),state:String(op.state)}
}
export async function runSpaceEmailDomainProvisioning(spaceId:string,raw:string,token:string) {
 const {space,domain}=await ownedDomain(spaceId,raw)
 const op=await operation(spaceId,domain,space.owner_profile_id)
 await verifyEmailDomainOwnership(spaceId,space.owner_profile_id,domain,token,Date.now(),{id:String(op.id),nonce:String(op.nonce)})
 const claimed=await db().rpc('claim_space_email_domain_operation',{p_id:op.id})
 if(claimed.error||!claimed.data) throw new Error('Email setup could not acquire its delivery-safe lease.')
 const persistOperationState=async(values:Record<string,unknown>)=>{const r=await db().from('space_email_domain_operations').update(values).eq('id',op.id).eq('space_id',spaceId).select('id').single();if(r.error||!r.data)throw new Error('Email setup state could not be saved.')}
 return advanceEmailDomainOperation(claimed.data as unknown as EmailDomainOperation,{
  create:createEmailProviderDomain,reconcile:reconcileEmailProviderDomain,
  remember:async id=>persistOperationState({provider_domain_id:id,state:'persisting'}),
  persist:async id=>{
   const provider=await inspectEmailProviderDomain(id,domain)
   const values={space_id:spaceId,domain,provider_domain_id:id,sending_verified:provider.status==='verified'&&provider.capabilities.sending==='enabled',last_verified_at:new Date().toISOString()}
   // Never overwrite a registry owner on conflict. Read the exact tenant/provider row after insert.
   const inserted=await db().from('space_email_domains').insert(values).select('id').single()
   const row=inserted.error?.code==='23505'?await db().from('space_email_domains').select('id').eq('space_id',spaceId).eq('domain',domain).eq('provider_domain_id',id).maybeSingle():inserted
   if(row.error||!row.data) throw new Error('Provider setup is saved. Registry persistence needs recovery; check again.')
   return {domainId:String(row.data.id),dns:emailDomainDnsInstructions(domain,provider.records as EmailDnsRecord[],false)}
  },complete:()=>persistOperationState({state:'ready',lease_until:null}),releaseUncertain:()=>persistOperationState({state:'uncertain',lease_until:null}),
 })
}
export async function checkEmailDomainSetup(spaceId:string,domainId:string) {
 await requireSpaceEmailIdentityOwner(spaceId)
 const {data,error}=await db().from('space_email_domains').select('*').eq('id',domainId).eq('space_id',spaceId).maybeSingle()
 if(error||!data) throw new Error('Email domain is unavailable.')
 await requestEmailProviderVerification(String(data.provider_domain_id))
 const provider=await inspectEmailProviderDomain(String(data.provider_domain_id),String(data.domain))
 const ready=provider.status==='verified'&&provider.capabilities.sending==='enabled'
 const saved=await db().from('space_email_domains').update({sending_verified:ready,last_verified_at:new Date().toISOString()}).eq('id',domainId).eq('space_id',spaceId).select('id').single()
 if(saved.error) throw new Error('Domain health could not be saved. Check again.')
 return {domainId,sendingReady:ready,receivingReady:false,dns:emailDomainDnsInstructions(String(data.domain),provider.records as EmailDnsRecord[],false)}
}
export async function chooseEmailDomainSender(spaceId:string,domainId:string,local:string,name:string,purpose:'conversation'|'marketing'|'operational') {
 if(!['conversation','marketing','operational'].includes(purpose))throw new Error('Choose a supported email purpose.')
 await requireSpaceEmailIdentityOwner(spaceId)
 const health=await checkEmailDomainSetup(spaceId,domainId)
 if(!health.sendingReady) throw new Error('Verify the sending DNS records before choosing this sender.')
 const existing=await db().from('space_email_identities').select('id,display_name').eq('space_id',spaceId).eq('domain_id',domainId).eq('local_part',local).maybeSingle()
 if(existing.error)throw new Error('Sender selection is unavailable. Check again.')
 if(existing.data&&existing.data.display_name!==name.trim())throw new Error('This sender address already uses another display name.')
 const identityId=existing.data?String(existing.data.id):await createSpaceEmailIdentity(spaceId,domainId,local,name)
 await resolveSpaceEmailIdentity(spaceId,identityId)
 const {error}=await db().from('space_email_identity_defaults').upsert({space_id:spaceId,purpose,identity_id:identityId},{onConflict:'space_id,purpose'}).select('identity_id').single()
 if(error) throw new Error('Sender was created, but its default could not be saved. Check email settings before sending.')
 return {identityId,purpose}
}
export async function resolveSpaceEmailDefaultIdentity(spaceId:string,purpose:'conversation'|'marketing'|'operational') {
 const space=await db().from('spaces').select('plan,entitlements').eq('id',spaceId).maybeSingle()
 if(space.error||!space.data)throw new Error('Email sender selection is unavailable.')
 if(asSpacePlan(space.data.plan as string|null)==='free')return null
 const {data,error}=await db().from('space_email_identity_defaults').select('identity_id').eq('space_id',spaceId).eq('purpose',purpose).maybeSingle()
 if(error) throw new Error('Email sender selection is unavailable.')
 if(data&&!spaceHasEntitlement({entitlements:space.data.entitlements},SPACE_EMAIL_CUSTOM_IDENTITY_KEY))throw new Error('Custom email sender is currently unavailable.')
 return data?resolveSpaceEmailIdentity(spaceId,String(data.identity_id)):null
}

export async function useFrequencyEmailSender(spaceId:string,purpose:'conversation'|'marketing'|'operational') {
 if(!['conversation','marketing','operational'].includes(purpose))throw new Error('Choose a supported email purpose.')
 await requireSpaceEmailIdentityOwner(spaceId,false)
 const result=await db().from('space_email_identity_defaults').delete().eq('space_id',spaceId).eq('purpose',purpose).select('identity_id').maybeSingle()
 if(result.error)throw new Error('Could not choose the Frequency sender.')
}
