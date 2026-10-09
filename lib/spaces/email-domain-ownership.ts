import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import { signingSecret } from '@/lib/signing-secret'
const MAX_AGE = 60 * 60 * 1000
const mac = (body: string) => createHmac('sha256', signingSecret('email-domain-ownership', ['CONVERSATION_TOKEN_SECRET']))
  .update(`email-domain-ownership:${body}`).digest('hex')
export function emailOwnershipChallenge(spaceId: string, ownerId: string, domain: string, now = Date.now(), operation?: { id: string; nonce: string }) {
  const body = Buffer.from(JSON.stringify({ spaceId, ownerId, domain, issuedAt: now, operationId: operation?.id ?? null, nonce: operation?.nonce ?? randomUUID() })).toString('base64url')
  const token = `${body}.${mac(body)}`
  const value = `frequency-email=${token}`
  const segments = value.match(/.{1,200}/g) ?? []
  return { token, segments, name: `_frequency-email.${domain}`, type: 'TXT' as const, value: `frequency-email=${token}`, expiresAt: new Date(now + MAX_AGE).toISOString() }
}
export async function verifyEmailDomainOwnership(spaceId: string, ownerId: string, domain: string, token: string, now = Date.now(), operation?: { id: string; nonce: string }) {
  if (token.length > 2048) throw new Error('Email domain ownership proof is invalid.')
  const parts = token.split('.')
  if (parts.length !== 2 || !/^[0-9a-f]{64}$/.test(parts[1])) throw new Error('Email domain ownership proof is invalid.')
  if (!timingSafeEqual(Buffer.from(parts[1], 'hex'), Buffer.from(mac(parts[0]), 'hex'))) throw new Error('Email domain ownership proof is invalid.')
  const state = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  if (state.spaceId !== spaceId || state.ownerId !== ownerId || state.domain !== domain ||
    (operation && (state.operationId !== operation.id || state.nonce !== operation.nonce)) ||
    !Number.isFinite(state.issuedAt) || state.issuedAt > now || now - state.issuedAt > MAX_AGE)
    throw new Error('Email domain ownership proof expired or belongs to another Space.')
  let records: string[][]
  try { records = await resolveTxt(`_frequency-email.${domain}`) } catch { throw new Error('Ownership TXT record is not visible yet. Check again after DNS updates.') }
  if (!records.some((parts) => parts.join('') === `frequency-email=${token}`))
    throw new Error('Ownership TXT record is not visible yet. Check again after DNS updates.')
}
