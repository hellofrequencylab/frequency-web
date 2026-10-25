import { beforeEach,describe,expect,it,vi } from 'vitest'
import type { EmailPayload } from './email'
const state=vi.hoisted(()=>({mails:[] as EmailPayload[]}))
vi.mock('@/lib/queue/outbox',()=>({enqueue:async(kind:string,payload:EmailPayload)=>{if(kind==='email')state.mails.push(payload)}}))
vi.mock('@/lib/suppression',()=>({isSuppressed:async()=>false}))
vi.mock('@/lib/unsubscribe-tokens',()=>({buildUnsubscribeUrl:()=> 'https://frequencylocal.com/unsubscribe/synthetic'}))
vi.mock('@/lib/notifications/router',()=>({routeNotification:async()=>({sent:true})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
 auth:{admin:{getUserById:async()=>({data:{user:{email:'synthetic-member@example.test'}}})}},
 from:(table:string)=>{const q={select:()=>q,eq:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='profiles'?{display_name:'Synthetic member',auth_user_id:'synthetic-auth'}:{timezone:'UTC'},error:null})};return q},
})}))
import { sendScanIntroEmail,sendSignupRecoveryEmail,sendBookingConfirmationEmail,sendBookingCancelledEmail } from './email'
import { notifyBookingConfirmed,notifyBookingCancelled } from './spaces/booking-notify'
const one=()=>{expect(state.mails).toHaveLength(1);return state.mails[0]}
const guest={name:'Synthetic guest',email:'synthetic-guest@example.test',manageUrl:'https://customer.example.test/book'}
const ctx={bookingId:'synthetic-booking',spaceId:'synthetic-space',spaceSlug:'synthetic-space',spaceName:'Synthetic Space & Studio',ownerProfileId:null,memberProfileId:null,memberName:null,guest,startsAt:'2026-10-29T18:00:00Z',endsAt:'2026-10-29T19:00:00Z',serviceName:'Synthetic session'}
beforeEach(()=>{state.mails=[]})
describe('email relationship and opt-out scope',()=>{
 it('missing inviter name uses an accurate sender relationship and retains contact opt-out',async()=>{
  const unsubscribeUrl='https://frequencylocal.com/u/scan?c=synthetic-contact&t=synthetic-token'
  await sendScanIntroEmail({to:guest.email,recipientName:guest.name,inviterName:'',joinUrl:'https://frequencylocal.com/q/synthetic',unsubscribeUrl})
  const mail=one();for(const part of [mail.html,mail.text??'']){expect(part).toContain('Someone on Frequency');expect(part).not.toContain('A friend');expect(part).toContain(unsubscribeUrl)}
 })
 it('scan invitation keeps its contact-scoped opt-out without a universal silence promise or member controls',async()=>{
  const unsubscribeUrl='https://frequencylocal.com/u/scan?c=synthetic-contact&t=synthetic-token'
  await sendScanIntroEmail({to:guest.email,recipientName:guest.name,inviterName:'Synthetic inviter',joinUrl:'https://frequencylocal.com/q/synthetic',unsubscribeUrl})
  const mail=one();for(const part of [mail.html,mail.text??'']){expect(part).toContain(unsubscribeUrl);expect(part).not.toMatch(/never hear from us|won.t hear from us again/);expect(part).toContain('follow-up emails')}
  expect(mail.html).not.toContain('/settings/notifications');expect(mail.html).not.toContain('Your friend');expect(mail.headers?.['List-Unsubscribe']).toBe(`<${unsubscribeUrl}>`)
 })
 it('unfinished signup renders the recovery link without account-only unsubscribe settings',async()=>{
  await sendSignupRecoveryEmail({to:guest.email,firstName:guest.name,resumeUrl:'https://frequencylocal.com/join?seq=synthetic'})
  const mail=one();expect(mail.html).toContain('/join?seq=synthetic');expect(mail.html).not.toContain('/settings/notifications');expect(mail.html).not.toContain('you joined Frequency');expect(mail.text).toContain('One note, sent once')
 })
 it('actual confirmed guest booking notifier renders a guest-safe footer, original website destination and calendar attachment',async()=>{
  await notifyBookingConfirmed(ctx);const mail=one();expect(mail.to).toBe(guest.email);expect(mail.html).toContain('This email is about your booking with Synthetic Space &amp; Studio.');expect(mail.html).not.toContain('you joined Frequency');expect(mail.html).not.toContain('/settings/notifications');expect(mail.html).toContain(guest.manageUrl);expect(mail.attachments).toHaveLength(1);expect(mail.attachments?.[0].filename).toBe('booking.ics')
 })
 it('actual cancelled guest booking notifier keeps the existing recipient and website link without a membership assertion',async()=>{
  await notifyBookingCancelled(ctx,null);const mail=one();expect(mail.to).toBe(guest.email);expect(mail.html).toContain('This email is about your booking with Synthetic Space &amp; Studio.');expect(mail.html).not.toContain('you joined Frequency');expect(mail.html).not.toContain('/settings/notifications');expect(mail.html).toContain(guest.manageUrl);expect(mail.text).toContain('cancelled')
 })
 for(const cancelled of [false,true])it(`existing account ${cancelled?'cancellation':'confirmation'} keeps its preference controls`,async()=>{
  const p={to:'synthetic-member@example.test',recipientName:'Synthetic member',audience:'member' as const,spaceName:ctx.spaceName,serviceName:ctx.serviceName,whenAbsolute:'Synthetic date'}
  if(cancelled)await sendBookingCancelledEmail({...p,reason:null,bookUrl:'https://frequencylocal.com/spaces/synthetic/book'})
  else await sendBookingConfirmationEmail({...p,durationMinutes:60,otherPartyName:'Synthetic host',manageUrl:'https://frequencylocal.com/spaces/synthetic/book',icsBase64:null})
  const mail=one();expect(mail.html).toContain('/settings/notifications');expect(mail.html).toContain('you joined Frequency')
 })
})
