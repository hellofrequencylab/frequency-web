'use server'
import { ok,fail } from '@/lib/action-result'
import { prepareEmailDomainSetup,runSpaceEmailDomainProvisioning,checkEmailDomainSetup,chooseEmailDomainSender,useFrequencyEmailSender } from '@/lib/spaces/email-domain-onboarding'
async function result<T>(run:()=>Promise<T>){try{return ok(await run())}catch(error){return fail(error instanceof Error?error.message:'Email setup could not finish. Try again.')}}
export async function prepareEmailIdentity(spaceId:string,domain:string){return result(()=>prepareEmailDomainSetup(spaceId,domain))}
export async function provisionEmailIdentity(spaceId:string,domain:string,token:string){return result(()=>runSpaceEmailDomainProvisioning(spaceId,domain,token))}
export async function checkEmailIdentity(spaceId:string,domainId:string){return result(()=>checkEmailDomainSetup(spaceId,domainId))}
export async function saveEmailIdentity(spaceId:string,domainId:string,local:string,name:string,purpose:'conversation'|'marketing'|'operational'){return result(()=>chooseEmailDomainSender(spaceId,domainId,local,name,purpose))}
export async function resetEmailIdentity(spaceId:string,purpose:'conversation'|'marketing'|'operational'){return result(()=>useFrequencyEmailSender(spaceId,purpose))}
