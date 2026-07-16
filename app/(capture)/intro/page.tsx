import type { Metadata } from 'next'
import { parseLeadLink } from '@/lib/crm/lead-links'
import { loadSpaceName } from '@/lib/crm/capture-context'
import { CaptureShell } from '@/components/crm/leads/capture-shell'
import { IntroAccept } from './intro-accept'

// FRONT DOOR #2 — the warm-intro ACCEPT surface (the double-opt-in). Someone at a Space introduced this
// person; here they confirm they want to hear from that Space. Capture already sealed the lead (NOT
// mailable); this step is the opt-in that flips it. Clear consent language: who's introducing them, to
// what, and that saying no is fine. Noindex (transactional).
export const metadata: Metadata = {
  title: 'An introduction',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

export default async function IntroPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  const payload = parseLeadLink(t)

  if (!payload || payload.d !== 'warm_intro' || !payload.c) {
    return (
      <CaptureShell
        title="This link didn't work."
        description="It may have expired. Ask whoever introduced you to send a fresh one."
      >
        <span className="sr-only">Invalid introduction link.</span>
      </CaptureShell>
    )
  }

  const spaceName = await loadSpaceName(payload.s)
  const introducer = payload.by?.trim() || 'Someone'

  return (
    <CaptureShell
      eyebrow="An introduction"
      title={`${introducer} thought you two should meet.`}
      description={`They introduced you to ${spaceName}. Say yes and ${spaceName} can send you the occasional note. Say no and nothing happens. Your call.`}
    >
      <IntroAccept token={t as string} spaceName={spaceName} />
    </CaptureShell>
  )
}
