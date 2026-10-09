import type { emailDomainDnsInstructions } from './email-domain-dns'
/** The durable provider boundary. Dependencies are server adapters; queue/UI input is never an operation. */
export type EmailDomainOperation = { id: string; domain: string; mode: 'create'|'persist'|'reconcile'|'busy'; provider_domain_id?: string|null; started_at: string }
export async function advanceEmailDomainOperation(op: EmailDomainOperation, deps: {
 create(domain: string): Promise<{id:string}>
 reconcile(domain: string, since: string): Promise<{id:string}|null>
 remember(id: string): Promise<void>
 persist(id: string): Promise<{domainId:string; dns:ReturnType<typeof emailDomainDnsInstructions>}>
 complete(): Promise<void>
 releaseUncertain(): Promise<void>
}) {
 if(op.mode==='busy') throw new Error('Email setup is already running. Check again shortly.')
 try {
  const provider = op.provider_domain_id ? {id:op.provider_domain_id} : op.mode==='create'
   ? await deps.create(op.domain) : await deps.reconcile(op.domain,op.started_at)
  if(!provider) throw new Error('The last provider request needs reconciliation. Check again; do not create another domain.')
  // Save provider identity before the registry write; failures replay persistence rather than create.
  await deps.remember(provider.id)
  const result=await deps.persist(provider.id)
  await deps.complete()
  return result
 } catch(error) {
  try { await deps.releaseUncertain() } catch { /* Lease expires; future claim reconciles, never repeats create. */ }
  throw error
 }
}
