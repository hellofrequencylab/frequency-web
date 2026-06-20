import Image from 'next/image'

// The profile cover band — the member's header image when set, else the default
// gradient. Rendered in the DetailTemplate `hero` slot, full-width above the
// identity band (the house pattern: a cover band, then the identity band below it,
// like CircleCover on a circle). Presentational + server-friendly (no hooks), so an
// entity-space profile reuses it verbatim.
export function ProfileCover({
  imageUrl,
  dimmed = false,
}: {
  /** The member's header image; the default gradient shows when null. */
  imageUrl: string | null
  /** Demo profiles desaturate their imagery so they read as not-quite-real. */
  dimmed?: boolean
}) {
  return (
    <div className="relative h-28 overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-signal to-signal-strong sm:h-52">
      {imageUrl ? (
        <Image
          fill
          sizes="100vw"
          src={imageUrl}
          alt=""
          className={`object-cover ${dimmed ? 'dimmed' : ''}`}
        />
      ) : (
        <div className="absolute inset-0 bg-[url('/images/hero.jpg')] bg-cover bg-center opacity-30 mix-blend-overlay" />
      )}
    </div>
  )
}
