'use client'

// The poster capture island (mirrors the card-scan creator,
// app/(main)/connections/new/creator.tsx). The capture principles:
//   • ONE smart vision call (scanPoster) — everything else happens on-device;
//   • downscale to ~1024 + jpeg BEFORE upload (cheaper, faster vision);
//   • deskew via a client-side canvas perspective warp when the model finds
//     the four poster corners, with a before/after toggle;
//   • cover + lineup + gallery crops are cut client-side from the squared
//     image and uploaded as small jpegs; their paths ride in details.media.
// Then the flow hands off to the draft editor with everything prefilled.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, Upload, ScanLine, Sparkles, Loader2, X, RefreshCw, ArrowRight, AlertTriangle,
  CalendarDays, MapPin, Lightbulb,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ExtractedEvent } from '@/lib/events/types'
import type { DetailsMedia, EventDetailsWithMedia } from '@/lib/events/details-media'
import { scanPoster, saveDraft, discardScan } from './actions'
import {
  downscaleForScan, fileToImage, cropBoxToJpeg, deskewPoster, canvasToJpeg,
  mapBoxThroughHomography, type DeskewResult,
} from './image-tools'

const BUCKET = 'network-contacts'

type Stage = 'pick' | 'scanning' | 'review' | 'building'

export function Creator({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [stage, setStage] = useState<Stage>('pick')
  const [files, setFiles] = useState<File[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [msg, setMsg] = useState<{ kind: 'warn' | 'err'; text: string } | null>(null)

  const [extraction, setExtraction] = useState<ExtractedEvent | null>(null)
  const [posterPath, setPosterPath] = useState<string | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [deskewedUrl, setDeskewedUrl] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)

  // Heavy objects stay out of state: the downscaled scan blobs (crop sources)
  // and the deskewed canvas + its box-mapping homography.
  const scanBlobsRef = useRef<Blob[]>([])
  const deskewRef = useRef<DeskewResult | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    const incoming = list ? Array.from(list) : []
    if (incoming.length) {
      setFiles((prev) => [...prev, ...incoming].slice(0, 4))
      setThumbs((prev) => [...prev, ...incoming.map((f) => URL.createObjectURL(f))].slice(0, 4))
      setMsg(null)
    }
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  function removeFile(i: number) {
    setThumbs((prev) => {
      const url = prev[i]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, idx) => idx !== i)
    })
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function uploadBlob(blob: Blob): Promise<string> {
    const path = `${userId}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
    return path
  }

  async function runScan() {
    if (!files.length || stage === 'scanning') return
    setStage('scanning')
    setMsg(null)
    try {
      // ON-DEVICE: downscale + compress each shot before it leaves the phone.
      const blobs: Blob[] = []
      const paths: string[] = []
      for (const f of files) {
        const small = await downscaleForScan(f)
        blobs.push(small)
        paths.push(await uploadBlob(small))
      }
      scanBlobsRef.current = blobs

      const res = await scanPoster(paths)
      if (!res.ok) {
        setStage('pick')
        setMsg({
          kind: 'warn',
          text:
            res.reason === 'ai_unavailable'
              ? 'The poster reader is off right now. Try again a little later.'
              : 'Could not read that poster. Try a sharper, straight-on shot.',
        })
        return
      }

      setExtraction(res.extraction)
      setPosterPath(res.posterPath)
      setOriginalUrl(URL.createObjectURL(blobs[0]))

      // DESKEW: when the model located all four corners, square the poster up
      // with a canvas perspective warp + light auto-contrast (all on-device).
      deskewRef.current = null
      setDeskewedUrl(null)
      setShowOriginal(false)
      if (res.extraction.corners) {
        try {
          const img = await fileToImage(blobs[0])
          const result = deskewPoster(img, res.extraction.corners)
          if (result) {
            deskewRef.current = result
            const jpeg = await canvasToJpeg(result.canvas, 0.85)
            setDeskewedUrl(URL.createObjectURL(jpeg))
          }
        } catch {
          /* deskew is an enhancement — the original photo still works */
        }
      }
      setStage('review')
    } catch (err) {
      setStage('pick')
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong.' })
    }
  }

  async function retake() {
    if (posterPath) void discardScan(posterPath)
    thumbs.forEach((u) => URL.revokeObjectURL(u))
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    if (deskewedUrl) URL.revokeObjectURL(deskewedUrl)
    setFiles([])
    setThumbs([])
    setExtraction(null)
    setPosterPath(null)
    setOriginalUrl(null)
    setDeskewedUrl(null)
    deskewRef.current = null
    scanBlobsRef.current = []
    setMsg(null)
    setStage('pick')
  }

  /** Crop a normalized box (given on the ORIGINAL photo) from the working
   *  image: the deskewed canvas when available (box carried through the
   *  homography), else the original scan. */
  async function cropFromWorking(
    box: { x: number; y: number; w: number; h: number } | null,
    maxDim: number,
  ): Promise<Blob> {
    const deskew = deskewRef.current
    if (deskew) {
      if (!box) return cropBoxToJpeg(deskew.canvas, null, maxDim)
      const mapped = mapBoxThroughHomography(deskew.toDeskewed, box)
      if (mapped) return cropBoxToJpeg(deskew.canvas, mapped, maxDim)
      // The box fell outside the located poster — crop the original instead.
    }
    const img = await fileToImage(scanBlobsRef.current[0])
    return cropBoxToJpeg(img, box, maxDim)
  }

  async function buildDraft() {
    const e = extraction
    if (!e || stage === 'building') return
    setStage('building')
    setMsg(null)
    try {
      const media: DetailsMedia = {}

      // COVER: the model's cover box (mapped onto the squared poster), or the
      // whole poster when no usable region was found.
      try {
        if (e.cover.box && e.cover.imageIndex > 0 && e.cover.imageIndex < scanBlobsRef.current.length) {
          // The cover lives in a secondary shot — crop that image directly.
          const img = await fileToImage(scanBlobsRef.current[e.cover.imageIndex])
          media.coverPath = await uploadBlob(await cropBoxToJpeg(img, e.cover.box, 1000))
        } else {
          media.coverPath = await uploadBlob(await cropFromWorking(e.cover.box, 1000))
        }
      } catch {
        /* a draft without a cover is still a draft */
      }

      // REGION CROPS: each lineup photo + each gallery region, small jpegs.
      const lineup: Record<string, string> = {}
      for (let i = 0; i < (e.details.lineup?.length ?? 0); i++) {
        const box = e.details.lineup![i].imageBox
        if (!box) continue
        try {
          lineup[String(i)] = await uploadBlob(await cropFromWorking(box, 512))
        } catch { /* skip a failed crop */ }
      }
      if (Object.keys(lineup).length) media.lineup = lineup

      const gallery: Record<string, string> = {}
      for (let i = 0; i < (e.details.imageRegions?.length ?? 0); i++) {
        try {
          gallery[String(i)] = await uploadBlob(await cropFromWorking(e.details.imageRegions![i].box, 800))
        } catch { /* skip a failed crop */ }
      }
      if (Object.keys(gallery).length) media.gallery = gallery

      const details: EventDetailsWithMedia = {
        ...e.details,
        ...(Object.keys(media).length ? { media } : {}),
      }

      const res = await saveDraft({
        title: e.title,
        description: e.description,
        startsAt: e.startsAt || null,
        endsAt: e.endsAt || null,
        location: e.location,
        isFree: e.isFree,
        priceCents: e.priceCents,
        organizerName: e.organizerName,
        organizerContact: e.organizerContact,
        domain: e.domain,
        posterPath,
        details,
      })
      if ('error' in res) {
        setStage('review')
        setMsg({ kind: 'err', text: res.error })
        return
      }
      router.push(`/events/drafts/${res.id}`)
    } catch (err) {
      setStage('review')
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Something went wrong.' })
    }
  }

  const qualityPoor = !!extraction && (!extraction.quality.legible || extraction.quality.glare || extraction.quality.skew)

  const banner =
    msg &&
    (msg.kind === 'warn'
      ? 'border-primary/40 bg-primary-bg text-primary-strong'
      : 'border-danger/40 bg-danger-bg text-danger')

  // ── Scanning / building: calm progress ──────────────────────────────────────
  if (stage === 'scanning' || stage === 'building') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-strong" />
        <p className="mt-4 text-sm font-medium text-text">
          {stage === 'scanning' ? 'Reading the poster' : 'Building your draft'}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {stage === 'scanning'
            ? 'Vera is pulling out the who, when, and where. A few seconds.'
            : 'Squaring the image and cutting the cover. Almost there.'}
        </p>
      </div>
    )
  }

  // ── Review: quality gate + deskew toggle + confirm ──────────────────────────
  if (stage === 'review' && extraction) {
    const previewSrc = showOriginal ? originalUrl : (deskewedUrl ?? originalUrl)
    return (
      <div className="space-y-4">
        {msg && <p className={`rounded-lg border px-3 py-2 text-sm ${banner}`}>{msg.text}</p>}

        {qualityPoor && (
          <div className="rounded-2xl border border-primary/40 bg-primary-bg p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-primary-strong">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This shot is hard to read
            </p>
            <p className="mt-1 text-sm text-primary-strong">
              {extraction.quality.note ?? 'Some of the poster did not come through clearly. A straight-on shot of the whole poster works best.'}
            </p>
            <button
              type="button"
              onClick={retake}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              <RefreshCw className="h-4 w-4" /> Retake
            </button>
          </div>
        )}

        {previewSrc && (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt="Poster preview" className="max-h-[28rem] w-full object-contain" />
            {deskewedUrl && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                <p className="text-xs text-subtle">
                  {showOriginal ? 'Your original photo.' : 'Squared up and brightened for the listing.'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="shrink-0 text-xs font-semibold text-primary-strong hover:underline"
                >
                  {showOriginal ? 'Show squared' : 'Show original'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* What Vera read — a quick sanity check before the editor. */}
        <div className="rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <p className="text-sm font-bold text-text">{extraction.title || 'Untitled event'}</p>
          <div className="mt-1.5 space-y-1 text-xs text-muted">
            {extraction.startsAt && (
              <p className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-subtle" />
                {new Date(extraction.startsAt).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </p>
            )}
            {extraction.location && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" />
                {extraction.location}
              </p>
            )}
            <p className="text-subtle">You can fix any detail in the next step.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          {!qualityPoor ? (
            <button
              type="button"
              onClick={retake}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              <RefreshCw className="h-4 w-4" /> Retake
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={buildDraft}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {qualityPoor ? 'Use it anyway' : 'Continue to the draft'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── Pick: tip card + capture ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {msg && <p className={`rounded-lg border px-3 py-2 text-sm ${banner}`}>{msg.text}</p>}

      {/* The capture tip, up front — a good shot saves a retake. */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface-elevated/40 p-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary-strong" />
        <p className="text-sm text-muted">
          Get the whole poster in frame, squared up, no glare.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-center">
        <ScanLine className="mx-auto h-8 w-8 text-primary-strong" />
        <p className="mt-3 text-sm font-medium text-text">Snap the poster</p>
        <p className="mt-1 text-xs text-subtle">
          One straight-on shot usually does it. Add a close-up if the fine print matters.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <Camera className="h-4 w-4" /> Take a photo
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
          >
            <Upload className="h-4 w-4" /> Upload an image
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {thumbs.map((src, i) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-elevated">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Shot ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove shot ${i + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/55 p-0.5 text-white transition-colors hover:bg-black/70"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={runScan}
          disabled={files.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          {files.length <= 1 ? 'Read the poster' : `Read ${files.length} shots`}
        </button>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addFiles(e.target.files)} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
    </div>
  )
}
