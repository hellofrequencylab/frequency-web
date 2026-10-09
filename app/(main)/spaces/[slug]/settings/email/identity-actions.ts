'use server'
import { ok,fail } from '@/lib/action-result'
import { requireSpaceEmailIdentityOwner } from '@/lib/spaces/email-identity-registry'
import { prepareEmailDomainSetup,runSpaceEmailDomainProvisioning,checkEmailDomainSetup,chooseEmailDomainSender,useFrequencyEmailSender } from '@/lib/spaces/email-domain-onboarding'
async function assertOwner(spaceId:string,requirePaid=true){return requireSpaceEmailIdentityOwner(spaceId,requirePaid)}
async function result<T>(run:()=>Promise<T>){try{return ok(await run())}catch(error){return fail(error instanceof Error?error.message:'Email setup could not finish. Try again.')}}
export async function prepareEmailIdentity(spaceId:string,domain:string){return result(async()=>{await assertOwner(spaceId);return prepareEmailDomainSetup(spaceId,domain)})}
export async function provisionEmailIdentity(spaceId:string,domain:string,token:string){return result(async()=>{await assertOwner(spaceId);return runSpaceEmailDomainProvisioning(spaceId,domain,token)})}
export async function checkEmailIdentity(spaceId:string,domainId:string){return result(async()=>{await assertOwner(spaceId);return checkEmailDomainSetup(spaceId,domainId)})}
export async function saveEmailIdentity(spaceId:string,domainId:string,local:string,name:string,purpose:'conversation'|'marketing'|'operational'){return result(async()=>{await assertOwner(spaceId);return chooseEmailDomainSender(spaceId,domainId,local,name,purpose)})}
export async function resetEmailIdentity(spaceId:string,purpose:'conversation'|'marketing'|'operational'){return result(async()=>{await assertOwner(spaceId,false);return useFrequencyEmailSender(spaceId,purpose)})}
