import { CheckCircle2, Info, AlertTriangle } from 'lucide-react'

// The result banner shown on My Contacts after returning from the Google contacts import (ADR-374).
// Server-rendered, driven purely by the ?import= query the callback redirects with, so it clears on the
// next navigation (no dismiss state needed). Copy is plain, gives the next step, no narrated feelings,
// no em dashes (CONTENT-VOICE §10). Semantic tokens only.

export type GoogleImportOutcome = 'done' | 'cancelled' | 'error' | 'unavailable'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function resolve(
  outcome: GoogleImportOutcome,
  added: number,
  skipped: number,
): { tone: 'success' | 'warning' | 'neutral'; title: string; body: string } {
  switch (outcome) {
    case 'done':
      if (added > 0) {
        return {
          tone: 'success',
          title: `Imported ${plural(added, 'contact', 'contacts')} from Google.`,
          body:
            skipped > 0
              ? `${plural(skipped, 'contact was', 'contacts were')} already saved, so we skipped those. The rest are in My Contacts now.`
              : 'They are in My Contacts now.',
        }
      }
      if (skipped > 0) {
        return {
          tone: 'neutral',
          title: 'Your Google contacts are already here.',
          body: `Nothing new to add. ${plural(skipped, 'contact was', 'contacts were')} already in your book.`,
        }
      }
      return {
        tone: 'neutral',
        title: 'No contacts found to import.',
        body: 'We did not find any contacts on that Google account.',
      }
    case 'cancelled':
      return { tone: 'neutral', title: 'Google import cancelled.', body: 'No contacts were added.' }
    case 'unavailable':
      return {
        tone: 'neutral',
        title: 'Google import is not set up yet.',
        body: 'Check back soon.',
      }
    case 'error':
    default:
      return {
        tone: 'warning',
        title: 'We could not finish the Google import.',
        body: 'Please try connecting again.',
      }
  }
}

const TONE = {
  success: { wrap: 'border-success/50 bg-success-bg/30', icon: 'text-success', Icon: CheckCircle2 },
  warning: { wrap: 'border-warning/50 bg-warning-bg/30', icon: 'text-warning', Icon: AlertTriangle },
  neutral: { wrap: 'border-border-strong bg-surface', icon: 'text-muted', Icon: Info },
} as const

export function GoogleImportBanner({
  outcome,
  added = 0,
  skipped = 0,
}: {
  outcome: GoogleImportOutcome
  added?: number
  skipped?: number
}) {
  const { tone, title, body } = resolve(outcome, added, skipped)
  const { wrap, icon, Icon } = TONE[tone]
  return (
    <div className={`mb-4 rounded-2xl border p-4 ${wrap}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        </div>
      </div>
    </div>
  )
}
