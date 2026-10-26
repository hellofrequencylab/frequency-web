import { FrequencyCaptureShell } from '@/components/frequency/site/pages/funnel/capture'

// The shared chrome for a PUBLIC lead-capture surface (front doors 2 to 5): the eyebrow, title, line and
// door, inside the site shell. A self-contained transactional page OUTSIDE the authed app shell (no rail,
// no nav). Presentational + server-friendly.
export function CaptureShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <FrequencyCaptureShell eyebrow={eyebrow} title={title} description={description}>
      {children}
    </FrequencyCaptureShell>
  )
}
