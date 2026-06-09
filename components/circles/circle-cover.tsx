// Circle header band (events/profile-style hero). Full content width, tasteful
// height. Display-only: the cover IMAGE when set, else a warm gradient so the page
// always opens on a deliberate header band, never a bare title. Editing the cover
// lives in the Settings panel (Circle settings), not inline on the page.
export function CircleCover({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  return (
    <div className="relative mb-5 h-44 w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-signal to-signal-strong sm:h-56">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[url('/images/hero.jpg')] bg-cover bg-center opacity-30 mix-blend-overlay" />
      )}
    </div>
  )
}
