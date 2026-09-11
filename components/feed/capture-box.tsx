'use client'

import { useRef, useState } from 'react'
import { PenLine, Megaphone, NotebookPen, UserPlus, Camera } from 'lucide-react'
import { updateMyAvatar } from '@/app/(main)/feed/actions'
import { uploadProfileImageAction } from '@/app/(main)/settings/profile/actions'
import { prepareImageForUpload } from '@/lib/library/image-shrink'
import { IconButton } from '@/components/ui/icon-button'
import { sendSpaceDispatch } from '@/app/(main)/spaces/[slug]/dispatch-actions'
import { isError } from '@/lib/action-result'
import { Composer } from './composer'
import { ContactCaptureForm } from './contact-capture-form'

// The Capture box — one Substack-style box, one **bottom row of selectable capture
// features** (the rework): Post · Dispatch · Note · Connect, rendered the way DAWN's
// composer renders them — one labelled chip for the active mode, bare icon buttons for
// the rest, on no track. Each selector shows just its icon until it's the active
// mode, when it reveals its label — so the row stays compact on a phone and the
// current mode reads at a glance. The active feature drives the editor + send
// behaviour; Dispatch (host announcement) is just one of the features. (Photo is
// reached through the full-screen Capture's camera, not this inline row.)

type Mode = 'post' | 'dispatch' | 'note' | 'photo' | 'contact'

/**
 * THE SPACE SCOPE (LIVE-295, owner ruling 2026-09-10). Present = this box is mounted FOR a Space
 * the viewer can manage, and its Dispatch mode announces to that Space's members instead of writing
 * a pinned community post.
 *
 * 🔴 THE SCOPE COMES FROM THE MOUNT. There is no default and no fallback: a box with no
 * `spaceScope` cannot reach the space send path at all, and the send path itself refuses a scope it
 * cannot resolve (app/(main)/spaces/[slug]/dispatch-actions.ts). The reason that matters is
 * lib/events/dispatch.ts, which writes audience_scope 'global' — the whole platform. A space
 * Dispatch that landed there would be a mass-notification incident, so the target is carried
 * explicitly, re-derived server-side, and refused on any miss.
 */
export interface CaptureSpaceScope {
  /** The Space id the mount rendered. Sent as an integrity check; the server re-derives from `slug`. */
  spaceId: string
  /** The Space slug. The SERVER's source of truth for which Space this Dispatch belongs to. */
  slug: string
  /** The Space's display name, for the box's own copy. */
  name: string
}

const MODES: { key: Mode; icon: typeof PenLine; label: string; hostOnly?: boolean }[] = [
  { key: 'post', icon: PenLine, label: 'Post' },
  { key: 'photo', icon: Camera, label: 'Photo' },
  { key: 'note', icon: NotebookPen, label: 'Note' },
  { key: 'contact', icon: UserPlus, label: 'Connect' },
  { key: 'dispatch', icon: Megaphone, label: 'Dispatch', hostOnly: true },
]

