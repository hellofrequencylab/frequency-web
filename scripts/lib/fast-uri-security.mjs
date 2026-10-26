import assert from 'node:assert/strict'

// Synthetic in-process upstream advisory examples. No URL is fetched or rendered.
export function verifyEncodedScheme(uri) {
  for (const value of ['%6Aavascript:alert(1)', '%u006Aavascript:alert(1)']) {
    const parsed = uri.parse(value)
    assert.ok(parsed.error, 'Encoded schemes must be rejected, not promoted to a live scheme')
    assert.notEqual(parsed.scheme, 'javascript')
    assert.notEqual(uri.normalize(value), 'javascript:alert(1)')
  }
}
export function verifyHostCanonicalization(uri) {
  for (const value of ['http://a@b@evil.example/', 'http://exa\tmple.com/', 'http://exa\rmple.com/', 'http://exa\nmple.com/']) {
    assert.ok(uri.parse(value).error, 'Malformed authority must report an error instead of silently rewriting host')
  }
  assert.equal(uri.equal('http://exa\tmple.com/', 'http://example.com/'), false)
}
export function verifyRelativeReferences(uri) {
  const base = 'https://fixture.invalid/a/b/c/'
  for (const value of ['a/../b', '../x']) {
    assert.equal(uri.resolve(base, uri.normalize(value)), uri.resolve(base, value), 'Normalizing a relative reference must not redirect it to a different resource')
  }
}
export function verifySuffixColon(uri) {
  // The input is genuinely relative (no scheme member). An absolute javascript: URI
  // is not a relative reference and is not used as evidence of this patch.
  for (const scheme of ['javascript', 'data', 'vbscript']) {
    const result = uri.serialize({ path: `${scheme}:fixture` }, { reference: 'suffix' })
    assert.notEqual(uri.parse(result).scheme, scheme, 'A relative suffix must not become an absolute scheme')
    assert.match(result, /%3A/i)
  }
}
