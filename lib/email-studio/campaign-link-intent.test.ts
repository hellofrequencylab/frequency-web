import { describe, expect, it, vi } from 'vitest'
import { auditCampaignLinkIntent, campaignLinkIntent } from './campaign-link-intent'

describe('campaign promise to destination audit', () => {
  it('flags the November 17 preview promise pointing into the live launch builder', () => {
    const result = auditCampaignLinkIntent({ subject: 'The launch is here', html: '<a href="https://frequencylocal.com/launch">See the launch</a>' })
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({ code: 'promise_destination_mismatch', promisedIntent: 'preview', destinationIntent: 'hosting', destinationPath: '/launch' })
    expect(result.findings[0].recommendation).toContain('preview')
  })

  it('finds November 12 preview mismatch in placed node content, without relying on the legacy map', () => {
    const result = auditCampaignLinkIntent({ layout: { rows: [{ cells: [[
      { nid: 'npreview', type: 'button', content: { label: 'Come preview it', url: '/create-a-space?utm_campaign=old' } },
    ]] }], bench: [] } })
    expect(result.findings[0]).toMatchObject({ promisedIntent: 'preview', destinationPath: '/create-a-space' })
  })

  it('reads only visible placed entries from a legacy content map', () => {
    const result = auditCampaignLinkIntent({ content: {
      rows: [{ cells: [['button', 'hiddenButton']] }], hidden: ['hiddenButton'],
      content: {
        button: { label: 'Explore Frequency', url: '/launch/start' },
        hiddenButton: { label: 'Come preview it', url: '/create-a-space' },
        benchedButton: { label: 'Come preview it', url: '/create-a-space' },
      },
    } })
    expect(result.links).toHaveLength(1)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].promisedIntent).toBe('explore')
  })

  it('supports a standalone legacy map, body HTML and plain/Markdown links', () => {
    const map = auditCampaignLinkIntent({ content: { button: { label: 'RSVP', url: '/launch' } } })
    expect(map.findings[0].promisedIntent).toBe('attend')
    const html = auditCampaignLinkIntent({ body: '<a href="/launch?x=1&amp;y=2"><strong>Come preview it</strong></a>' })
    expect(html.findings[0].destinationPath).toBe('/launch')
    const markdown = auditCampaignLinkIntent({ body: '[See the launch](/launch)' })
    expect(markdown.findings).toHaveLength(1)
    const plain = auditCampaignLinkIntent({ body: 'Come preview it\nhttps://frequencylocal.com/create-a-space' })
    expect(plain.findings).toHaveLength(1)
  })

  it('does not confuse an explicit hosting invitation or a real event link with a mismatch', () => {
    const host = auditCampaignLinkIntent({ subject: 'Come preview Frequency', html: '<a href="/create-a-space">Create your Space</a>' })
    expect(host.findings).toEqual([])
    const event = auditCampaignLinkIntent({ html: '<a href="/events/open-house">RSVP for the gathering</a>' })
    expect(event.findings).toEqual([])
    expect(campaignLinkIntent('https://outside.example/launch')).toBe('external')
    expect(campaignLinkIntent('https://frequencylocal.com.evil.example/launch')).toBe('external')
  })

  it('ignores hidden and benched node content, script text and inactive document maps', () => {
    const result = auditCampaignLinkIntent({
      layout: { rows: [{ cells: [[{ type: 'button', hidden: true, content: { label: 'See the launch', url: '/launch' } }]] }], bench: [{ type: 'button', content: { label: 'See the launch', url: '/launch' } }] },
      html: '<script>const example = \'<a href="/launch">See the launch</a>\'</script>',
    })
    expect(result.findings).toEqual([])
  })

  it('gives distinct opaque campaign UTMs without inventing labels or changing the source document', () => {
    const input = { campaignId: '8f030f11-dcaa-4ab8-a6b2-a7c8129dc481', html: '<a href="/launch?email=private@example.com&token=secret">See the launch</a>' }
    const before = JSON.stringify(input)
    const result = auditCampaignLinkIntent(input)
    expect(result.utmSuggestion).toMatchObject({ source: 'email', medium: 'email', campaignId: input.campaignId, distinctCampaignPerIntent: true })
    expect(JSON.stringify(result)).not.toContain('private@example.com')
    expect(JSON.stringify(result)).not.toContain('token=')
    expect(JSON.stringify(input)).toBe(before)
    expect(result).toEqual(auditCampaignLinkIntent(input))
  })

  it('stays bounded and total on malformed or cyclic local content without any network access', () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    expect(() => auditCampaignLinkIntent({ content: cycle, layout: null, body: '' })).not.toThrow()
    expect(auditCampaignLinkIntent({ body: 'x'.repeat(400_000) }).truncated).toBe(true)
    expect(campaignLinkIntent('javascript:alert(1)')).toBe('unsupported')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'))
    try {
      auditCampaignLinkIntent({ html: '<a href="https://outside.example/launch">See the launch</a>' })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally { fetchSpy.mockRestore() }
  })
})
