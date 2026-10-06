import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadSigningKey, publicKeyTxtRecords, signQuery, verifyQuery } from './signer'

// A throwaway key pair for this suite only; nothing here is a real Frequency key.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

describe('loadSigningKey', () => {
  it('is null when the env value is absent or empty', () => {
    expect(loadSigningKey(undefined)).toBeNull()
    expect(loadSigningKey('   ')).toBeNull()
  })

  it('is null for a value that is not a PEM key, without throwing', () => {
    expect(loadSigningKey('not a key')).toBeNull()
  })

  it('reads a PEM with real newlines or with escaped ones', () => {
    expect(loadSigningKey(privatePem)?.asymmetricKeyType).toBe('rsa')
    expect(loadSigningKey(privatePem.replace(/\n/g, '\\n'))?.asymmetricKeyType).toBe('rsa')
  })

  it('refuses a non-RSA key', () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
    expect(loadSigningKey(ec.export({ type: 'pkcs8', format: 'pem' }).toString())).toBeNull()
  })
})

describe('signQuery / verifyQuery', () => {
  it('produces a signature the public key verifies', () => {
    const key = loadSigningKey(privatePem)!
    const query = 'domain=example.com&ip=76.76.21.21&target=cname.vercel-dns.com'
    const sig = signQuery(query, key)
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(verifyQuery(query, sig, publicKey)).toBe(true)
  })

  it('fails verification when the query is changed', () => {
    const key = loadSigningKey(privatePem)!
    const sig = signQuery('domain=example.com&ip=76.76.21.21', key)
    expect(verifyQuery('domain=example.com&ip=6.6.6.6', sig, publicKey)).toBe(false)
  })

  it('fails verification against a different key', () => {
    const key = loadSigningKey(privatePem)!
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
    expect(verifyQuery('a=1', signQuery('a=1', key), other)).toBe(false)
  })
})

describe('publicKeyTxtRecords', () => {
  it('splits the DER public key into numbered RS256 records that join back to the key', () => {
    const records = publicKeyTxtRecords(publicKey)
    expect(records.length).toBeGreaterThan(1)
    records.forEach((r, i) => {
      expect(r.startsWith(`p=${i + 1},a=RS256,d=`)).toBe(true)
      expect(r.length).toBeLessThanOrEqual(255)
    })
    const der = records.map((r) => r.split(',d=')[1]).join('')
    expect(der).toBe(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))
  })
})
