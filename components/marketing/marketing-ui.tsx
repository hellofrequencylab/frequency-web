import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ── Shared building blocks for the public marketing pages ─────────────────────
// Token-only styling (DAWN system) so these stay consistent with the splash and
// the in-app surfaces. Presentational, server-renderable.

export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
}) {
  return (
    <section className="px-6 pt-20 pb-14 sm:pt-28 sm:pb-20">
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-4">
            {eyebrow}
          </p>
        )}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-text tracking-tight leading-[1.05]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-6 text-lg text-muted leading-relaxed max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
      </div>
    </section>
  )
}

export function Section({
  children,
  tone = 'surface',
  className = '',
}: {
  children: React.ReactNode
  tone?: 'surface' | 'canvas'
  className?: string
}) {
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : 'bg-surface'
  return (
    <section className={`px-6 py-16 sm:py-20 ${bg} ${className}`}>
      <div className="max-w-3xl mx-auto">{children}</div>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow?: string
  title: string
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">
        {title}
      </h2>
    </div>
  )
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-lg text-text/80 leading-relaxed mb-5">{children}</p>
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-muted leading-relaxed mb-5">{children}</p>
}

export function BetaCTA({
  heading,
  body,
}: {
  heading: string
  body?: string
}) {
  return (
    <section className="relative bg-surface px-6 py-20 text-center overflow-hidden">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, var(--color-primary-bg) 0%, transparent 70%)',
        }}
      />
      <div className="relative max-w-xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold text-text mb-4">{heading}</h2>
        {body && <p className="text-muted mb-9 leading-relaxed text-lg">{body}</p>}
        <Link
          href={BETA_CTA_HREF}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary text-on-primary px-9 py-4 text-base font-bold hover:bg-primary-hover transition-colors"
        >
          {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  )
}
