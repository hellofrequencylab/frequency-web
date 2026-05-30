import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ── Shared building blocks for the public marketing pages ─────────────────────
// Editorial treatment: heavy condensed display headings (.font-display, set up
// in globals.css from the Anton face), accent-colored keywords, italic kickers.
// Token-only colors (warm DAWN palette). Body stays Nunito.

export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
}) {
  return (
    <section className="px-6 pt-20 pb-12 sm:pt-28 sm:pb-16">
      <div className="max-w-3xl mx-auto text-center">
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary-strong mb-5">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display uppercase text-text text-5xl sm:text-7xl lg:text-8xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-7 text-lg text-muted leading-relaxed max-w-2xl mx-auto">
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
  kicker,
}: {
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary-strong mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">{title}</h2>
      {kicker && <p className="mt-3 text-lg italic text-muted">{kicker}</p>}
    </div>
  )
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-lg text-text/80 leading-relaxed mb-5">{children}</p>
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-muted leading-relaxed mb-5">{children}</p>
}

// Big full-width typographic interstitial — the rhythm device between sections.
// Wrap accent words in <span className="text-primary"> inside children.
export function Statement({
  children,
  tone = 'canvas',
}: {
  children: React.ReactNode
  tone?: 'surface' | 'canvas'
}) {
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : 'bg-surface'
  return (
    <section className={`${bg} px-6 py-16 sm:py-24`}>
      <p className="font-display uppercase max-w-5xl mx-auto text-center text-text text-4xl sm:text-6xl lg:text-7xl">
        {children}
      </p>
    </section>
  )
}

// Alternating image / text row. `reverse` flips the image to the right.
export function ZigZag({
  img,
  alt,
  eyebrow,
  title,
  kicker,
  children,
  cta,
  reverse = false,
  tone = 'surface',
  imgAspect = 'landscape',
}: {
  img: string
  alt: string
  eyebrow?: string
  title: React.ReactNode
  kicker?: string
  children: React.ReactNode
  cta?: { label: string; href: string }
  reverse?: boolean
  tone?: 'surface' | 'canvas'
  imgAspect?: 'square' | 'portrait' | 'landscape'
}) {
  const bg = tone === 'canvas' ? 'bg-marketing-canvas' : 'bg-surface'
  const aspect =
    imgAspect === 'portrait' ? 'aspect-[3/4]' : imgAspect === 'square' ? 'aspect-square' : 'aspect-[4/3]'
  // Smaller, contained images with whitespace (closer to an editorial layout)
  // rather than full half-column fills.
  const maxW = imgAspect === 'landscape' ? 'max-w-md' : 'max-w-xs'
  return (
    <section className={`${bg} px-6 py-16 sm:py-20`}>
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
        <div
          className={`mx-auto w-full ${maxW} rounded-3xl overflow-hidden border border-border shadow-sm ${
            reverse ? 'md:order-last' : ''
          }`}
        >
          <img src={img} alt={alt} className={`w-full object-cover ${aspect}`} />
        </div>
        <div>
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary-strong mb-3">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display uppercase text-text text-4xl sm:text-5xl">{title}</h2>
          {kicker && <p className="mt-2 mb-5 text-lg italic text-muted">{kicker}</p>}
          <div className={`text-base text-muted leading-relaxed space-y-4 ${kicker ? '' : 'mt-5'}`}>
            {children}
          </div>
          {cta && (
            <Link
              href={cta.href}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline"
            >
              {cta.label} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

// Pure-CSS marquee strip (see .animate-marquee in globals.css). Items are
// duplicated once so the -50% translate loops seamlessly.
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items]
  return (
    <div className="overflow-hidden border-y border-white/10 py-5 select-none">
      <div className="flex w-max animate-marquee items-center whitespace-nowrap">
        {row.map((t, i) => (
          <span key={i} className="flex items-center font-display uppercase text-3xl text-white/15">
            <span className="px-7">{t}</span>
            <span className="text-primary text-xl">&bull;</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function BetaCTA({
  heading,
  body,
}: {
  heading: React.ReactNode
  body?: string
}) {
  return (
    <section className="relative bg-surface px-6 py-20 text-center overflow-hidden">
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, var(--color-primary-bg) 0%, transparent 70%)',
        }}
      />
      <div className="relative max-w-xl mx-auto">
        <h2 className="font-display uppercase text-text text-4xl sm:text-6xl mb-5">{heading}</h2>
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
