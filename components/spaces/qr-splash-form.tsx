'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, QrCode, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { isError } from '@/lib/action-result'
import { createSpaceCode, setCodeSplash } from '@/lib/qr/space-codes-actions'
import { emptySplash, type Splash, type SplashLink } from '@/lib/qr/splash'
import type { SpaceCode } from '@/lib/qr/space-codes'

// OWNER QR + SPLASH EDITOR (client) for the per-space QR studio (ENTITY-SPACES-BUILD §C, Phase 2).
// Two jobs, both behind canEditProfile-gated server actions:
//   1. CREATE a code: a small form (title + link) that calls createSpaceCode. The server enforces the
//      per-plan cap + validates, so this form is convenience, not the gate. When the cap is reached
//      (capReached), the create form is replaced with a plain note instead of a failing button.
//   2. EDIT a code's SPLASH: each code row opens a constrained splash editor (heading + blurb + image
//      url + up to 5 links). Save calls setCodeSplash; "Remove splash" clears it (null). The shape is
//      a fixed block list (lib/qr/splash.ts), NOT a free-form page builder.
//
// HONESTY + VOICE (CONTENT-VOICE skeptic test, §10): plain labels, no narrated feelings, no em/en
// dashes. The splash copy the owner types is theirs; this form only frames the fields.

const MAX_SPLASH_LINKS = 5

/** A splash link as an editable row (label + url strings). */
type LinkDraft = { label: string; url: string }

/** Map a saved splash to the editor's draft state (or an empty draft when a code has none). */
function toSplashDraft(splash: Splash | null): {
  heading: string
  blurb: string
  imageUrl: string
  links: LinkDraft[]
} {
  const s = splash ?? emptySplash()
  return {
    heading: s.heading,
    blurb: s.blurb ?? '',
    imageUrl: s.imageUrl ?? '',
    links: s.links.map((l) => ({ label: l.label, url: l.url })),
  }
}

export function QrSplashForm({
  spaceId,
  slug,
  codes,
  capReached,
  codeCap,
  readOnly = false,
}: {
  spaceId: string
  slug: string
  codes: SpaceCode[]
  /** True when the Space is at its plan's code cap (the create form is hidden). */
  capReached: boolean
  /** The plan's code cap, for the cap note copy. */
  codeCap: number
  /** Staff-preview read-only: the create form + splash editors are hidden (writes stay server-gated). */
  readOnly?: boolean
}) {
  return (
    <div className="space-y-8">
      {!readOnly && (
        <section>
          {capReached ? (
            <p className="rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-3 text-sm text-muted">
              Your plan allows {codeCap} codes. Remove one to add another, or upgrade for more.
            </p>
          ) : (
            <CreateCodeForm spaceId={spaceId} />
          )}
        </section>
      )}

      <section>
        {codes.length === 0 ? (
          <EmptyState
            icon={QrCode}
            title="No codes yet."
            description="Add a code above to share a link that you can retarget any time without a reprint."
          />
        ) : (
          <ul className="space-y-3">
            {codes.map((code) => (
              <CodeRow key={code.id} code={code} slug={slug} readOnly={readOnly} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ── Create-code form ───────────────────────────────────────────────────────────────────────────

function CreateCodeForm({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    if (!title.trim()) {
      setError('Give the code a title.')
      return
    }
    if (!targetUrl.trim()) {
      setError('Add a link the code points to.')
      return
    }
    start(async () => {
      const result = await createSpaceCode(spaceId, {
        title: title.trim(),
        targetUrl: targetUrl.trim(),
        slug: customSlug.trim() || undefined,
      })
      if (isError(result)) {
        setError(result.error)
        return
      }
      setTitle('')
      setTargetUrl('')
      setCustomSlug('')
      router.refresh()
    })
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pending) submit()
      }}
    >
      <div>
        <Label htmlFor="code-title" className="font-semibold">
          Title
        </Label>
        <Input
          id="code-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Front door poster"
          maxLength={120}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="code-target" className="font-semibold">
          Link
        </Label>
        <Input
          id="code-target"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://example.com or /spaces/your-space"
          className="mt-1"
        />
        <p className="mt-1 text-xs text-subtle">
          The code points here today. You can change where it goes any time, no reprint.
        </p>
      </div>
      <div>
        <Label htmlFor="code-slug" className="font-semibold">
          Custom link (optional)
        </Label>
        <Input
          id="code-slug"
          value={customSlug}
          onChange={(e) => setCustomSlug(e.target.value)}
          placeholder="open-house"
          maxLength={48}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-subtle">Leave blank for a short link we pick for you.</p>
      </div>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Adding
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" aria-hidden /> Add code
          </>
        )}
      </Button>
    </form>
  )
}

// ── One code row + its splash editor ─────────────────────────────────────────────────────────────

function CodeRow({ code, slug, readOnly }: { code: SpaceCode; slug: string; readOnly: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <li className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{code.title}</p>
          <p className="text-xs text-muted">
            /q/{code.slug} · {code.scanCount} {code.scanCount === 1 ? 'scan' : 'scans'}
            {code.hasSplash ? ' · splash on' : ''}
            {!code.active ? ' · off' : ''}
          </p>
        </div>
        {!readOnly && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : code.hasSplash ? 'Edit splash' : 'Add splash'}
          </Button>
        )}
      </div>

      {open && !readOnly && <SplashEditor code={code} slug={slug} onDone={() => setOpen(false)} />}
    </li>
  )
}

