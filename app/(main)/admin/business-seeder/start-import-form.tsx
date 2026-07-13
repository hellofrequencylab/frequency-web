'use client'

// The operator START form (docs/BUSINESS-IMPORTER.md §8, P3). Paste a business's website,
// social handles, a freeform content block, and optional hints; "Start import" enqueues the
// research job (the P1 trigger action) and routes the operator to the new import's review page,
// where they watch it move through the status machine. A thin client child — all writes go
// through the server action (startBusinessImport), which gates + binds them.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Rocket, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/admin/status'
import { startBusinessImport } from './actions'

const field =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none'
const labelCls = 'flex flex-col gap-1 text-xs font-medium text-muted'

export function StartImportForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [websiteUrl, setWebsiteUrl] = useState('')
  const [nameHint, setNameHint] = useState('')
  const [cityHint, setCityHint] = useState('')
  const [categoryHint, setCategoryHint] = useState('')
  const [type, setType] = useState<'business' | 'nonprofit'>('business')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [directions, setDirections] = useState('')
  const [overview, setOverview] = useState('')
  const [webContent, setWebContent] = useState('')
  const [bookingSchedule, setBookingSchedule] = useState('')
  const [differentiators, setDifferentiators] = useState('')
  const [pastedContent, setPastedContent] = useState('')
  const [runInline, setRunInline] = useState(true)

  function submit() {
    setError(null)
    startTransition(async () => {
      const handles: Record<string, string> = {}
      if (instagram.trim()) handles.instagram = instagram.trim()
      if (facebook.trim()) handles.facebook = facebook.trim()
      if (linkedin.trim()) handles.linkedin = linkedin.trim()
      const res = await startBusinessImport({
        websiteUrl: websiteUrl.trim() || undefined,
        nameHint: nameHint.trim() || undefined,
        cityHint: cityHint.trim() || undefined,
        categoryHint: categoryHint.trim() || undefined,
        type,
        socialHandles: Object.keys(handles).length ? handles : undefined,
        directions: directions.trim() || undefined,
        overview: overview.trim() || undefined,
        webContent: webContent.trim() || undefined,
        bookingSchedule: bookingSchedule.trim() || undefined,
        differentiators: differentiators.trim() || undefined,
        pastedContent: pastedContent.trim() || undefined,
        runInline,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/admin/business-seeder/${res.intakeId}`)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {error && (
        <div className="mb-4">
          <Banner tone="critical" title="Could not start the import">
            {error}
          </Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className={labelCls}>
          Website
          <input
            className={field}
            type="url"
            inputMode="url"
            placeholder="acme-yoga.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Name hint
          <input
            className={field}
            placeholder="Acme Yoga Studio"
            value={nameHint}
            onChange={(e) => setNameHint(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          City
          <input
            className={field}
            placeholder="Encinitas"
            value={cityHint}
            onChange={(e) => setCityHint(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Category
          <input
            className={field}
            placeholder="Yoga studio"
            value={categoryHint}
            onChange={(e) => setCategoryHint(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Type
          <select className={field} value={type} onChange={(e) => setType(e.target.value as 'business' | 'nonprofit')}>
            <option value="business">Business</option>
            <option value="nonprofit">Nonprofit</option>
          </select>
        </label>
        <label className={labelCls}>
          Instagram handle
          <input
            className={field}
            placeholder="@acmeyoga"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Facebook
          <input className={field} placeholder="acmeyoga" value={facebook} onChange={(e) => setFacebook(e.target.value)} />
        </label>
        <label className={labelCls}>
          LinkedIn
          <input className={field} placeholder="company/acme-yoga" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
        </label>
      </div>

      {/* DIRECTIONS: a steering modifier for the seed. Folded into the AI's brief — never overrides the
          trust rules (no invented facts / health claims), just steers emphasis + angle. */}
      <label className={`${labelCls} mt-4`}>
        <span className="inline-flex items-center gap-1.5 text-primary-strong">
          <Compass className="h-3.5 w-3.5" aria-hidden /> Directions (steer the seed)
        </span>
        <textarea
          className={`${field} min-h-16 resize-y`}
          placeholder="Tell the seeder how to approach this. e.g. 'Lead with the retreat angle, keep it calm and grounded, emphasize the sound baths.'"
          value={directions}
          onChange={(e) => setDirections(e.target.value)}
        />
      </label>

      {/* Structured content boxes: labeled so the extractor can identify content. Everything here is a
          SOURCE (parsed into the draft); paste anything you scraped about the business. */}
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-subtle">Content to parse</p>
      <p className="mb-2 text-2xs text-muted">
        Paste anything you have. Labeled boxes help the seeder sort it. All of it is treated as a source.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className={labelCls}>
          Overview
          <textarea
            className={`${field} min-h-24 resize-y`}
            placeholder="What is this business, in plain terms? Who is it for, what do they do?"
            value={overview}
            onChange={(e) => setOverview(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Website content
          <textarea
            className={`${field} min-h-24 resize-y`}
            placeholder="Paste the About / Home / Services page copy, bios, mission."
            value={webContent}
            onChange={(e) => setWebContent(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          Booking and schedule
          <textarea
            className={`${field} min-h-24 resize-y`}
            placeholder="Hours, session lengths, prices, how to book, availability."
            value={bookingSchedule}
            onChange={(e) => setBookingSchedule(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          What makes them different
          <textarea
            className={`${field} min-h-24 resize-y`}
            placeholder="The angle, the specialty, the vibe, the proof: anything that sets them apart."
            value={differentiators}
            onChange={(e) => setDifferentiators(e.target.value)}
          />
        </label>
      </div>

      <label className={`${labelCls} mt-4`}>
        Anything else
        <textarea
          className={`${field} min-h-20 resize-y`}
          placeholder="Reviews, menus, testimonials, or any other raw text you scraped."
          value={pastedContent}
          onChange={(e) => setPastedContent(e.target.value)}
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={runInline}
            onChange={(e) => setRunInline(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Run research now (faster; the durable queue is the safety net)
        </label>
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          {pending ? 'Starting…' : 'Start import'}
        </Button>
      </div>
    </div>
  )
}
