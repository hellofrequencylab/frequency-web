import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { signingSecret } from '@/lib/signing-secret'
import { buildConversationReplyAddress, parseConversationReplyAddress } from './reply-address'

type Alias = { alias_key:string; space_id:string; conversation_id:string; conversation_ref:string; local_prefix:string; receiving_domain:string; revoked_at:string|null; version:number }
type Result = { data:Record<string,unknown>|null; error:unknown }
type Query = { select(s:string):Query; eq(k:string,v:unknown):Query; insert(v:Record<string,unknown>):Query; update(v:Record<string,unknown>):Query; upsert(v:Record<string,unknown>,opts?:Record<string,unknown>):Query; single():Promise<Result>; maybeSingle():Promise<Result> }
const table=(name:string)=>(createAdminClient() as unknown as {from(n:string):Query}).from(name)
const tag=(row:Alias)=>createHmac('sha256',signingSecret('tenant-reply-alias',['CONVERSATION_TOKEN_SECRET']))
 .update(JSON.stringify([2,row.alias_key,row.space_id,row.conversation_id,row.conversation_ref,row.local_prefix,row.receiving_domain])).digest('hex').slice(0,32)
const address=(row:Alias)=>`${row.local_prefix}.r2.${row.alias_key}.${tag(row)}@${row.receiving_domain}`

/** Trusted compose boundary only. The flag enables issuance; existing aliases remain routable when disabled. */
export async function buildSpaceConversationReplyAddress(ref:string,spaceId:string|null) {
 if(!spaceId||process.env.SPACE_EMAIL_REPLY_ALIASES_ENABLED!=='true')return buildConversationReplyAddress(ref)
 const domain=process.env.CONVERSATION_REPLY_DOMAIN?.trim().toLowerCase()
 if(!domain||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)||!process.env.RESEND_INBOUND_WEBHOOK_SECRET)
  throw new Error('Space reply aliases require an explicitly configured receiving domain and authenticated webhook.')
 const conv=await table('comms_conversations').select('id,ref,space_id').eq('ref',ref).eq('space_id',spaceId).maybeSingle()
 const space=await table('spaces').select('slug').eq('id',spaceId).maybeSingle()
 if(conv.error||space.error||!conv.data||!space.data)throw new Error('Space reply route is unavailable.')
 const existing=await table('space_email_reply_aliases').select('*').eq('conversation_id',conv.data.id).eq('space_id',spaceId).maybeSingle()
 if(existing.error)throw new Error('Space reply route is unavailable.')
 if(existing.data) {
  if(existing.data.version!==2)throw new Error('Space reply route version is unavailable.')
  if(existing.data.revoked_at)throw new Error('Space reply route has been revoked.')
  return address(existing.data as unknown as Alias)
 }
 const prefix=String(space.data.slug).toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,7)
 if(!prefix)throw new Error('Space reply route is unavailable.')
 const row:Alias={alias_key:randomBytes(10).toString('hex'),space_id:spaceId,conversation_id:String(conv.data.id),conversation_ref:String(conv.data.ref),local_prefix:prefix,receiving_domain:domain,revoked_at:null,version:2}
 const saved=await table('space_email_reply_aliases').insert(row).select('*').single()
 if(saved.error||!saved.data)throw new Error('Space reply route could not be saved. Nothing was sent.')
 return address(saved.data as unknown as Alias)
}

/** r2 is a reserved marker: malformed, multi-route and wrong-domain addresses never reach legacy fallback. */
export async function resolveTenantReplyAlias(recipients:string[]) {
 const candidates=recipients.filter(r=>r.toLowerCase().includes('.r2.'))
 if(!candidates.length)return {kind:'none' as const}
 if(candidates.length!==1||recipients.some(r=>parseConversationReplyAddress(r)))return {kind:'quarantine' as const,reason:'ambiguous_alias'}
 const bare=candidates[0].trim().toLowerCase().replace(/^.*<([^<>]+)>$/,'$1')
 const match=/^([a-z0-9-]{1,7})\.r2\.([a-f0-9]{20})\.([a-f0-9]{32})@([a-z0-9.-]+)$/.exec(bare)
 if(!match)return {kind:'quarantine' as const,reason:'malformed_alias'}
 const result=await table('space_email_reply_aliases').select('*').eq('alias_key',match[2]).maybeSingle()
 if(result.error)throw new Error('Reply alias lookup is unavailable.')
 const row=result.data as unknown as Alias|null
 if(!row||row.version!==2||row.revoked_at)return {kind:'quarantine' as const,reason:'unknown_or_revoked_alias'}
 if(row.local_prefix!==match[1]||row.receiving_domain!==match[4]||!timingSafeEqual(Buffer.from(tag(row),'hex'),Buffer.from(match[3],'hex')))
  return {kind:'quarantine' as const,reason:'invalid_alias_proof'}
 const conversation=await table('comms_conversations').select('id,space_id,ref').eq('id',row.conversation_id).maybeSingle()
 if(conversation.error)throw new Error('Reply conversation lookup is unavailable.')
 if(!conversation.data||conversation.data.space_id!==row.space_id||String(conversation.data.ref)!==row.conversation_ref)
  return {kind:'quarantine' as const,reason:'tenant_mapping_mismatch'}
 return {kind:'ready' as const,spaceId:row.space_id,conversationId:row.conversation_id,ref:row.conversation_ref}
}

/** Quarantine stores routing evidence only, never message body, sender or raw recipient. Failure requests redelivery. */
export async function quarantineTenantReplyAlias(reason:string,recipients:string[],messageId:string|null) {
 const digest=(s:string)=>createHash('sha256').update(s).digest('hex')
 const result=await table('space_email_reply_quarantine').upsert({reason,recipient_fingerprint:digest(JSON.stringify(recipients)),message_fingerprint:digest(messageId??JSON.stringify(recipients))},{onConflict:'message_fingerprint,recipient_fingerprint'}).select('id').single()
 if(result.error||!result.data)throw new Error('Reply quarantine could not be saved.')
}
