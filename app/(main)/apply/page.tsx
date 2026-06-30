// Apply, the track picker (Growth OS Engine 3, GE3-2/GE3-3, ADR-456). A member picks
// what they are applying for: to host a Circle, or to bring an offering as an
// operator. Composes the Focus kit (a centered, no-rail surface, registered in
// page-chrome.ts). Copy is CONTENT-VOICE: plain, the skeptic test, no narrated
// feelings, no em dashes.

import Link from 'next/link'
import { ChevronRight, Users, Sparkles } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { APPLICATION_TRACK_DEFS, type ApplicationTrack } from '@/lib/applications/tracks'

export const dynamic = 'force-dynamic'

// The host track leads; the operator tracks follow. (Practitioner/partner are the
// surfaced personas; coach/business/nonprofit/collective are reachable by deep link
// and from the operator pages, kept out of the top picker to stay plain.)
const PICKER: ApplicationTrack[] = ['host', 'practitioner', 'partner']

export default function ApplyIndexPage() {
  return (
    <FocusTemplate
      eyebrow="Apply"
      title="What do you want to do here?"
      description="Two doors. Host a Circle and we hand you the format, or bring what you do as an operator. Pick the one that fits."
      width="default"
    >
      <div className="space-y-3">
        {PICKER.map((id) => {
          const t = APPLICATION_TRACK_DEFS[id]
          const Icon = id === 'host' ? Users : Sparkles
          return (
            <Link
              key={id}
              href={`/apply/${id}`}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong sm:p-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text sm:text-base">{t.label}</p>
                <p className="mt-0.5 text-sm leading-snug text-muted">{t.blurb}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          )
        })}
      </div>
    </FocusTemplate>
  )
}
