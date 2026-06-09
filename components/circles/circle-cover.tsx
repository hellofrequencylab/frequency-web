import { InlineCover } from '@/components/admin/inline/inline-cover'

// Circle header band (events/profile-style hero). Full content width, tasteful
// height. Three states:
//   • manager  → <InlineCover>, which carries the upload / change / remove
//                affordances in Edit Mode (and just shows the image otherwise).
//   • member, image set → the cover image.
//   • member, no image → the default gradient (so the page always opens on a
//                         deliberate header band, never a bare title).
export function CircleCover({
  imageUrl,
  name,
  canManage,
  upload,
  remove,
}: {
  imageUrl: string | null
  name: string
  canManage: boolean
  upload: (fd: FormData) => Promise<{ url: string } | { error: string }>
  remove: () => Promise<void>
}) {
  if (canManage) {
    // Managers get the inline editor. When no image is set it still renders its
    // own "Add a cover image" affordance, so we don't double up with a gradient.
    return (
      <InlineCover
        value={imageUrl}
        alt={name}
        canEdit
        upload={upload}
        remove={remove}
      />
    )
  }

  return (
    <div className="relative mb-4 h-40 w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-signal to-signal-strong sm:h-52">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[url('/images/hero.jpg')] bg-cover bg-center opacity-30 mix-blend-overlay" />
      )}
    </div>
  )
}
