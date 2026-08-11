// The loading placeholder (docs/INTERACTION-STATES.md §1 "loading"). It is a SHAPE, not
// content: `aria-hidden` keeps a screen reader from reading a wall of empty boxes while the
// real thing streams in. Put `aria-busy="true"` on the REGION these fill (the section, the
// list, the card) so assistive tech is told a result is coming; a Skeleton cannot say that
// for itself, because it does not know what it stands in for.
// `animate-pulse` is already collapsed under prefers-reduced-motion in app/globals.css, so
// this needs no motion guard of its own.

/**
 * Does `className` already name a border-radius?
 *
 * Tolerates variant prefixes (`sm:`, `hover:`, `group-hover:`) and matches the whole family:
 * bare `rounded`, the numeric steps, the theme tokens (`rounded-card`, `rounded-pill`), the
 * side/corner forms (`rounded-t`, `rounded-tl-lg`) and arbitrary values (`rounded-[3px]`).
 */
function hasRadius(className: string): boolean {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => {
      const base = token.slice(token.lastIndexOf(':') + 1)
      return base === 'rounded' || base.startsWith('rounded-')
    })
}

export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  // 🔴 THE DEFAULT RADIUS IS CONDITIONAL, AND THAT IS THE FIX (docs/FINALIZE-PLAN §9.12).
  //
  // This used to hardcode `rounded-control` and append `className` after it. `cn` in this repo
  // (lib/utils.ts:4) is a plain `.filter(Boolean).join(' ')` with no tailwind-merge semantics, so
  // both radii landed on one element and the winner was whichever Tailwind emitted LAST. Emission
  // is ALPHABETICAL, measured off the built stylesheet:
  //
  //   rounded-2xl → rounded-3xl → rounded-card → rounded-control → rounded-full
  //   → rounded-lg → rounded-md → rounded-none → rounded-pill → rounded-sm → rounded-xl
  //
  // So `rounded-control` beat exactly the three sorting before it. Of 329 call sites, 126 passed
  // a radius and **52 were silently overridden**: rounded-2xl (36), rounded-card (10),
  // rounded-3xl (6). The other 74 — lg, xl, md, pill, none, t — sort after and always worked,
  // which is why this never looked like a systemic bug. Visible symptom: lead/loading.tsx and
  // space-dashboard.tsx rendered placeholders with tighter corners than the cards that replaced
  // them, so those surfaces snapped their corners on hydration.
  //
  // Suppressing the default when the caller names one fixes all 52 and leaves all 74 byte-identical,
  // with no call-site churn. A `radius` PROP (the shape the Card `pad` fix used) would have meant
  // editing 126 call sites to move a class from `className` into a prop — more churn, more risk,
  // and it would still silently lose for anyone who kept using `className` out of habit.
  return (
    <div
      aria-hidden
      className={`animate-pulse ${hasRadius(className) ? '' : 'rounded-control'} bg-border-strong ${className}`}
      {...props}
    />
  )
}
