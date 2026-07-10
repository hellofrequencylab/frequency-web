import Image from 'next/image'

// MARKET HERO — the section header for the commerce surfaces (Classifieds / Market / Frequency Store),
// following the site's PhotoHero grammar (components/marketing/marketing-ui.tsx): a full-bleed image
// under a dark vertical gradient + the amber glow, a bold uppercase eyebrow, a heavy font-display
// uppercase title, a subtitle, and an optional CTA, capped by the light strip. Contained (rounded) so
// it sits inside the app shell. Voice-canon copy comes from the caller (no em dashes).
export function MarketHero({
  image,
  eyebrow,
  title,
  subtitle,
  action,
}: {
  image: string
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border">
      <Image src={image} alt="" fill preload sizes="100vw" className="object-cover object-center" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(20 18 16 / 0.80) 0%, rgb(20 18 16 / 0.55) 45%, rgb(20 18 16 / 0.92) 100%)',
        }}
        aria-hidden
      />
      <div className="amber-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-16 text-center sm:py-24">
        {eyebrow && (
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-primary">{eyebrow}</p>
        )}
        <h1 className="font-display uppercase leading-[0.95] text-balance text-white text-[clamp(2rem,6vw,3.75rem)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            {subtitle}
          </p>
        )}
        {action && <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{action}</div>}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" aria-hidden />
    </section>
  )
}
