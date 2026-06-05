import { Download, UserCircle } from 'lucide-react'

// Read-only category: every member's single auto-generated profile code. Members
// design + manage their own on /codes; here an operator can see them all and grab
// the output files. Presentational (no hooks) → renders fine inside the dashboard.
export interface MemberProfileCode {
  id: string
  handle: string
  displayName: string
  url: string
  scans: number
  svg: string
}

export function MemberProfileCodes({ codes }: { codes: MemberProfileCode[] }) {
  if (codes.length === 0) {
    return <p className="text-sm text-muted py-4">No member profile codes yet — they’re minted on a member’s first visit to their codes page.</p>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {codes.map((c) => {
        const api = `/api/qr?code=${encodeURIComponent(c.id)}`
        const name = `${c.handle}-profile`
        return (
          <div key={c.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
            <div
              className="h-20 w-20 shrink-0 rounded-lg border border-border bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: c.svg }}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm font-bold text-text">
                <UserCircle className="h-3.5 w-3.5 shrink-0 text-subtle" /> {c.displayName || `@${c.handle}`}
              </p>
              <p className="truncate text-xs text-subtle">@{c.handle}</p>
              <p className="mt-1 text-xs text-muted">{c.scans} scan{c.scans === 1 ? '' : 's'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`${api}&format=png&download=${encodeURIComponent(name)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <Download className="h-3 w-3" /> PNG
                </a>
                <a
                  href={`${api}&format=svg&download=${encodeURIComponent(name)}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  <Download className="h-3 w-3" /> SVG
                </a>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
