// Google Wallet "Add to Wallet" pass for a member's profile code (ADR-107).
// Dependency-free: we sign the Save-to-Wallet JWT (RS256) with node:crypto, so no
// new package. The pass is a Generic card carrying the member's connect QR.
//
// CONFIG-GATED. Inert until these env vars are set (so it ships safely dark):
//   GOOGLE_WALLET_ISSUER_ID      — numeric issuer id from the Google Wallet console
//   GOOGLE_WALLET_SA_EMAIL       — service-account client_email
//   GOOGLE_WALLET_SA_PRIVATE_KEY — service-account private key (PEM; \n-escaped ok)
// When any is missing, isGoogleWalletConfigured() is false and callers render/return
// nothing. NOTE: end-to-end signing can't be verified without real credentials.

import { createSign } from 'node:crypto'

interface PassMember {
  /** Stable per-member suffix for the wallet object id. */
  profileId: string
  handle: string
  displayName: string
  /** Absolute connect URL the pass QR encodes. */
  url: string
}

export function isGoogleWalletConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_WALLET_SA_EMAIL &&
      process.env.GOOGLE_WALLET_SA_PRIVATE_KEY,
  )
}

/** Build the https://pay.google.com/gp/v/save/<jwt> link, or null if unconfigured. */
export function buildGoogleWalletSaveUrl(member: PassMember): string | null {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID
  const saEmail = process.env.GOOGLE_WALLET_SA_EMAIL
  const rawKey = process.env.GOOGLE_WALLET_SA_PRIVATE_KEY
  if (!issuerId || !saEmail || !rawKey) return null
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const classId = `${issuerId}.frequency_connect`
  // Object id must be unique + stable per member; ids are [a-zA-Z0-9._-] only.
  const objectId = `${issuerId}.connect_${member.profileId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const genericClass = { id: classId }
  const genericObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    cardTitle: { defaultValue: { language: 'en', value: 'Frequency' } },
    header: { defaultValue: { language: 'en', value: member.displayName || `@${member.handle}` } },
    subheader: { defaultValue: { language: 'en', value: `@${member.handle}` } },
    hexBackgroundColor: '#0f172a',
    barcode: { type: 'QR_CODE', value: member.url, alternateText: `@${member.handle}` },
  }

  const claims = {
    iss: saEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: { genericClasses: [genericClass], genericObjects: [genericObject] },
  }

  const jwt = signRs256(claims, privateKey)
  return `https://pay.google.com/gp/v/save/${jwt}`
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

function signRs256(claims: object, privateKey: string): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const signingInput = `${header}.${body}`
  const signature = createSign('RSA-SHA256').update(signingInput).end().sign(privateKey).toString('base64url')
  return `${signingInput}.${signature}`
}