export function CaptureBox({
  scopeId,
  visibility = 'group',
  placeholder = 'What’s on your mind?',
  canAnnounce = false,
  defaultMode = 'post',
  compactTools = true,
  spaceScope,
}: {
  scopeId: string
  visibility?: 'public' | 'region' | 'cluster' | 'group'
  placeholder?: string
  canAnnounce?: boolean
  /** Mobile/contact-forward surfaces can open straight into 'contact'. */
  defaultMode?: Mode
  /** Fold the composer's formatting tools behind a "Format" toggle (default —
   *  this default must match the Composer's, or it silently overrides it). */
  compactTools?: boolean
  /** Mount this box FOR a Space (LIVE-295). See CaptureSpaceScope: Dispatch then announces to that
   *  Space's members, and `canAnnounce` comes from the Space's manage gate rather than the community
   *  role. Absent = the community box, unchanged. */
  spaceScope?: CaptureSpaceScope
}) {
  // A space mount opens on Dispatch: announcing is what the Space owner came here to do.
  const [mode, setMode] = useState<Mode>(spaceScope ? 'dispatch' : defaultMode)
  const [sent, setSent] = useState(false)

  // A SPACE mount carries ONE feature, and that is deliberate rather than a simplification. The other
  // four capture modes write to surfaces that belong to the PERSON, not the Space: Post and Photo go
  // to the member's own wall (`scopeId`), Note is their private journal, Connect saves a contact to
  // their own book. Offering them inside a Space's box would read as "post as the Space" and quietly
  // do something else, which is the mis-scoping this row was filed to prevent. When a Space grows a
  // feed of its own, its mode belongs in this list beside Dispatch.
  const modes = spaceScope
    ? MODES.filter((m) => m.key === 'dispatch')
    : MODES.filter((m) => !m.hostOnly || canAnnounce)

  // FAIL-CLOSED RENDER: a space mount whose viewer is not a manager shows nothing. `canAnnounce` on a
  // space mount comes from that Space's manage gate (resolveSpaceManageAccess), not the community
  // role, and the send action re-checks it server-side regardless.
  if (spaceScope && !canAnnounce) return null

  // The single condition that re-points the send. Narrowed so the override below cannot be reached
  // without a Space in hand — the type system carries the "never a global fallback" rule too.
  const spaceDispatch = spaceScope != null && mode === 'dispatch' ? spaceScope : null

  // One row of selectable capture features — never wraps; scrolls if it must.
  //
  // PATTERN: DAWN's own composer row (design_handoff/dawn/ui_kits/app/feed.jsx:138-148) is
  // the direct reference, so this is a copy rather than a judgement call: ONE active chip
  // that carries its label (radius-pill + a border-strong hairline + meta type), and every
  // other mode as a bare 32px radius-control icon button on no background. WHY not a tab
  // vocabulary: this switches what the editor beneath it DOES, it does not navigate between
  // views, so UnderlineTabs would be the wrong word for it.
  //
  // The thing that changed is the wrapper: the old `rounded-lg bg-surface-elevated p-0.5`
  // TRACK is what made these read as SaaS pill tabs, and DAWN has no such track anywhere —
  // not here, not in the right rail. Dropping it (and the `lift-1` on the active pill) is
  // the whole fix; the icon-then-label reveal DAWN also does is kept as it was.
  //
  // The inactive modes compose IconButton so the kit keeps owning the 32px density floor,
  // the coarse-pointer tap target, the focus ring and the press affordance. The active mode
  // stays a real <button aria-pressed> (DAWN's mock renders a dead <span>) so the row is
  // still one coherent set of toggles to a screen reader.
  const featureRow = (
    <div className="flex flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {modes.map((m) => {
        const active = mode === m.key
        return active ? (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-border-strong px-3 py-1.5 text-meta font-bold ${
              m.key === 'dispatch' ? 'text-warning' : 'text-text'
            }`}
          >
            <m.icon className="h-3.5 w-3.5" aria-hidden />
            {/* Reveal the label only for the active mode — icon-only otherwise. */}
            <span>{m.label}</span>
          </button>
        ) : (
          <IconButton
            key={m.key}
            label={m.label}
            tone={m.key === 'dispatch' ? 'warning' : 'default'}
            onClick={() => setMode(m.key)}
            aria-pressed={false}
            className="shrink-0"
          >
            <m.icon className="h-4 w-4" aria-hidden />
          </IconButton>
        )
      })}
    </div>
  )

  if (mode === 'contact') {
    return (
      <div className="rounded-card bg-surface p-4 lift-1">
        <ContactCaptureForm />
        <TakeProfilePic />
        <div className="mt-3 border-t border-border pt-3">{featureRow}</div>
      </div>
    )
  }

  return (
    // One line shorter here than the inline feed composer: drop the textarea's
    // resting min-height by a single line (6rem to 4.5rem, about one line of
    // leading-relaxed 15px text). Auto-grow still sets an explicit height as you
    // type, so this only lowers the floor and never caps the box.
    <div className="[&_textarea]:min-h-[4.5rem]">
      <Composer
        key={mode}
        scopeId={scopeId}
        compactTools={compactTools}
        visibility={visibility}
        kind={mode === 'note' ? 'note' : 'post'}
        autoImage={mode === 'photo'}
        forceAnnouncement={mode === 'dispatch'}
        bottomSlot={featureRow}
        placeholder={
          spaceDispatch
            ? `What do ${spaceDispatch.name} members need to know?`
            : mode === 'note'
              ? 'Jot a note: what happened, what you noticed…'
              : placeholder
        }
        submitLabel={spaceDispatch ? 'Send Dispatch' : 'Capture'}
        // THE ONE WRITE SEAM. Only a space mount ON the Dispatch mode overrides the send, and the
        // override names its Space explicitly. Everything else keeps the default createPost path, so
        // no existing surface changes shape.
        onSubmit={
          spaceDispatch
            ? async ({ body, imageUrl }) => {
                setSent(false)
                // A Dispatch is text. Say so rather than uploading a photo nobody will ever see.
                if (imageUrl) return { error: 'A Dispatch is text only. Remove the photo to send it.' }
                const res = await sendSpaceDispatch({
                  spaceId: spaceDispatch.spaceId,
                  slug: spaceDispatch.slug,
                  body,
                })
                if (isError(res)) return { error: res.error }
                setSent(true)
              }
            : undefined
        }
      />
      {sent && spaceScope && (
        <p className="mt-2 text-meta text-success">
          Sent. Every member of {spaceScope.name} will see it on their Dispatch rail.
        </p>
      )}
    </div>
  )
}

// "Take a profile pic" inside the Connect feature: front camera straight to your
// avatar — same storage path the onboarding upload uses (avatars/<uid>/avatar.ext),
// persisted through the updateMyAvatar action. Quiet failure copy; never blocks.
function TakeProfilePic() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [prepError, setPrepError] = useState<string | null>(null)

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    e.target.value = ''
    if (!raw) return
    setPrepError(null)
    setState('saving')
    // Prep in the browser first (the shared seam): a HEIC capture is converted to JPEG (a raw HEIC
    // stores fine but renders broken in every browser but Safari), then big photos are downscaled so
    // the server action stays under the platform body limit.
    const prepared = await prepareImageForUpload(raw)
    if ('error' in prepared) {
      setPrepError(prepared.error)
      setState('idle')
      return
    }
    const file = prepared.file
    try {
      // Upload through the SERVER action (service-role write), not the browser Supabase
      // client: under SSR-cookie auth the browser client often has no session, so a
      // direct storage.upload() runs as `anon` and fails the owner-INSERT RLS policy —
      // the photo silently never lands. The action resolves auth from the session.
      const fd = new FormData()
      fd.append('file', file, file.name || 'avatar.jpg')
      fd.append('kind', 'avatar')
      const publicUrl = await uploadProfileImageAction(fd)
      await updateMyAvatar(publicUrl)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => void onSelect(e)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === 'saving'}
        className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
      >
        <Camera className="h-3.5 w-3.5" />
        {state === 'saving'
          ? 'Saving…'
          : state === 'done'
            ? 'Profile pic updated'
            : 'Take a profile pic'}
      </button>
      {state === 'error' && (
        <p className="mt-1 text-2xs text-danger">That didn’t save. Try again, or set it in Settings.</p>
      )}
      {prepError && <p className="mt-1 text-2xs text-danger">{prepError}</p>}
    </div>
  )
}
