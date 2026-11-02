'use client'

// /create-a-space, step 4: photos (docs/design-systems/create-a-space, README section 3, step 4). Three tabs: the
// cover, the logo (wordmark, monogram or their own) and their photo (the kit's portraits, their initial or their own).
// Their own pictures stay in the browser (lib/create-space/uploads.ts): the card hands a File up, the island keeps
// the object URL for the preview and the file in IndexedDB for the launch. "No photos yet? Keep these" is never a
// dead end. Styles: create-space.css (cs-tabs, cs-photo, cs-logo-opt, cs-upload).
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import type { BuilderDraft } from '@/lib/create-space/builder'
import type { KitImagery } from '@/lib/create-space/preview-site'
import type { UploadKind } from '@/lib/create-space/uploads'

type PhotoTab = 'cover' | 'logo' | 'profile'
const PHOTO_TABS: readonly [PhotoTab, string][] = [['cover', 'Cover photo'], ['logo', 'Logo'], ['profile', 'Your photo']]

/** Object URLs of their own pictures, by kind, for this visit. */
export type UploadUrls = Partial<Record<UploadKind, string>>

interface PhotosCardProps {
  draft: BuilderDraft
  patch: (p: Partial<BuilderDraft>) => void
  imagery: KitImagery
  /** The kit's --pv-* tokens, so the logo tiles wear the kit. */
  vars: Record<string, string>
  siteName: string
  initial: string
  hostInitial: string
  uploads: UploadUrls
  /** A picture of theirs was picked; the island checks it, keeps it and switches the slot to `up`. */
  onUpload: (kind: UploadKind, file: File) => void
  /** Why the last pick was refused, if it was. */
  uploadError: string | null
  onLater: () => void
  onNext: () => void
}

function UploadTile({ kind, label, round, onUpload }: { kind: UploadKind; label: string; round?: boolean; onUpload: PhotosCardProps['onUpload'] }) {
  return (
    <label className={round ? 'cs-upload cs-photo-round' : 'cs-upload'}>
      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(kind, f); e.target.value = '' }} />
      <FqIcon name="plus" size={18} />{label}
    </label>
  )
}

const Own = ({ src }: { src: string }) => <Image src={src} alt="" fill unoptimized sizes="120px" style={{ objectFit: 'cover' }} />

export function PhotosCard({ draft, patch, imagery, vars, siteName, initial, hostInitial, uploads, onUpload, uploadError, onLater, onNext }: PhotosCardProps) {
  const [tab, setTab] = useState<PhotoTab>('cover')
  const kitStyle = vars as CSSProperties
  return (
    <div className="cs-card fq-iri-rim">
      <h2 className="cs-card-h">Add a few <em>photos.</em></h2>
      <div role="tablist" aria-label="Photos" className="cs-tabs">
        {PHOTO_TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className="cs-tab" onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'cover' ? (
        <div className="cs-photo-grid" role="tabpanel">
          {uploads.cover ? (
            <button type="button" className="cs-photo" aria-label="Use your cover" aria-pressed={draft.cover === 'up'} onClick={() => patch({ cover: 'up' })}><Own src={uploads.cover} /></button>
          ) : null}
          {imagery.covers.map((src, i) => (
            <button key={src} type="button" className="cs-photo" aria-label="Use this cover" aria-pressed={draft.cover === `s${i}`} onClick={() => patch({ cover: `s${i}` })}>
              <Image src={src} alt="" fill sizes="120px" style={{ objectFit: 'cover' }} />
            </button>
          ))}
          <UploadTile kind="cover" label="Upload" onUpload={onUpload} />
        </div>
      ) : null}
      {tab === 'logo' ? (
        <div className="cs-photo-grid cs-photo-grid-3" role="tabpanel" style={kitStyle}>
          <button type="button" className="cs-logo-opt" aria-pressed={draft.logo === 'word'} onClick={() => patch({ logo: 'word' })}>
            <span className="cs-logo-word">{siteName}</span><span className="cs-logo-k">Wordmark</span>
          </button>
          <button type="button" className="cs-logo-opt" aria-pressed={draft.logo === 'mono'} onClick={() => patch({ logo: 'mono' })}>
            <span className="cs-logo-mono">{initial}</span><span className="cs-logo-k">Monogram</span>
          </button>
          {uploads.logo ? (
            <button type="button" className="cs-logo-opt cs-logo-own" aria-label="Use your logo" aria-pressed={draft.logo === 'up'} onClick={() => patch({ logo: 'up' })}>
              <span className="cs-logo-img"><Image src={uploads.logo} alt="" fill unoptimized sizes="120px" style={{ objectFit: 'contain' }} /></span><span className="cs-logo-k">Yours</span>
            </button>
          ) : (
            <UploadTile kind="logo" label="Upload yours" onUpload={onUpload} />
          )}
        </div>
      ) : null}
      {tab === 'profile' ? (
        <div className="cs-photo-grid" role="tabpanel" style={kitStyle}>
          {uploads.profile ? (
            <button type="button" className="cs-photo cs-photo-round" aria-label="Use your photo" aria-pressed={draft.profile === 'up'} onClick={() => patch({ profile: 'up' })}><Own src={uploads.profile} /></button>
          ) : null}
          {imagery.portraits.map((src, i) => (
            <button key={src} type="button" className="cs-photo cs-photo-round" aria-label="Use this photo" aria-pressed={draft.profile === `s${i}`} onClick={() => patch({ profile: `s${i}` })}>
              <Image src={src} alt="" fill sizes="120px" style={{ objectFit: 'cover' }} />
            </button>
          ))}
          <button type="button" className="cs-initials" aria-label="Use my initials" aria-pressed={draft.profile === 'initials'} onClick={() => patch({ profile: 'initials' })}>{hostInitial}</button>
          <UploadTile kind="profile" label="Upload" round onUpload={onUpload} />
        </div>
      ) : null}
      {uploadError ? <p role="alert" className="cs-err">{uploadError}</p> : null}
      <div className="cs-foot cs-foot-between">
        <button type="button" className="cs-later" onClick={onLater}>No photos yet? Keep these</button>
        <button type="button" className="cs-next" onClick={onNext}>Looks good<FqIcon name="arrow" size={16} /></button>
      </div>
    </div>
  )
}
