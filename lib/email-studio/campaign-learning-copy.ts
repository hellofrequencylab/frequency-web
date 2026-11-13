// Reviewed, deterministic human-written templates. No model call, send, approval or database access.
import type { EntityLayout } from '@/lib/entity-blocks/layout'

type CampaignLearningStrategy = 'personal_preview' | 'host_followup'
interface CampaignLearningCopyInput {
  strategy: CampaignLearningStrategy
  targetCampaignId: string
  fromName: string
  siteUrl: string
  /** Optional, known recipient name. Otherwise the existing safe merge-tag fallback applies. */
  firstName?: string
  /** Set only when source analysis verified the invitation-to-builder mismatch. */
  acknowledgeMismatch?: boolean
}
interface CampaignLearningCopy {
  subject: string
  preheader: string
  /** Plain authored prose. The separate primary CTA is represented by destination and layout. */
  body: string
  layout: EntityLayout
  fromName: string
  replyMode: 'conversation'
  destination: string
  changes: string[]
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Host intent and audience consent must be verified by the caller; this helper never infers them. */
export function buildCampaignLearningCopy(input: CampaignLearningCopyInput): CampaignLearningCopy {
  if (input.strategy !== 'personal_preview' && input.strategy !== 'host_followup') throw new Error('Unknown campaign learning strategy.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.targetCampaignId)) throw new Error('A valid target campaign ID is required.')
  if (typeof input.fromName !== 'string' || !input.fromName.trim() || /[\r\n\u0000-\u001f\u007f]/.test(input.fromName)) throw new Error('A safe sender name is required.')
  const fromName = input.fromName.trim().replace(/\s+/g, ' ').slice(0, 100)
  const site = new URL(input.siteUrl)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname)
  if (site.username || site.password || (site.protocol !== 'https:' && !(site.protocol === 'http:' && local))) throw new Error('Use a secure site origin.')
  const personal = input.strategy === 'personal_preview'
  const destination = new URL(personal ? '/events' : '/create-a-space', site.origin)
  destination.searchParams.set('utm_source', 'frequency')
  destination.searchParams.set('utm_medium', 'email')
  destination.searchParams.set('utm_campaign', input.targetCampaignId)
  destination.searchParams.set('utm_content', personal ? 'community_preview' : 'host_followup')
  const knownName = typeof input.firstName === 'string' ? input.firstName.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) : ''
  const greeting = `Hi ${knownName || '{{contact.first_name}}'},`
  const subject = personal ? 'Come have a look around' : 'A home for what you bring together'
  const preheader = personal
    ? 'You do not need to build a Space to find a gathering.'
    : 'Explore the Space builder and review the next step.'
  const paragraphs = personal ? [
    greeting,
    'I wanted to make it easy to have a look around Frequency.',
    ...(input.acknowledgeMismatch ? ["My last email invited you to have a look at Frequency, then the link asked you to build a Space. That's a different job."] : []),
    "You don't need to build anything to come along. You can browse the gatherings, open one that interests you, and check the date, place and details before deciding whether to join.",
    "If nothing fits, reply and tell me what you'd make time for. I'd like to hear.",
    fromName,
  ] : [
    greeting,
    "If you are interested in bringing people together, you can take a look at the Space builder.",
    'Add your business name and what you offer. Review what you enter before choosing your next step.',
    "If you'd rather talk it through, reply and tell me what you're putting together.",
    fromName,
  ]
  const body = paragraphs.join('\n\n')
  const layout: EntityLayout = {
    rows: [
      { id: 'r0', columns: 1, cells: [['displayHeading']] },
      { id: 'r1', columns: 1, cells: [['prose']] },
      { id: 'r2', columns: 1, cells: [['button']] },
    ],
    content: {
      displayHeading: { text: subject },
      prose: { text: escapeHtml(body).replace(/\n/g, '<br>') },
      button: { label: personal ? 'See the gatherings' : 'Explore the Space builder', url: destination.toString(), align: 'center' },
    },
  }
  return {
    subject, preheader, body, layout, fromName, replyMode: 'conversation', destination: destination.toString(),
    changes: personal ? [
      input.acknowledgeMismatch ? 'Acknowledge the verified invitation-to-builder mismatch without inventing a recipient history.' : 'Use a warm personal invitation without assuming prior contact or a prior mismatch.',
      'Give members a public gathering-browse destination instead of a business-building task.',
      'Use a personal reply invitation and campaign-level attribution without contact data in the URL.',
    ] : [
      'Use only for confirmed host intent; the caller must verify audience eligibility and consent.',
      'Offer the existing Space builder without a price, deadline, privacy or publishing promise.',
      'Keep a conversational reply path and separate host-followup attribution.',
    ],
  }
}
