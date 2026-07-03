import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import { spaceTypeLabel } from '@/components/spaces/space-type'

// THE EXTERNAL WEBSITE CHROME (ADR-508 U4-B). A deliberately LIGHT public brand shell for a Space's
// standalone micro-site at /sites/<slug>: a quiet top brand bar (logo chip + brand name + the space
// type label) and a quiet footer (a "Made on Frequency" link + a link back to the in-app profile). It
// carries NO app shell, no nav rails, no auth chrome, so a signed-out visitor sees a clean branded page
// with the Puck-rendered body in the middle. This is scaffolding, not a full site header: a dedicated
// website template is a follow-up. Server Component (no hooks). DAWN semantic tokens only (no hex),
// responsive, theme-aware; no em dashes (CONTENT-VOICE §10).
export function SpaceWebsiteShell({
  brandName,
  type,
  logoUrl,
  slug,
  children,
}: {
  brandName: string
  type: string
  logoUrl: string | null
  slug: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas text-text">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <BrandChip name={brandName} logoUrl={logoUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text">{brandName}</p>
            <p className="truncate text-2xs font-medium text-muted">{spaceTypeLabel(type)}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <Link
            href="/"
            className="text-2xs font-semibold uppercase tracking-wide text-subtle transition-colors hover:text-text"
          >
            Made on Frequency
          </Link>
          <Link
            href={`/spaces/${slug}`}
            className="text-2xs font-medium text-muted transition-colors hover:text-text"
          >
            View on Frequency
          </Link>
        </div>
      </footer>
    </div>
  )
}

// The brand LOGO chip: the operator's logo, or a neutral initials chip. Decorative (alt=""): the brand
// name sits beside it as text.
function BrandChip({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandAnchor / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg border border-border bg-surface object-contain"
      />
    )
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-xs font-bold text-subtle"
      aria-hidden
    >
      {getInitials(name)}
    </span>
  )
}
