'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Link2, Check, ExternalLink, Archive, Palette, ScanLine } from 'lucide-react'
import { StyleEditor } from '@/app/(main)/admin/qr/style-editor'
import {
  createPageQr,
  getPageQrScanStats,
  type PageQrScanStats,
} from '@/app/(main)/admin/qr/link-actions'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { isError } from '@/lib/action-result'
import { relativeTime } from '@/lib/utils'

// The on-page QR creator (ADR-179) — the COMPACT variant that lives in a page's
// Settings panel. The creator (title + a trimmed visual editor) takes the left 2/3;
// the share link + this page's scan activity (PX.3 — the Studio's qr_scans rollup
// scoped to this folder) sit in the right 1/3. Every saved code is a real managed
// code filed under this page's route; the full list + retired codes live in QR
// Studio (the "Archived codes" link), so we don't repeat them here.
export function PageQrManager({ pathname, url }: { pathname: string; url: string }) {
  const [title, setTitle] = useState('')
  const [style, setStyle] = useState<QrStyle>({ ...DEFAULT_STYLE })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const [stats, setStats] = useState<PageQrScanStats | null>(null)

  // QR Studio, scoped to this page's folder (its archive of generated + retired codes).
  const archiveHref = `/admin/qr?folder=${encodeURIComponent(pathname)}`

  const loadStats = useCallback(() => {
    getPageQrScanStats(pathname).then((r) => {
      if (!isError(r)) setStats(r.data)
    })
  }, [pathname])

  useEffect(loadStats, [loadStats])

  function save() {
    const t = title.trim() || `QR for ${pathname}`
    start(async () => {
      const r = await createPageQr({ pagePath: pathname, targetUrl: url, title: t, style })
      if (isError(r)) {
        setError(r.error)
        return
      }
      setTitle('')
      setStyle({ ...DEFAULT_STYLE })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      loadStats() // a new code changes the folder's code count
    })
  }

  return (
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-3">
      {/* LEFT 2/3 — the creator */}
      <div className="space-y-4 lg:col-span-2">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
          <Palette className="h-3.5 w-3.5" /> Design a QR for this page
        </p>

        <label className="block">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-subtle">Title</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError(null)
            }}
            placeholder="e.g. Front desk flyer"
            className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs text-text"
          />
        </label>

        <StyleEditor
          value={style}
          onChange={setStyle}
          previewUrl={url}
          compact
          presetsFooter={
            <Link
              href={archiveHref}
              className="inline-flex items-center gap-1 text-2xs font-medium text-subtle transition-colors hover:text-text"
            >
              <Archive className="h-3 w-3" /> Archived codes
            </Link>
          }
          // Two-column compact designer: design controls on the left, the preset
          // buttons column on the right (the editor keeps the preview up top).
          renderCompact={({ controls, presets }) => (
            <div className="mt-4 sm:grid sm:grid-cols-[1fr_auto] sm:gap-4">
              <div>{controls}</div>
              <div className="mt-4 sm:mt-0">{presets}</div>
            </div>
          )}
        />

        {error && <p className="text-2xs text-danger">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-2xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : <Palette className="h-3.5 w-3.5" />}
          {pending ? 'Saving…' : saved ? 'Saved' : 'Save QR'}
        </button>
      </div>

      {/* RIGHT 1/3 — share + scan activity, aligned to the title row */}
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Link2 className="h-3.5 w-3.5" /> Share code
          </p>
          <ShareCode url={url} pathname={pathname} />
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <ScanLine className="h-3.5 w-3.5" /> Scan activity
          </p>
          <ScanActivity stats={stats} archiveHref={archiveHref} />
        </div>
      </div>
    </div>
  )
}

// This page's scan rollup (PX.3) — total / last scan / top code for the codes filed
// under this route, small enough to read at a glance. Numbers come from the same
// `qr_scans` aggregation QR Studio uses (summarizePageScans), scoped to `page_path`.
function ScanActivity({ stats, archiveHref }: { stats: PageQrScanStats | null; archiveHref: string }) {
  if (stats === null) {
    return <p className="px-0.5 text-2xs text-subtle">Loading scan activity…</p>
  }
  if (stats.codeCount === 0) {
    return (
      <p className="px-0.5 text-2xs text-subtle">
        No codes saved for this page yet. Save one and its scans show up here.
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      <StatRow
        label="Total scans"
        value={`${stats.total.toLocaleString()}${stats.unique > 0 ? ` · ${stats.unique} members` : ''}`}
      />
      <StatRow label="Last scan" value={stats.lastScanAt ? relativeTime(stats.lastScanAt) : '–'} />
      <StatRow
        label="Top code"
        value={
          stats.topCode ? (
            <span className="inline-flex max-w-full items-baseline gap-1">
              <span className="truncate" title={stats.topCode.title || `/q/${stats.topCode.slug}`}>
                {stats.topCode.title || `/q/${stats.topCode.slug}`}
              </span>
              <span className="shrink-0 font-normal text-subtle">({stats.topCode.total})</span>
            </span>
          ) : (
            '–'
          )
        }
      />
      <p className="px-0.5 pt-0.5 text-2xs text-subtle">
        {stats.codeCount === 1 ? '1 code' : `${stats.codeCount} codes`} filed under this page ·{' '}
        <Link href={archiveHref} className="font-medium underline-offset-2 hover:underline">
          open in Studio
        </Link>
      </p>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 text-2xs">
      <span className="shrink-0 text-subtle">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-text">{value}</span>
    </div>
  )
}

// The page's raw share link — copy or open, no minted code needed.
function ShareCode({ url, pathname }: { url: string; pathname: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="space-y-2">
      <code
        className="block truncate rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5 font-mono text-2xs text-muted"
        title={url}
      >
        {url}
      </code>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Link'}
        </button>
        <a
          href={pathname}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab"
          className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
