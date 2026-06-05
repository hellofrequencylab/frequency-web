'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, UserCircle, Pencil, Palette } from 'lucide-react'
import { StyleEditor } from './style-editor'
import { NfcWriter } from './nfc-writer'
import { VcardEditor } from '@/app/(main)/codes/vcard-editor'
import { updateMemberCodeStyle, updateMemberVcard } from './member-actions'
import type { QrStyle } from '@/lib/qr/style'
import type { VcardConfig } from '@/lib/vcard'

// Admin "Member profile codes" category — one auto-generated code per member. An
// operator can download the output files AND edit the member's design + contact
// card on their behalf (the member still self-edits on /codes).
export interface MemberProfileCode {
  id: string
  profileId: string
  handle: string
  displayName: string
  url: string
  scans: number
  svg: string
  style: QrStyle
  vcard: VcardConfig
}

export function MemberProfileCodes({ codes }: { codes: MemberProfileCode[] }) {
  if (codes.length === 0) {
    return <p className="text-sm text-muted py-4">No member profile codes yet — they’re minted on a member’s first visit to their codes page.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {codes.map((c) => (
        <MemberCard key={c.id} code={c} />
      ))}
    </div>
  )
}

function MemberCard({ code }: { code: MemberProfileCode }) {
  const [editing, setEditing] = useState(false)
  const [style, setStyle] = useState<QrStyle>(code.style)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const api = `/api/qr?code=${encodeURIComponent(code.id)}`
  const name = `${code.handle}-profile`

  function saveStyle() {
    start(async () => {
      const r = await updateMemberCodeStyle(code.id, style)
      if (!('error' in r)) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex gap-3">
        <div
          className="h-20 w-20 shrink-0 rounded-lg border border-border bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: code.svg }}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-bold text-text">
            <UserCircle className="h-3.5 w-3.5 shrink-0 text-subtle" /> {code.displayName || `@${code.handle}`}
          </p>
          <p className="truncate text-xs text-subtle">@{code.handle}</p>
          <p className="mt-1 text-xs text-muted">{code.scans} scan{code.scans === 1 ? '' : 's'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={`${api}&format=png&download=${encodeURIComponent(name)}`} className={DL}>
              <Download className="h-3 w-3" /> PNG
            </a>
            <a href={`${api}&format=svg&download=${encodeURIComponent(name)}`} className={DL}>
              <Download className="h-3 w-3" /> SVG
            </a>
            <NfcWriter url={code.url} className={DL} />
            <button onClick={() => setEditing((v) => !v)} className={DL}>
              <Pencil className="h-3 w-3" /> {editing ? 'Close' : 'Edit'}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <StyleEditor value={style} onChange={setStyle} previewUrl={code.url} />
          <div className="flex items-center gap-2">
            <button
              onClick={saveStyle}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              <Palette className="h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Save design'}
            </button>
            {saved && <span className="text-xs text-success">Saved.</span>}
          </div>
          <VcardEditor
            config={code.vcard}
            handle={code.handle}
            onSave={updateMemberVcard.bind(null, code.profileId)}
          />
        </div>
      )}
    </div>
  )
}

const DL =
  'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-text'
