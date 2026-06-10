'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Copy, Check, Palette, Users, Zap, UserPlus, Wallet } from 'lucide-react'
import { StyleEditor } from '@/app/(main)/admin/qr/style-editor'
import { trackClient } from '@/components/analytics/track-provider'
import { updateMyCodeStyle } from './actions'
import type { QrStyle } from '@/lib/qr/style'
import type { MemberCodePurpose } from '@/lib/qr/member-codes'

export interface MemberCodeCard {
  id: string
  purpose: MemberCodePurpose
  title: string
  slug: string
  url: string
  scans: number
  style: QrStyle
  svg: string
}

const META: Record<MemberCodePurpose, { blurb: string; Icon: typeof Users }> = {
  connect: {
    blurb: 'Your one personal code. Others scan it to land on your profile and connect. Anyone who joins Frequency after scanning is credited to you.',
    Icon: UserPlus,
  },
  referral: {
    blurb: 'Your outreach code. People who scan and join are credited to you, and you both earn Zaps.',
    Icon: Users,
  },
  gift_zap: { blurb: 'Friends scan to send you a Zap toward The Quest.', Icon: Zap },
}

export function MemberCodes({
  cards,
  referralCount,
  walletEnabled = false,
}: {
  cards: MemberCodeCard[]
  referralCount: number
  /** Whether Google Wallet passes are configured (env-gated). */
  walletEnabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {cards.map((card) => (
        <CodeCard
          key={card.id}
          card={card}
          extra={`${referralCount} joined via your code`}
          walletEnabled={walletEnabled}
        />
      ))}
    </div>
  )
}

function CodeCard({
  card,
  extra,
  walletEnabled,
}: {
  card: MemberCodeCard
  extra: string | null
  walletEnabled: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [style, setStyle] = useState<QrStyle>(card.style)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const { blurb, Icon } = META[card.purpose]
  const apiBase = `/api/qr?code=${encodeURIComponent(card.id)}`

  function copy() {
    navigator.clipboard?.writeText(card.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function save() {
    start(async () => {
      const r = await updateMyCodeStyle(card.id, style)
      if (!('error' in r)) {
        trackClient('qr.code_designed', { kind: card.purpose })
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
        router.refresh()
        setEditing(false)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-4 flex flex-col">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
        <Icon className="w-3.5 h-3.5" /> {card.title}
      </div>

      <div
        className="mt-3 mx-auto w-44 h-44 rounded-xl border border-border bg-white p-2 [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: card.svg }}
      />

      <p className="mt-3 text-xs text-muted">{blurb}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          <span className="font-semibold text-text">{card.scans}</span> scan{card.scans === 1 ? '' : 's'}
        </span>
        {extra && <span>· {extra}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`${apiBase}&format=png&download=${encodeURIComponent(card.slug)}`}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
        >
          <Download className="w-3 h-3" /> PNG
        </a>
        <a
          href={`${apiBase}&format=svg&download=${encodeURIComponent(card.slug)}`}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
        >
          <Download className="w-3 h-3" /> SVG
        </a>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Link'}
        </button>
        {walletEnabled && card.purpose === 'connect' && (
          <a
            href={`/api/wallet/google?code=${encodeURIComponent(card.id)}`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
          >
            <Wallet className="w-3 h-3" /> Wallet
          </a>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text hover:bg-surface-elevated transition-colors"
        >
          <Palette className="w-3 h-3" /> {editing ? 'Close' : 'Customize'}
        </button>
      </div>

      {editing && (
        <div className="mt-3">
          <StyleEditor value={style} onChange={setStyle} previewUrl={card.url} />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save design'}
            </button>
            {saved && <span className="text-xs text-success">Saved.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
