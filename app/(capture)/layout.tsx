import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// The four public lead-capture doors (/checkin, /exchange, /intro, /unlock) render the funnel stage
// (components/frequency/site/pages/funnel/capture.tsx), whose classes mean nothing outside the site
// kit root. Without this layout they rendered as bare text in the top-left corner of a blank page
// (visual sweep 2026-11-02). Chrome-free, like the other funnel doors (ADR-591): the kit root, the
// canvas and the FX island, no header and no footer. No request-time reads here; the pages are
// force-dynamic on their own account.
export default function CaptureLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell chrome={false}>{children}</SiteShell>
}
