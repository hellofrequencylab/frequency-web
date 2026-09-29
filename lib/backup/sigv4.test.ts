import { describe, it, expect } from 'vitest'
import { amzDate, encodeS3Key, EMPTY_PAYLOAD_SHA256, rfc3986, signSigV4, UNSIGNED_PAYLOAD } from '@/lib/backup/sigv4'

// HYG-144 (ADR-1636). The signer is pinned to AWS's own published SigV4 examples for S3
// (docs.aws.amazon.com, "Signature Calculations for the Authorization Header", examplebucket,
// 2013-05-24), so a wrong byte anywhere in the canonical request, the scope or the key derivation
// fails here against the reference, not against a value this code produced.

const CREDS = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }
const NOW = new Date('2013-05-24T00:00:00Z')

function sign(url: string, headers: Record<string, string> = {}) {
  return signSigV4({ method: 'GET', url, headers, payloadHash: EMPTY_PAYLOAD_SHA256, region: 'us-east-1', service: 's3', now: NOW }, CREDS)
}

describe('signSigV4 against the AWS reference examples', () => {
  it('GET Object with a Range header', () => {
    const h = sign('https://examplebucket.s3.amazonaws.com/test.txt', { Range: 'bytes=0-9' })
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
    expect(h['x-amz-date']).toBe('20130524T000000Z')
    expect(h['x-amz-content-sha256']).toBe(EMPTY_PAYLOAD_SHA256)
    expect(h.host).toBe('examplebucket.s3.amazonaws.com')
  })

  it('GET Bucket lifecycle: a query key with no value', () => {
    expect(sign('https://examplebucket.s3.amazonaws.com/?lifecycle').authorization).toMatch(
      /Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543$/,
    )
  })

  it('GET Bucket (list objects): query parameters sorted and encoded', () => {
    expect(sign('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J').authorization).toMatch(
      /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/,
    )
  })
})

describe('signSigV4 details the copy relies on', () => {
  it('defaults to UNSIGNED-PAYLOAD and signs every header it was given', () => {
    const h = signSigV4(
      {
        method: 'put',
        url: 'https://acct.r2.cloudflarestorage.com/b/k',
        headers: { 'Content-Length': '11', 'Content-Type': 'image/png' },
        region: 'auto',
        service: 's3',
        now: NOW,
      },
      CREDS,
    )
    expect(h['x-amz-content-sha256']).toBe(UNSIGNED_PAYLOAD)
    expect(h.authorization).toContain('/20130524/auto/s3/aws4_request')
    expect(h.authorization).toContain('SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date,')
  })

  it('a different secret gives a different signature', () => {
    const a = sign('https://examplebucket.s3.amazonaws.com/test.txt')
    const b = signSigV4(
      { method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', payloadHash: EMPTY_PAYLOAD_SHA256, region: 'us-east-1', service: 's3', now: NOW },
      { ...CREDS, secretAccessKey: 'x' },
    )
    expect(a.authorization).not.toBe(b.authorization)
  })
})

describe('encoding', () => {
  it('rfc3986 encodes what encodeURIComponent leaves', () => {
    expect(rfc3986("a b!'()*~._-")).toBe('a%20b%21%27%28%29%2A~._-')
  })

  it('encodeS3Key keeps the slashes and encodes each segment once', () => {
    expect(encodeS3Key('avatars/u 1/photo (1).png')).toBe('avatars/u%201/photo%20%281%29.png')
    expect(encodeS3Key('posts/é.jpg')).toBe('posts/%C3%A9.jpg')
  })

  it('amzDate is the basic ISO form with no milliseconds', () => {
    expect(amzDate(new Date('2026-09-29T05:20:01.123Z'))).toBe('20260929T052001Z')
  })
})
