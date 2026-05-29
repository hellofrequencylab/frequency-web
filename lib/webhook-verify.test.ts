import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyResendSignature } from '@/lib/webhook-verify'

const secret = 'whsec_' + Buffer.from('test-signing-key').toString('base64')

function sign(id: string, ts: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return `v1,${sig}`
}

describe('verifyResendSignature', () => {
  const id = 'msg_1'
  const ts = '1700000000'
  const body = '{"type":"email.delivered"}'

  it('accepts a correctly signed payload', () => {
    expect(verifyResendSignature(secret, id, ts, body, sign(id, ts, body))).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyResendSignature(secret, id, ts, '{"type":"email.bounced"}', sign(id, ts, body))).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const other = 'whsec_' + Buffer.from('other-key').toString('base64')
    expect(verifyResendSignature(other, id, ts, body, sign(id, ts, body))).toBe(false)
  })

  it('rejects a malformed header', () => {
    expect(verifyResendSignature(secret, id, ts, body, 'garbage')).toBe(false)
  })
})
