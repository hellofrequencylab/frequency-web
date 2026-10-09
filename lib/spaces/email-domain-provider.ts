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
