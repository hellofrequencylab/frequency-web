'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImageUpload } from '@/components/ui/image-upload'
import { isError } from '@/lib/action-result'
import { skipPhotoFormAction } from '@/lib/launch/actions'
import { setSpaceImages, uploadSpaceImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// The two buttons under a photo to-do item, and the upload tray they open. Add writes to the same Space record the
// item reads (the Space console's own upload and setSpaceImages), so the item ticks on the next render. Skip for now
// is a plain form post that the launch remembers. Neither is ever a gate, and the copy says it can change any time.

type Kind = 'cover' | 'logo'

export function PhotoActions({ itemId, kind, slug, spaceId, skipped }: { itemId: string; kind: Kind; slug: string; spaceId: string; skipped: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const noun = kind === 'cover' ? 'cover photo' : 'logo'

  const save = (img: { url: string; assetId?: string | null }) => {
    setUrl(img.url)
    setNote(null)
    start(async () => {
      const res = await setSpaceImages(slug, kind === 'cover' ? { coverImageUrl: img.url, coverImageAssetId: img.assetId ?? null } : { brandLogoUrl: img.url, brandLogoAssetId: img.assetId ?? null })
      if (isError(res)) setNote(res.error)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={skipped ? 'btn sm' : 'btn pa sm'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {skipped ? 'Add one' : open ? 'Close' : 'Add a photo'}
        </button>
        {!skipped ? (
          <form action={skipPhotoFormAction}>
            <input type="hidden" name="item" value={itemId} />
            <button type="submit" className="btn sm">Skip for now</button>
          </form>
        ) : null}
      </span>
      {open ? (
        <div className="panel" style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
          <ImageUpload
            value={url}
            onChange={(v) => {
              setUrl(v)
              if (v === null) setNote(null)
            }}
            onChangeAsset={save}
            label={kind === 'cover' ? 'Cover photo' : 'Logo or profile image'}
            hint={`Your ${noun} saves the moment you pick it. You can change it any time.`}
            folder={kind === 'cover' ? 'space-covers' : 'space-logos'}
            scopeKey={spaceId}
            kinds={['image', 'icon']}
            noUrlPaste
            disabled={pending}
            uploadFn={(file) => {
              const fd = new FormData()
              fd.append('file', file)
              return uploadSpaceImage(slug, kind, fd)
            }}
          />
          {note ? <p className="t2" role="status">{note}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
