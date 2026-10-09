import 'server-only'
import { Resend } from 'resend'

/** Provider-only attestation. No management action accepts a caller's verified flag. */
export async function retrieveEmailDomainVerification(providerId: string, domain: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Email domain verification is unavailable.')
  const { data, error } = await new Resend(key).domains.get(providerId)
  if (error || !data || data.name.toLowerCase() !== domain.toLowerCase())
    throw new Error('Email domain verification could not be confirmed.')
  return { sendingVerified: data.status === 'verified' && data.capabilities?.sending === 'enabled' }
}

/** Provision only after the caller's DNS ownership challenge has passed. */
export async function createEmailProviderDomain(domain: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('Email domain provisioning is unavailable.')
  const { data, error } = await new Resend(key).domains.create({ name: domain })
  if (error || !data || data.name.toLowerCase() !== domain.toLowerCase())
    throw new Error('Email domain provisioning needs reconciliation. Nothing is ready to send.')
  return { id: data.id, records: data.records }
}

export async function inspectEmailProviderDomain(providerId: string, domain: string) {
 const key=process.env.RESEND_API_KEY
 if(!key) throw new Error('Email domain verification is unavailable.')
 const {data,error}=await new Resend(key).domains.get(providerId)
 if(error||!data||data.name.toLowerCase()!==domain.toLowerCase()) throw new Error('Email domain verification could not be confirmed.')
 return data
}
export async function reconcileEmailProviderDomain(domain:string,since:string) {
 const key=process.env.RESEND_API_KEY
 if(!key) throw new Error('Email domain reconciliation is unavailable.')
 const client=new Resend(key); let after:string|undefined
 for(let page=0;page<20;page++) {
  const {data,error}=await client.domains.list({limit:100,...(after?{after}:{})})
  if(error||!data) throw new Error('Email domain reconciliation is unavailable.')
  const candidates=data.data.filter(d=>d.name.toLowerCase()===domain.toLowerCase()&&Date.parse(d.created_at)>=Date.parse(since)-60000)
  if(candidates.length===1) return {id:candidates[0].id}
  if(candidates.length>1) throw new Error('Email domain reconciliation needs support.')
  if(!data.has_more) return null
  after=data.data.at(-1)?.id
  if(!after) break
 }
 throw new Error('Email domain reconciliation needs support.')
}

export async function requestEmailProviderVerification(providerId:string) {
 const key=process.env.RESEND_API_KEY
 if(!key)throw new Error('Email domain verification is unavailable.')
 const {error}=await new Resend(key).domains.verify(providerId)
 if(error)throw new Error('Provider verification could not start. Check again shortly.')
}
