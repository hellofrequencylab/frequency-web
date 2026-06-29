'use client'

// The Link Generator's interactive surface (BUILD-LIST P5). One focused tool: type a
// destination + campaign tags, watch the tracked URL build live, then generate a
// /q/<slug> short link with a styled QR. Distinct from the dense QR Studio: a single
// compose-and-share flow an operator can finish in one screen.
//
// The compose preview is the PURE buildTrackedUrl core (shared with the server action),
// so the "what will this become" preview matches what gets stored byte for byte. The
// QR is the isomorphic renderStyledQrSvg (same renderer the Studio editor uses client
// side). The actual write goes through the authz-guarded generateLink server action;
// nothing here is trusted, the action re-validates + re-composes server-side.
//
// VOICE: copy obeys CONTENT-VOICE (plain, no narrated feelings, no em/en dashes).

import { useMemo, useState, useTransition } from 'react'
import { Link2, Copy, Check, QrCode } from 'lucide-react'
import { Input, Label } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE } from '@/lib/qr/style'
import { isValidTargetUrl } from '@/lib/qr/codes'
import { buildTrackedUrl, EMPTY_UTM, type UtmParams } from '@/lib/growth/link-compose'
import { isError } from '@/lib/action-result'
import { generateLink, type GeneratedLink } from './actions'

const UTM_FIELDS: Array<{ key: keyof UtmParams; label: string; placeholder: string }> = [
  { key: 'source', label: 'Source', placeholder: 'newsletter' },
  { key: 'medium', label: 'Medium', placeholder: 'email' },
  { key: 'campaign', label: 'Campaign', placeholder: 'spring-launch' },
  { key: 'term', label: 'Term', placeholder: 'optional' },
  { key: 'content', label: 'Content', placeholder: 'optional' },
]

export function LinkGenerator() {
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [slug, setSlug] = useState('')
  const [utm, setUtm] = useState<UtmParams>(EMPTY_UTM)
  const [result, setResult] = useState<GeneratedLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Live compose preview: the same pure builder the server action runs. Only meaningful
  // once the raw target is a valid destination; otherwise show nothing yet.
  const trackedPreview = useMemo(() => {
    const t = target.trim()
    if (!t || !isValidTargetUrl(t)) return ''
    return buildTrackedUrl(t, utm)
  }, [target, utm])

  // A live QR of the eventual SHORT link can only be drawn after creation (the slug is
  // server-assigned). Before that, preview the destination QR so the operator sees the
  // code take shape. After create, swap to the real short-link QR the action returned.
  const previewSvg = useMemo(() => {
    if (result) return result.svg
    if (!trackedPreview) return ''
    return renderStyledQrSvg(trackedPreview, DEFAULT_STYLE, 200)
  }, [result, trackedPreview])

  function setUtmField(key: keyof UtmParams, value: string) {
    setUtm((u) => ({ ...u, [key]: value }))
    setResult(null)
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
    } catch {
      // Clipboard can be denied; the value stays selectable in the field.
    }
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await generateLink({ title, target, utm, slug: slug || undefined })
      if (isError(res)) {
        setError(res.error)
        setResult(null)
        return
      }
      setResult(res.data)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── Compose ─────────────────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="lg-title">Title</Label>
          <Input
            id="lg-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setResult(null)
            }}
            placeholder="Spring launch email"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lg-target">Destination</Label>
          <Input
            id="lg-target"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value)
              setResult(null)
            }}
            placeholder="https://example.com/offer or /events/spring"
            inputMode="url"
          />
          <p className="text-2xs text-subtle">A full web address, or a link on this site that starts with /.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Campaign tags</Label>
          <p className="text-2xs text-subtle">
            Optional UTM tags, added to the destination so scans attribute to this campaign.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {UTM_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`lg-utm-${f.key}`} className="text-2xs uppercase tracking-wide">
                  {f.label}
                </Label>
                <Input
                  id={`lg-utm-${f.key}`}
                  value={utm[f.key]}
                  onChange={(e) => setUtmField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lg-slug">Custom short link (optional)</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-subtle">/q/</span>
            <Input
              id="lg-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setResult(null)
              }}
              placeholder="spring-launch"
            />
          </div>
          <p className="text-2xs text-subtle">Letters, numbers, and hyphens. Leave blank for a generated code.</p>
        </div>

        {trackedPreview && (
          <div className="space-y-1.5">
            <Label>Tracked destination</Label>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-elevated/60 p-3">
              <code className="min-w-0 flex-1 break-all text-2xs leading-relaxed text-muted">{trackedPreview}</code>
              <button
                type="button"
                onClick={() => copy(trackedPreview, 'tracked')}
                className="shrink-0 text-subtle transition-colors hover:text-text"
                aria-label="Copy tracked destination"
              >
                {copied === 'tracked' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={pending || !title.trim() || !target.trim()}>
            <Link2 className="h-3.5 w-3.5" />
            {pending ? 'Generating...' : result ? 'Generate another' : 'Generate link'}
          </Button>
        </div>
      </div>

      {/* ── Preview / result ────────────────────────────────────────────────── */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <QrCode className="h-3.5 w-3.5" /> Preview
          </p>
          <div className="mt-3 flex items-center justify-center rounded-xl border border-border bg-white p-4">
            {previewSvg ? (
              <div className="h-[200px] w-[200px]" dangerouslySetInnerHTML={{ __html: previewSvg }} />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center text-center text-2xs text-subtle">
                Enter a destination to preview the code.
              </div>
            )}
          </div>

          {result && (
            <div className="mt-4 space-y-2">
              <p className="text-2xs uppercase tracking-wide text-subtle">Short link</p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated/60 p-2.5">
                <code className="min-w-0 flex-1 truncate text-xs text-text">{result.shortUrl}</code>
                <button
                  type="button"
                  onClick={() => copy(result.shortUrl, 'short')}
                  className="shrink-0 text-subtle transition-colors hover:text-text"
                  aria-label="Copy short link"
                >
                  {copied === 'short' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-2xs text-subtle">
                Live and trackable now. Manage, restyle, or retire it from the QR Studio without reprinting.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
