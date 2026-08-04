// The loading placeholder (docs/INTERACTION-STATES.md §1 "loading"). It is a SHAPE, not
// content: `aria-hidden` keeps a screen reader from reading a wall of empty boxes while the
// real thing streams in. Put `aria-busy="true"` on the REGION these fill (the section, the
// list, the card) so assistive tech is told a result is coming; a Skeleton cannot say that
// for itself, because it does not know what it stands in for.
// `animate-pulse` is already collapsed under prefers-reduced-motion in app/globals.css, so
// this needs no motion guard of its own.
export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-border-strong ${className}`}
      {...props}
    />
  )
}