function SplashEditor({
  code,
  slug,
  onDone,
}: {
  code: SpaceCode
  slug: string
  onDone: () => void
}) {
  const router = useRouter()
  // The page reads `hasSplash` only (not the full blob), so the editor starts from an empty draft and
  // the owner fills it. Saving replaces the whole splash, so an empty editor is a clean "no splash".
  const [draft, setDraft] = useState(() => toSplashDraft(null))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function updateLink(i: number, patch: Partial<LinkDraft>) {
    setDraft((d) => ({ ...d, links: d.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
    setSaved(false)
  }
  function addLink() {
    setDraft((d) =>
      d.links.length >= MAX_SPLASH_LINKS ? d : { ...d, links: [...d.links, { label: '', url: '' }] },
    )
    setSaved(false)
  }
  function removeLink(i: number) {
    setDraft((d) => ({ ...d, links: d.links.filter((_, idx) => idx !== i) }))
    setSaved(false)
  }

  function save() {
    setError(null)
    setSaved(false)
    if (!draft.heading.trim()) {
      setError('Add a heading before saving.')
      return
    }
    const links: SplashLink[] = draft.links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url)
    const splash: Splash = {
      heading: draft.heading.trim(),
      blurb: draft.blurb.trim() || null,
      imageUrl: draft.imageUrl.trim() || null,
      links,
    }
    start(async () => {
      const result = await setCodeSplash(code.id, splash)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  function remove() {
    setError(null)
    start(async () => {
      const result = await setCodeSplash(code.id, null)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
      onDone()
    })
  }

  return (
    <div className="space-y-4 border-t border-border px-4 py-4">
      <p className="text-xs text-subtle">
        A splash is a small landing page a scan lands on. Add a heading, a line or two, and a few
        links. The first link is the main button.
      </p>

      <div>
        <Label htmlFor={`splash-heading-${code.id}`} className="font-semibold">
          Heading
        </Label>
        <Input
          id={`splash-heading-${code.id}`}
          value={draft.heading}
          onChange={(e) => {
            setDraft((d) => ({ ...d, heading: e.target.value }))
            setSaved(false)
          }}
          placeholder="Welcome in"
          maxLength={80}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor={`splash-blurb-${code.id}`} className="font-semibold">
          Blurb (optional)
        </Label>
        <Textarea
          id={`splash-blurb-${code.id}`}
          value={draft.blurb}
          onChange={(e) => {
            setDraft((d) => ({ ...d, blurb: e.target.value }))
            setSaved(false)
          }}
          placeholder="What this is, in a line or two."
          rows={2}
          maxLength={400}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor={`splash-image-${code.id}`} className="font-semibold">
          Image link (optional)
        </Label>
        <Input
          id={`splash-image-${code.id}`}
          value={draft.imageUrl}
          onChange={(e) => {
            setDraft((d) => ({ ...d, imageUrl: e.target.value }))
            setSaved(false)
          }}
          placeholder="https://example.com/banner.jpg"
          className="mt-1"
        />
      </div>

      <div className="space-y-3">
        <Label className="font-semibold">Links</Label>
        {draft.links.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium text-muted">Label</span>
              <Input
                value={l.label}
                onChange={(e) => updateLink(i, { label: e.target.value })}
                placeholder={i === 0 ? 'Book a spot' : 'See the schedule'}
                maxLength={60}
                className="mt-1"
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium text-muted">Link</span>
              <Input
                value={l.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                placeholder="https://example.com"
                className="mt-1"
              />
            </div>
            <button
              type="button"
              onClick={() => removeLink(i)}
              aria-label="Remove this link"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
        {draft.links.length < MAX_SPLASH_LINKS && (
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a link
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving
            </>
          ) : (
            <>
              <Check className="h-4 w-4" aria-hidden /> Save splash
            </>
          )}
        </Button>
        {saved && !pending && (
          <span
            className="inline-flex items-center gap-1 text-sm font-medium text-success"
            role="status"
          >
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
        {code.hasSplash && (
          <Button type="button" variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="h-4 w-4" aria-hidden /> Remove splash
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => window.open(`/q/${code.slug}`, '_blank')}
          disabled={pending}
        >
          Open /q/{code.slug}
        </Button>
        <span className="sr-only">View this code at /spaces/{slug}</span>
      </div>
    </div>
  )
}
