import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
export async function emailConsequences(root,overrides={}) {
 const req=createRequire(path.join(root,'package.json')),ts=req('typescript'),cache=new Map(),closure={}
 const state={mails:[],fail:false,tickets:[],rsvps:[],refundCalls:0}
 const forbidden=()=>{throw Error('Unexpected external/provider operation')}
 const db={auth:{admin:{getUserById:async()=>({data:{user:{email:'member@example.test'}}})}},from:table=>{
  const q={select:()=>q,eq:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='events'?{title:'Fixture event',slug:'fixture',starts_at:'2026-10-29T18:00:00Z',time_zone:'UTC'}:table==='profiles'?{display_name:'Fixture member',auth_user_id:'fixture-auth'}:{timezone:'UTC'},error:null}),then:resolve=>Promise.resolve({data:table==='event_tickets'?state.tickets:table==='event_rsvps'?state.rsvps:[],error:null}).then(resolve)};return q
 }}
 const enqueue=async(kind,payload)=>{if(kind==='ticket_refund'&&state.fail)throw Error('Synthetic queue refusal');if(kind==='email')state.mails.push(payload)}
 const stubs={resend:{Resend:class{constructor(){forbidden()}}},'@/lib/comms/email-provider-acceptance':{acceptEmailForJob:forbidden,providerAcceptanceEnabled:()=>false,readAcceptedEmailForJob:forbidden},'@/lib/comms/email-delivery-contract':{readEmailDeliveryContext:()=>null},'@/lib/unsubscribe-tokens':{buildUnsubscribeUrl:()=> 'https://frequencylocal.com/unsubscribe/fixture'},'@/lib/env/string':{envString:(_key,fallback)=>fallback},'@/lib/queue/outbox':{enqueue},'@/lib/suppression':{isSuppressed:async()=>false},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/billing/tickets':{refundTicket:()=>{state.refundCalls++;forbidden()}},'@/lib/comms/send-gate':{resolveSendGate:async()=>({allowed:true})},'@/lib/notifications/router':{routeNotification:async()=>({sent:true})},'@/lib/time/zone':{HOME_TZ:'UTC',formatEventWhen:()=> 'Fixture date',dayInZone:forbidden,isEventPast:forbidden},'./event-lifecycle':{cancelAudit:forbidden},'./series':{isSeriesCadence:forbidden,seriesKey:forbidden},'@/lib/marketing/made-with':{madeWithUrl:()=> 'https://frequencylocal.com'}}
 const allowed=new Set(['lib/email.ts','lib/events/cancellation.ts','lib/spaces/booking-notify.ts','lib/queue/terminal-error.ts','lib/theme/palette.ts','lib/theme/email-type.ts','lib/theme/design.ts','lib/email-studio/postal.ts','lib/email-studio/shell.ts','lib/email-studio/render.ts','lib/entity-blocks/node-tree.ts','lib/entity-blocks/legacy-write-guard.ts','lib/entity-blocks/registry.ts','lib/entity-blocks/layout.ts','lib/entity-blocks/icon-tokens.ts','lib/entity-blocks/block-limits.ts','lib/entity-blocks/aliases.ts','lib/entity-blocks/block-content.ts','lib/spotlight/embeds.ts','lib/library/asset-ref.ts','lib/widgets/templates.ts'])
 function load(file){if(cache.has(file))return cache.get(file).exports;if(!allowed.has(file))throw Error('Unreviewed source import:'+file);const source=overrides[file]??fs.readFileSync(path.join(root,file),'utf8');closure[file]=createHash('sha256').update(source).digest('hex');const loadedModule={exports:{}};cache.set(file,loadedModule)
  const require=spec=>{if(Object.hasOwn(stubs,spec))return stubs[spec];let next=spec.startsWith('@/')?spec.slice(2):spec.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),spec)):null;if(!next)throw Error('Unexpected package import:'+spec);if(!path.extname(next))next+='.ts';return load(next)}
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:loadedModule.exports,module:loadedModule,require,process:{env:{NEXT_PUBLIC_SITE_DESIGN:'frequency',NEXT_PUBLIC_APP_URL:'https://frequencylocal.com'}},Buffer,URL,TextEncoder,console:{error:()=>{},warn:()=>{},log:()=>{}},fetch:forbidden},{filename:file,timeout:1000});return loadedModule.exports
 }
 const mail=load('lib/email.ts'),cancel=load('lib/events/cancellation.ts'),booking=load('lib/spaces/booking-notify.ts')
 const parts=m=>[m.html,m.text??''];let cases=0
 for(const guest of [false,true])for(const requested of [false,true]){state.mails=[];const p={to:'guest@example.test',eventTitle:'Fixture event',whenAbsolute:'Fixture date',eventUrl:'https://frequencylocal.com/events/fixture',guestName:'Fixture guest',recipientName:'Fixture member',refunded:requested};await (guest?mail.sendGuestEventCancelledEmail:mail.sendEventCancelledEmail)(p);assert.equal(state.mails.length,1);assert.equal(state.mails[0].to,p.to);for(const s of parts(state.mails[0])){assert.match(s,/cancelled/);assert.doesNotMatch(s,/fully refunded|refunded in full|nothing you need to do/i);if(requested)assert.match(s,/refund.*requested|requested.*refund/i);else assert.doesNotMatch(s,/refund.*requested|requested.*refund|no longer need this RSVP/i)}cases++}
 for(const guest of [false,true])for(const mode of ['rejected','fallback','accepted']){state.mails=[];state.fail=mode!=='accepted';state.tickets=[{id:'ticket',buyer_profile_id:guest?null:'member',guest_email:guest?'guest@example.test':null}];state.rsvps=mode==='fallback'?[{profile_id:guest?null:'member',guest_email:guest?'guest@example.test':null,guest_name:'Fixture'}]:[];await cancel.refundAndNotifyForCancelledEvent('fixture');assert.equal(state.refundCalls,0);assert.equal(state.mails.length,mode==='rejected'?0:1);for(const m of state.mails)for(const s of parts(m)){if(mode==='accepted')assert.match(s,/refund.*requested|requested.*refund/i);else assert.doesNotMatch(s,/refund.*requested|requested.*refund|fully refunded|nothing you need to do/i)}cases++}
 const guest={name:'Fixture guest',email:'guest@example.test',manageUrl:'https://customer.example.test/book'},ctx={bookingId:'fixture',spaceId:'fixture',spaceSlug:'fixture',spaceName:'Fixture Studio',ownerProfileId:null,memberProfileId:null,memberName:null,guest,startsAt:'2026-10-29T18:00:00Z',endsAt:'2026-10-29T19:00:00Z',serviceName:'Fixture session'}
 state.mails=[];await booking.notifyBookingConfirmed(ctx);assert.equal(state.mails.length,1);const confirmed=state.mails[0];assert.equal(confirmed.to,guest.email);assert.equal(confirmed.attachments?.[0].filename,'booking.ics');for(const s of parts(confirmed)){assert.ok(s.includes(guest.manageUrl));assert.doesNotMatch(s,/you joined Frequency|settings\/notifications/)}cases++
 state.mails=[];await mail.sendBookingConfirmationEmail({to:'member@example.test',recipientName:'Member',audience:'member',spaceName:'Fixture Studio',serviceName:'Fixture',whenAbsolute:'Fixture date',durationMinutes:60,otherPartyName:'Host',manageUrl:guest.manageUrl,icsBase64:null});assert.match(state.mails[0].html,/settings\/notifications/);cases++
 state.mails=[];const literalSpace='A & B <Studio> "north"';await mail.sendBookingConfirmationEmail({to:'member@example.test',recipientName:'Member',audience:'member',spaceName:literalSpace,serviceName:null,whenAbsolute:'Fixture date',durationMinutes:60,otherPartyName:null,manageUrl:guest.manageUrl,icsBase64:null});const namedBooking=state.mails[0];assert.ok(namedBooking.html.includes('Session with A &amp; B &lt;Studio&gt; &quot;north&quot;'));assert.ok(!namedBooking.html.includes('Session with A &amp;amp;'));assert.ok(namedBooking.text.includes(literalSpace));assert.ok(!namedBooking.text.includes('&amp;'));assert.equal(namedBooking.to,'member@example.test');assert.equal(namedBooking.attachments?.length??0,0);cases++
 const shell=load('lib/email-studio/shell.ts'),postal=load('lib/email-studio/postal.ts')
 for(const address of [undefined,'','Client postal fixture']){const layout={rows:[{id:'fixture',columns:1,cells:[[{nid:'fixture-node',type:'text',content:{text:'Authored fixture body'}}]]}],bench:[]},before=JSON.stringify(layout);const result=shell.compileEmailDoc({layout,subject:'Fixture subject',preheader:'Fixture preview'},{brand:address===undefined?undefined:{wordmark:'Client',address},unsubscribeUrl:'https://frequencylocal.com/unsubscribe/fixture'});for(const s of parts(result)){assert.ok(s.includes(address||postal.PLATFORM_POSTAL_LINE));assert.ok(s.includes('Authored fixture body'));assert.ok(s.includes('/unsubscribe/fixture'))}assert.equal(JSON.stringify(layout),before);cases++}
 const colors={...load('lib/email-studio/render.ts').DEFAULT_EMAIL_COLORS,text:'#123456'};const custom=shell.emailDocumentShell({body:'<p>Client body</p>',brand:{wordmark:'Client',address:'Client postal fixture',colors}});assert.ok(custom.includes('#123456'),'Custom client palette must survive');cases++;
 const golden=JSON.parse(fs.readFileSync(path.join(root,'scripts/fixtures/email-node-render/legacy-golden.json'),'utf8'));assert.equal(golden.documents.length,19);const renderer=load('lib/email-studio/render.ts'),nodes=load('lib/entity-blocks/node-tree.ts');for(const doc of golden.documents){assert.equal(JSON.stringify(renderer.renderEmailLayout(doc.layout)),JSON.stringify(doc.output));assert.equal(JSON.stringify(renderer.renderEmailLayout(nodes.upgradeLayout(doc.layout))),JSON.stringify(doc.output));cases++;}
 return {cases,closure,scope:'Actual sender/orchestrator/notifier/Studio runtime with explicit inert transports. Full63focused assertions and19renderer equivalence remain separate mandatory gates.'}
}

import { readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
export function supplementalLifecycleConsequences() {
const read = (path) => readFileSync(path, 'utf8')
const product = read('components/admin/email-studio/product-picker.tsx')
const data = read('components/admin/email-studio/data-picker.tsx')
assert.doesNotMatch(`${product}\n${data}`, /so it never goes stale/, 'Send-time binding is not a freshness guarantee')
assert.match(product, /Review the selected item before sending/, 'Product preview requires review before sending')
assert.equal((data.match(/Review the selected item before sending/g) ?? []).length, 2, 'Both event and Circle previews carry the review instruction')
for (const key of ['event', 'circle']) assert.ok(data.includes(`refKey: '${key}'`), `Existing ${key} data binding remains intact`)
const preferences = read('app/manage-emails/manage-form.tsx')
assert.match(preferences, /Changes save automatically/, 'Preference persistence is described without an instant-success promise')
assert.doesNotMatch(preferences, /Changes save instantly|Changes save right away/)
assert.match(preferences, /setStates\(prev\)/, 'A refused preference change still restores the prior state')
const policy = read('app/space-email-policy/page.tsx')
assert.match(policy, /when its plan and settings allow it/, 'Custom identity remains conditional')
assert.match(policy, /verified inbox address/, 'Replies are not promised to an unverified inbox')
assert.match(policy, /Contacts you import start as not opted in/, 'Import remains distinct from marketing consent')
console.log('Email previews require review, preference errors preserve rollback, and sender identity remains conditional on eligibility and verification.')

}
if (invokedDirectly(import.meta.url)) {
 supplementalLifecycleConsequences()
 console.log(await emailConsequences(process.cwd()))
}
