// PhotoHero — the one full-bleed splash hero.
//
// The photograph has to survive being a background. Three layers do that, in
// order: a warm ink gradient that is DARK at the edges and lighter across the
// middle third (so the picture is still a picture where no type sits), a vignette
// that pulls the corners down so centred type holds, and grain so the whole thing
// reads as one printed image rather than a photo with a scrim on it.
const NSH = window.DAWNFrequencyDesignSystem_c868e3;

function PhotoHero({ onNav }) {
  const { Button } = NSH;
  return (
    <section className="vignette grain mk-hero mk-ink" style={{ position: 'relative', minHeight: '94vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden', textAlign: 'center' }}>
      <img src="../../assets/images/hero.jpg" alt="A gathering at golden hour"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {/* Warm ink, weighted to the edges. The middle stays at 58% so the golden
          hour still reads through the headline instead of turning grey. */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,'
        + ' color-mix(in srgb, var(--color-ink) 92%, transparent) 0%,'
        + ' color-mix(in srgb, var(--color-ink) 66%, transparent) 24%,'
        + ' color-mix(in srgb, var(--color-ink) 58%, transparent) 48%,'
        + ' color-mix(in srgb, var(--color-ink) 82%, transparent) 78%,'
        + ' var(--color-ink) 100%)' }} />
      {/* One warm light from the horizon, the same move as the amber lamp in the
          reference rooms. Screen-blended so it lifts the photo instead of tinting it. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen',
        background: 'radial-gradient(ellipse 62% 46% at 50% 62%, color-mix(in srgb, var(--color-primary) 26%, transparent) 0%, transparent 70%)' }} />
      <div className="amber-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="stagger" style={{ position: 'relative', zIndex: 2, maxWidth: 900, padding: '5rem 1.5rem 4.5rem' }}>
        <p className="eyebrow reveal is-revealed" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 1.35rem',
          padding: '0.3rem 0.85rem 0.3rem 0.6rem', borderRadius: 'var(--radius-pill)', color: 'var(--color-primary)',
          background: 'color-mix(in srgb, var(--color-ink) 55%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-primary) 34%, transparent)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <span className="halo" style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: 'var(--color-primary)' }} />
          Now in open beta
        </p>
        <h1 className="font-display reveal is-revealed" style={{ margin: 0, color: 'var(--color-on-ink)',
          fontSize: 'clamp(3rem, 7.4vw, 5.6rem)', lineHeight: 0.92, letterSpacing: '-0.028em', textWrap: 'balance',
          textShadow: '0 2px 30px rgb(20 16 10 / 0.45)' }}>
          Get people together
        </h1>
        <p className="reveal is-revealed" style={{ margin: '0.1rem 0 0', fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
          fontSize: 'clamp(1.7rem, 3.4vw, 2.9rem)', lineHeight: 1.08, color: 'var(--color-primary)',
          textShadow: '0 2px 24px rgb(20 16 10 / 0.5)' }}>
          do things on purpose
        </p>
        <p className="reveal is-revealed text-shadow-soft" style={{ margin: '1.6rem auto 0', maxWidth: 550, color: 'var(--color-on-ink)', fontSize: '1.15rem', lineHeight: 1.65 }}>
          A hundred contacts and no real friends is a normal way to live now. Join a Circle near you, show up Thursday, and it stops being normal.
        </p>
        <div className="reveal is-revealed" style={{ marginTop: '2.1rem', display: 'flex', gap: '0.85rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button size="lg" iconRight={<window.MkIco n="arrow-right" style={{ width: 18, height: 18 }} />} onClick={() => onNav && onNav('beta')}>
            Join the Beta
          </Button>
          {/* Glass, not a ghost outline: it is sitting on moving photography, which
              is the one place glass earns its cost. */}
          <Button size="lg" variant="ghost" onClick={() => onNav && onNav('lab')} style={{ color: 'var(--color-on-ink)', borderRadius: 'var(--radius-control)',
              background: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
              backdropFilter: 'saturate(1.3) blur(16px)', WebkitBackdropFilter: 'saturate(1.3) blur(16px)',
              borderColor: 'color-mix(in srgb, var(--color-on-ink) 26%, transparent)' }}>
            See the space
          </Button>
        </div>
        <p className="reveal is-revealed text-shadow-soft" style={{ marginTop: '1.6rem', color: 'var(--color-on-ink-muted)', fontSize: '0.85rem', fontWeight: 700 }}>
          Free during the beta. No card today, leave anytime. Taking root in North County San Diego.
        </p>
      </div>

      <div className="animate-cue" style={{ position: 'absolute', bottom: 26, zIndex: 3, color: 'var(--color-on-ink-muted)' }}>
        <window.MkIco n="chevron-down" style={{ width: 24, height: 24 }} />
      </div>
      <div className="light-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4 }} />
    </section>
  );
}
window.PhotoHero = PhotoHero;
