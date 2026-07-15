'use client'

/**
 * Presentational "someone is typing…" row with animated dots.
 * Fed by useTypingIndicator (lib/realtime/use-typing.ts). Renders nothing when idle.
 */
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null

  let label: string
  if (names.length === 1) label = `${names[0]} is typing`
  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing`
  else label = 'Several people are typing'

  return (
    <div className="flex items-center gap-2 px-1 py-1 text-2xs text-subtle" aria-live="polite">
      <span className="flex items-center gap-0.5" aria-hidden>
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
      <span>{label}</span>
    </div>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1 w-1 rounded-full bg-subtle animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  )
}
