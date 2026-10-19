import { Nfc } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { readEventCheckInEnabled } from '@/lib/events/checkin-enabled'
import { ensureEventDoorCode } from '@/lib/events/door-code'
import { renderQrSvg } from '@/lib/qr/render'
import { ZAP_AMOUNTS } from '@/lib/zaps'
import { CheckinCodeCard } from '@/components/spaces/checkin-code-card'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'

// TAP OR SCAN TO CHECK IN (LIVE-945): the event's door code, on the Home tab of Manage. The host prints the
// QR or writes the tag link to an NFC sticker at the door; a guest's tap runs the same check-in as the
// button on the event page. Hidden while the host has check-in off (the switch is in Settings). Streams
// behind Suspense; the page has already passed the manage gate. No em dashes.

export async function EventDoorSection({ eventId, title }: { eventId: string; title: string }) {
  const [{ data: ev }, profileId] = await Promise.all([
    createAdminClient().from('events').select('theme').eq('id', eventId).maybeSingle(),
    getMyProfileId(),
  ])
  if (!readEventCheckInEnabled((ev as { theme?: unknown } | null)?.theme)) return null
  const code = profileId ? await ensureEventDoorCode(eventId, title, profileId) : null
  const svg = code ? await renderQrSvg(code.url, 256) : null
  const zaps = ZAP_AMOUNTS.event_attend

  return (
    <section>
      <SectionHeader title="Tap or scan to check in" />
      {code && svg ? (
        <div className="space-y-3">
          <p className="max-w-2xl text-body-sm text-muted">
            Print this code or write the tag link to an NFC sticker at the door. A guest who taps it is marked going and, once the event has started, checked in for {zaps} Zaps. Nobody needs the app open first.
          </p>
          <CheckinCodeCard svg={svg} link={code.url} />
          <p className="flex flex-wrap items-center gap-2 text-meta text-muted">
            <Nfc className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              For an NFC tag, write this link as a URL record: <code className="rounded-control bg-surface-elevated px-1.5 py-0.5 text-text">{code.nfcUrl}</code>
            </span>
          </p>
        </div>
      ) : (
        <EmptyState title="No door code yet." description="Open this page as the host to create the event's door code." />
      )}
    </section>
  )
}
