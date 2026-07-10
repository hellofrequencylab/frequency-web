import Image from 'next/image'

// MARKET HERO — the section header for the FOUR commerce surfaces (Classifieds / Market / Frequency
// Store / Housing), following the site's PhotoHero grammar (components/marketing/marketing-ui.tsx): a
// full-bleed image under a dark vertical gradient + the amber glow, a bold uppercase eyebrow, a heavy
// font-display uppercase title, a subtitle, an instant search bar, and an optional CTA, capped by the
// light strip. Contained (rounded). FIXED HEIGHT (min-h) so all four heroes render the SAME size
// regardless of their copy. Voice-canon copy comes from the caller (no em dashes).
export function MarketHero({
  image,
  eyebrow,
  title,
  subtitle,
  search,
  action,
}: {
  image: string
  eyebrow?: string
  title: React.ReactNode
  subtitle?: string
  /** The instant search bar (MarketSearchBar), rendered inside the hero image. */
  search?: React.ReactNode
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
      {/* Fixed min-height + centered content = every hero is the same height (matches the Frequency
          Store hero) no matter how much copy or how many controls it carries. */}
      <div className="relative z-10 mx-auto flex min-h-[24rem] max-w-3xl flex-col items-center justify-center px-6 py-12 text-center">
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
        {search && <div className="mt-6 w-full max-w-lg">{search}</div>}
        {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
      </div>
      <div className="light-strip absolute inset-x-0 bottom-0 z-10" aria-hidden />
    </section>
  )
}
