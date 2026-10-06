// THE DOMAIN CONNECT SIGNER (LIVE-780). A DNS provider only applies Frequency's template from a
// synchronous apply URL whose query string is signed with Frequency's private key; it checks the
// signature against the public key published as a TXT record at `_dck1.frequencylocal.com`. Signing
// is what lets the template carry variables (the IP and the www target) without anyone being able to
// swap them for their own.
//
// Server-only (node:crypto). Never throws to a caller and never logs key material: a missing or bad
// key reads as "not configured", and the Domain section falls back to the copy-records steps.

import { createPrivateKey, createPublicKey, createSign, createVerify, type KeyObject } from 'node:crypto'
import { DC_PRIVATE_KEY_ENV } from './constants'

/** Read the PEM private key from env, or null when it is absent or unreadable. Accepts a PEM with
 *  real newlines or with `\n` escapes (how a multi-line value often lands in a hosting dashboard). */
export function loadSigningKey(raw: string | undefined = process.env[DC_PRIVATE_KEY_ENV]): KeyObject | null {
  const pem = raw?.trim().replace(/\\n/g, '\n')
  if (!pem) return null
  try {
    const key = createPrivateKey(pem)
    return key.asymmetricKeyType === 'rsa' ? key : null
  } catch {
    return null
  }
}

/** Sign a query string (everything before `&sig=`) with RSA-SHA256, base64 encoded as the spec asks. */
export function signQuery(query: string, privateKey: KeyObject): string {
  return createSign('RSA-SHA256').update(query).sign(privateKey, 'base64')
}

/** Check a signature the way a DNS provider does. Used by tests; never throws. */
export function verifyQuery(query: string, signature: string, publicKey: KeyObject | string): boolean {
  try {
    return createVerify('RSA-SHA256').update(query).verify(publicKey, signature, 'base64')
  } catch {
    return false
  }
}

/** The TXT record values to publish at `_dck1.<syncPubKeyDomain>` for a public key, in Domain
 *  Connect's format: `p=<part>,a=RS256,d=<base64 DER chunk>`. A long key is split across several
 *  TXT records so each stays under the 255 character string limit. */
export function publicKeyTxtRecords(publicKey: KeyObject | string, chunk = 200): string[] {
  const key = typeof publicKey !== 'string' && publicKey.type === 'public' ? publicKey : createPublicKey(publicKey)
  const der = key.export({ type: 'spki', format: 'der' }).toString('base64')
  const parts: string[] = []
  for (let i = 0; i < der.length; i += chunk) parts.push(der.slice(i, i + chunk))
  return parts.map((d, i) => `p=${i + 1},a=RS256,d=${d}`)
}
