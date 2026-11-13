// Bounded behavioral proof over real pure modules. No provider, database, send or nested test runner.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/campaign-learning.mjs
import assert from 'node:assert/strict'

const previousFetch = globalThis.fetch
globalThis.fetch = () => { throw new Error('Campaign learning probe must stay offline') }
try {
  const { buildCampaignLearningCopy } = await import('../../lib/email-studio/campaign-learning-copy.ts')
  const { auditCampaignLinkIntent, campaignLinkIntent } = await import('../../lib/email-studio/campaign-link-intent.ts')
  const previewId = '85ca4b8c-1cee-46d5-a092-499f54e8600e'
  const hostId = 'bfdf66bf-6903-4676-9c17-d4996349cc40'
  const base = { fromName: 'Daniel', siteUrl: 'https://frequencylocal.com' }
  const preview = buildCampaignLearningCopy({ ...base, strategy: 'personal_preview', targetCampaignId: previewId })
  const host = buildCampaignLearningCopy({ ...base, strategy: 'host_followup', targetCampaignId: hostId })
  const previewUrl = new URL(preview.destination)
  const hostUrl = new URL(host.destination)

  assert.equal(previewUrl.pathname, '/events', 'A participant preview must open public gathering discovery, not a builder')
  assert.equal(campaignLinkIntent(preview.destination), 'attendance')
  assert.equal(hostUrl.pathname, '/create-a-space', 'Explicit hosting follow-up must name the existing builder honestly')
  assert.equal(campaignLinkIntent(host.destination), 'hosting')
  assert.equal(previewUrl.searchParams.get('utm_campaign'), previewId)
  assert.equal(hostUrl.searchParams.get('utm_campaign'), hostId)
  assert.notEqual(previewUrl.searchParams.get('utm_campaign'), hostUrl.searchParams.get('utm_campaign'), 'Separate campaigns need separate attribution')
  assert.equal(previewUrl.searchParams.get('utm_content'), 'community_preview')
  assert.equal(hostUrl.searchParams.get('utm_content'), 'host_followup')
  for (const url of [previewUrl, hostUrl]) {
    assert.equal(url.searchParams.get('utm_medium'), 'email')
    assert.deepEqual([...url.searchParams.keys()].sort(), ['utm_campaign', 'utm_content', 'utm_medium', 'utm_source'])
  }
  assert.equal(preview.layout.content.button.url, preview.destination, 'Rendered native CTA must use the reviewed destination')
  assert.equal(host.layout.content.button.url, host.destination)
  assert.equal(preview.replyMode, 'conversation')
  assert.deepEqual(buildCampaignLearningCopy({ ...base, strategy: 'personal_preview', targetCampaignId: previewId }), preview, 'Review copy must be deterministic')

  const input = {
    campaignId: previewId,
    subject: 'Come preview Frequency',
    html: '<a href="/create-a-space?email=private@example.test&amp;token=secret">Come have a look around</a><a href="/help">Help</a><a href="/privacy">Privacy</a>',
  }
  const before = JSON.stringify(input)
  const audit = auditCampaignLinkIntent(input)
  assert.equal(audit.findings.length, 1, 'A broad preview invitation that routes to the builder needs one actionable warning')
  assert.equal(audit.findings[0].code, 'promise_destination_mismatch')
  assert.equal(audit.findings[0].destinationIntent, 'hosting')
  assert.ok(['preview', 'explore'].includes(audit.findings[0].promisedIntent))
  assert.equal(audit.utmSuggestion.distinctCampaignPerIntent, true)
  assert.equal(campaignLinkIntent('/help'), 'unknown', 'A utility link is not a measured attendance or hosting outcome')
  assert.equal(campaignLinkIntent('/privacy'), 'unknown')
  assert.equal(campaignLinkIntent('https://frequencylocal.com.evil.example/events'), 'external')
  assert.ok(!JSON.stringify(audit).includes('private@example.test') && !JSON.stringify(audit).includes('token='), 'Review evidence must not copy private tracking query values')
  assert.equal(JSON.stringify(input), before, 'Auditing cannot mutate authored campaign content')
  assert.throws(() => buildCampaignLearningCopy({ ...base, strategy: 'personal_preview', targetCampaignId: previewId, siteUrl: 'https://user:secret@frequencylocal.com' }))
  console.log('Campaign learning proof passed: honest preview/host destinations, distinct campaign attribution, native CTA parity, deterministic review, builder-mismatch detection and utility/privacy boundaries.')
} finally {
  globalThis.fetch = previousFetch
}
