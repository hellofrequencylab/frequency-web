import { buildTrackedUrl } from '@/lib/growth/link-compose'

// UTM FOR CAMPAIGN LINKS (EMAIL-036). Every link in a sent campaign that points back at this site gets
// utm_source=frequency, utm_medium=email and utm_campaign=<campaign>, so the first-touch capture
// (lib/attribution/first-touch) can say which email brought a visit. Links to other sites are left alone (a
// partner does not need our tags), as are the unsubscribe and manage-emails links (they carry tokens and a
// changed URL there is only noise). A utm_* the author typed by hand is never overwritten (buildTrackedUrl).

const OWN_ONLY_PATH = /\/(unsubscribe|manage-emails)(\/|\?|$)/

export function appendUtm(html: string, opts: { siteUrl: string; campaign: string }): string {
  let origin: string
  try {
    origin = new URL(opts.siteUrl).origin
  } catch {
    return html
  }
  const utm = { source: 'frequency', medium: 'email', campaign: opts.campaign, term: '', content: '' }
  return html.replace(/(\shref=")([^"]+)(")/gi, (whole, open: string, href: string, close: string) => {
    // The attribute was HTML-escaped when built, so an `&amp;` in the query is a literal `&`.
    const raw = href.replace(/&amp;/g, '&')
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return whole
    }
    if (url.origin !== origin || OWN_ONLY_PATH.test(url.pathname + url.search)) return whole
    return `${open}${buildTrackedUrl(raw, utm).replace(/&/g, '&amp;')}${close}`
  })
}

/** Delivery attribution uses the opaque database UUID, never a subject or audience label. */
export function appendCampaignUtm(html: string, opts: { siteUrl: string; campaignId: string }): string {
  const campaign = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.campaignId) ? opts.campaignId : ''
  return appendUtm(html, { siteUrl: opts.siteUrl, campaign })
}
