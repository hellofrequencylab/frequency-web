// Pure helpers for scripts/check-mail-dns.mjs.
//
// They live here rather than in the script because the script performs DNS at module load, which
// makes it unimportable from a test. These two carry the whole of its judgement — what counts as a
// matching host, and how strong a DKIM key is — so they are exactly the parts that should be pinned
// by tests rather than by my say-so. See scripts/mail-dns-lib.test.ts.

import { Buffer } from 'node:buffer'

/**
 * Is `host` exactly `suffix`, or a subdomain of it?
 *
 * 🔴 NOT a regex, deliberately, and CodeQL caught me doing it the other way in this very file
 * (alert 250, "missing regular expression anchor", on the first version of spfAuthorises). An
 * unanchored host pattern is a real hole rather than a style nit: `/amazonses\.com$/` is satisfied
 * by `evil-amazonses.com`, and `include:amazonses.com` matched inside a record is satisfied by
 * `include:amazonses.com.attacker.example`. Both would make this checker report a hostile sender as
 * authorised. Compare labels, not substrings.
 */
export function isHostOrSubdomainOf(host, suffix) {
  const h = String(host).toLowerCase().replace(/\.$/, '')
  const s = String(suffix).toLowerCase().replace(/\.$/, '')
  return h === s || h.endsWith(`.${s}`)
}

/**
 * RSA modulus size of a base64 SubjectPublicKeyInfo, in bits.
 *
 * Derived rather than pattern-matched. The backlog previously read the bit length off the base64
 * PREFIX ('MIGf' = 1024, 'MIIBIjAN' = 2048), which is true today and is still a fingerprint rather
 * than a measurement — it would silently mis-report any key whose encoding shifted. Parse the DER
 * instead: walk to the BIT STRING, then read the modulus INTEGER's length, dropping the leading
 * sign byte DER adds when the high bit is set.
 */
export function rsaBits(p) {
  try {
    const der = Buffer.from(p, 'base64')
    // Find the RSAPublicKey SEQUENCE inside the BIT STRING: scan for the modulus INTEGER (0x02).
    let i = der.indexOf(0x03) // BIT STRING
    if (i < 0) return null
    // Skip BIT STRING header + unused-bits byte, then the inner SEQUENCE header.
    i += 1
    let len = der[i]
    i += len & 0x80 ? 1 + (len & 0x7f) : 1
    i += 1 // unused-bits
    if (der[i] !== 0x30) return null
    i += 1
    len = der[i]
    i += len & 0x80 ? 1 + (len & 0x7f) : 1
    if (der[i] !== 0x02) return null
    i += 1
    len = der[i]
    let modLen
    if (len & 0x80) {
      const n = len & 0x7f
      modLen = 0
      for (let k = 1; k <= n; k++) modLen = (modLen << 8) | der[i + k]
      i += 1 + n
    } else {
      modLen = len
      i += 1
    }
    if (der[i] === 0x00) modLen -= 1 // DER sign byte
    return modLen * 8
  } catch {
    return null
  }
}
