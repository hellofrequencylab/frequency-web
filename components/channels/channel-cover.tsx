// Channel header band — the display-only counterpart to CircleCover. Channel
// detail pages are not inline-editable, so there's no upload affordance: when a
// cover_image is set it leads the band, otherwise we open on a tasteful gradient
// so the page always starts on a deliberate header, never a bare title.
//
// Presentational + server-friendly (no hooks).
export function ChannelCover({
  imageUrl,
  name,
}: {
  imageUrl: string | null
  name: string
}) {
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
