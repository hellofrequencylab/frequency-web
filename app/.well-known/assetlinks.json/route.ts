// GET /.well-known/assetlinks.json (LIVE-714): Android App Links, for the later Android build.
// The signing-cert SHA-256 fingerprints come from ANDROID_SHA256_FINGERPRINTS (comma separated).
// Unset, the body is an empty list, which Android reads as "this site verifies no app".

export const dynamic = 'force-dynamic'

const PACKAGE_NAME = 'com.frequency.app'
const FINGERPRINT_SHAPE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

/** The statement list for an environment. */
function assetLinks(env: Record<string, string | undefined> = process.env) {
  const fingerprints = (env.ANDROID_SHA256_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT_SHAPE.test(f))
  if (!fingerprints.length) return []
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
    },
  ]
}

export function GET() {
  return new Response(JSON.stringify(assetLinks()), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  })
}
