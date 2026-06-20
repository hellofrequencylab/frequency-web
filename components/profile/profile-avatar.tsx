import Image from 'next/image'

// The identity avatar shown in a profile's Detail title row (the brand mark for an
// entity space, the member's photo for a person). Inline beside the name, sized to
// sit on the title band below the cover — the house pattern shared with VeraProfile.
// Presentational + server-friendly (no hooks).
export function ProfileAvatar({
  src,
  name,
  initials,
  dimmed = false,
}: {
  /** The photo/logo URL; falls back to initials on a tinted disc when null. */
  src: string | null
  /** Alt text for the image. */
  name: string
  /** Two-letter fallback shown when there's no image. */
  initials: string
  /** Demo profiles desaturate their photo so they read as not-quite-real. */
  dimmed?: boolean
}) {
  return src ? (
    <Image
      src={src}
      alt={name}
      width={112}
      height={112}
      className={`h-16 w-16 shrink-0 rounded-full object-cover ring-4 ring-surface sm:h-20 sm:w-20 ${
        dimmed ? 'dimmed' : ''
      }`}
    />
  ) : (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xl font-semibold text-primary-strong ring-4 ring-surface sm:h-20 sm:w-20">
      {initials}
    </span>
  )
}
