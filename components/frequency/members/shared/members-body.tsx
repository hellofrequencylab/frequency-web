// THE MEMBER BODY FRAME (Frequency rebuild, ADR-1737/1740). Every Frequency member-page body in
// components/frequency/members/** renders inside this: the `data-kit="members"` scope the kit CSS is
// written against, then the kit's `.ap-main` column (design_handoff/frequency/templates/members/*.html
// open every page with `<main class="ap-main">`). The member shell owns the real <main>, header and
// rails; this owns the body only, so it renders a <div>, never a second <main>.
//
// The scope is stamped HERE as well as by the shell so a body still wears the kit when a route's own
// layout (the help centre's, say) is not the member shell. Nested scopes are harmless:
// members-c.css clears the inner one's canvas so the shell's wash shows through.
//
// Server Component. The two sheets are scoped to [data-design="frequency"] [data-kit="members"], so
// under DAWN they paint nothing.

import '@/app/themes/active/kit-members'
import '@/app/themes/active/members-c'

export function MembersBody({
  children,
  className,
}: {
  children: React.ReactNode
  /** Extra classes on the `.ap-main` column (e.g. `mc-center` for the Mindless and Help bodies). */
  className?: string
}) {
  return (
    <div data-kit="members" className="mc-root">
      <div className={className ? `ap-main ${className}` : 'ap-main'}>{children}</div>
    </div>
  )
}

/**
 * The kit's display title: the last word in the serif italic (`Mind <span class="serif">Journey.</span>`).
 * Data titles keep their own punctuation; only the reference's fixed titles carry the full stop.
 */
export function SerifTail({ text }: { text: string }) {
  const t = text.trim()
  const cut = t.lastIndexOf(' ')
  if (cut <= 0) return <span className="serif">{t}</span>
  return (
    <>
      {t.slice(0, cut)} <span className="serif">{t.slice(cut + 1)}</span>
    </>
  )
}
