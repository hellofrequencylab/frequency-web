import { notFound } from 'next/navigation'
import { QrCode, ScanLine, Download } from 'lucide-react'
import { requireProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { connectUrl } from '@/lib/qr/links'
import { renderQrSvg } from '@/lib/qr/render'

export const dynamic = 'force-dynamic'

// Member "My code" surface. The personal connect code encodes the member's own
// public profile — scan it and you land on their page to friend or message. No
// new schema: it's just a QR of /people/<handle>. (Place/event codes that EARN
// are authored in the admin QR Studio; members scan those with any camera app.)
export default async function CodesPage() {
  const profileId = await requireProfileId()
  const supabase = await createClient()
  const { data: me } = await supabase
    .from('profiles')
    .select('handle, display_name')
    .eq('id', profileId)
    .maybeSingle()
  if (!me?.handle) notFound()

  const url = connectUrl(me.handle)
  const svg = await renderQrSvg(url, 260)
  const downloadName = `frequency-${me.handle}`
  const apiBase = `/api/qr?text=${encodeURIComponent(`/people/${me.handle}`)}`

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 py-2">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
          <QrCode className="h-5 w-5 text-primary-strong" /> Your code
        </h1>
        <p className="mt-1 text-sm text-muted">
          Show this when you meet someone in person. They scan it and land on your profile to
          connect.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-surface shadow-sm p-6 text-center">
        <div
          className="mx-auto w-60 h-60 rounded-xl border border-border bg-white p-3 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-4 text-base font-bold text-text">{me.display_name ?? `@${me.handle}`}</p>
        <p className="text-xs text-muted break-all">{url}</p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <a
            href={`${apiBase}&format=png&download=${encodeURIComponent(downloadName)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Download PNG
          </a>
          <a
            href={`${apiBase}&format=svg&download=${encodeURIComponent(downloadName)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> SVG
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-elevated/50 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
          <ScanLine className="w-4 h-4 text-primary-strong" /> Scanning a code
        </h2>
        <p className="mt-1 text-sm text-muted">
          See a Frequency QR on a poster, plaque, or at an event? Point your phone&apos;s camera at
          it — you&apos;ll land on a check-in page where one tap earns your zaps and counts as a
          verified practice.
        </p>
      </div>
    </div>
  )
}
