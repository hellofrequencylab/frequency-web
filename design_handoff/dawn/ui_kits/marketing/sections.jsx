// The marketing content sections, composed from DAWN primitives + the editorial
// layout patterns (Section rhythm, ZigZag, the dark "beat", stat strip, FAQ).
const NSS = window.DAWNFrequencyDesignSystem_c868e3;

// The editorial header: Anton line, then the Playfair italic that the brand owns.
// One per section, and the italic line is the one that carries the feeling.
function EdHead({ eyebrow, title, script, blurb, align = 'center', tone = 'light' }) {
  const ink = tone === 'ink';
  return (
    <div style={{ textAlign: align, maxWidth: align === 'center' ? 'var(--width-hero)' : 'none',
      margin: align === 'center' ? '0 auto' : 0 }}>
      {eyebrow ? (
        <p className="eyebrow" style={{ margin: 0, color: ink ? 'var(--color-primary)' : 'var(--color-primary-strong)' }}>{eyebrow}</p>
      ) : null}
      <h2 className="font-display" style={{ margin: '0.7rem 0 0', fontSize: 'var(--text-display-h2)',
        color: ink ? 'var(--color-on-ink)' : 'var(--color-text)' }}>{title}</h2>
      {script ? (
        <p style={{ margin: '0.1rem 0 0', fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
          fontSize: 'clamp(1.5rem, 3vw, 2.3rem)', lineHeight: 1.15, color: 'var(--color-primary)' }}>{script}</p>
      ) : null}
      {blurb ? (
        <p style={{ margin: '1.1rem auto 0', maxWidth: 'var(--width-read)', fontSize: '1.15rem', lineHeight: 1.65,
          color: ink ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)' }}>{blurb}</p>
      ) : null}
    </div>
  );
}
window.MkEdHead = EdHead;

// A full-bleed section with the shared vertical rhythm + tone background.
function Section({ tone = 'surface', width = 'var(--width-read)', children, style }) {
  const bg = tone === 'canvas' ? 'var(--color-marketing-canvas)' : tone === 'ink' ? '' : 'var(--color-surface)';
  return (
    <section className={(tone === 'ink' ? 'bg-slat mk-ink' : 'mk-cream') + ' mk-beat'} style={{ background: bg, ...style }}>
      <div style={{ maxWidth: width, margin: '0 auto' }}>{children}</div>
    </section>
  );
}
window.MkSection = Section;

// The three brand pillars, the "orient" grid right under the hero.
function PillarGrid() {
  const { SectionHeading, Card } = NSS;
  const pillars = [
    { icon: 'flame', n: '1', t: 'The Lab', d: 'The body of community: heat then cold, steam, cedar, low amber light. A third place with a sauna, cold plunge, and rooms to gather.' },
    { icon: 'users', n: '2', t: 'The Community', d: 'Find your people by what you love. Join a Circle, a small standing local group, and be missed when you are gone.' },
    { icon: 'compass', n: '3', t: 'The Quest', d: 'A light, honest game that rewards showing up in person, inviting strangers, and backing local life. Not screen time.' },
  ];
  const shots = ['../../assets/images/lab-thermal.jpg', '../../assets/images/community-1.jpg', '../../assets/images/gathering-1.jpg'];
  return (
    <Section tone="surface" width="var(--width-wide)">
      <EdHead eyebrow="Place · People · Path" title="One community" script="two engines"
        blurb="A worldwide framework anybody can start from, and brick-and-mortar rooms where it lands." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 26, marginTop: 'var(--space-10)' }}>
        {pillars.map((p, i) => (
          <div key={p.t}>
            <div style={{ borderRadius: 'var(--radius-2xl)', overflow: 'hidden', position: 'relative' }}>
              <img src={shots[i]} alt="" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', top: 12, left: 12, width: 30, height: 30, borderRadius: '50%',
                display: 'grid', placeItems: 'center', background: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
                fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>{p.n}</span>
            </div>
            <h3 className="font-display" style={{ margin: '1.1rem 0 0', fontSize: '1.7rem', color: 'var(--color-text)' }}>{p.t}</h3>
            <p style={{ margin: '0.55rem 0 0', fontSize: '1rem', lineHeight: 1.65, color: 'var(--color-text-muted)' }}>{p.d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
window.PillarGrid = PillarGrid;

// Alternating image / text editorial row.
function ZigZag({ img, alt, eyebrow, title, body, reverse, tone = 'surface', cta }) {
  const { SectionHeading } = NSS;
  const isInk = tone === 'ink';
  return (
    <Section tone={tone} width="var(--width-wide)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }} className="mk-zig">
        <div style={{ order: reverse ? 2 : 1, borderRadius: 'var(--radius-2xl)', overflow: 'hidden',
          border: isInk ? '1px solid var(--color-ink-border)' : '1px solid var(--color-border)',
          boxShadow: isInk ? 'var(--shadow-pop)' : 'var(--shadow-md)' }}>
          <img src={img} alt={alt} style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
        </div>
        <div style={{ order: reverse ? 1 : 2 }}>
          <SectionHeading tone={isInk ? 'ink' : 'light'} eyebrow={eyebrow} title={title} />
          <div style={{ fontSize: '1.05rem', lineHeight: 1.7, color: isInk ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)' }}>{body}</div>
          {cta && (
            <a style={{ marginTop: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.04em', color: isInk ? 'var(--color-primary)' : 'var(--color-primary-strong)', cursor: 'pointer' }}>
              {cta} <window.MkIco n="arrow-right" style={{ width: 16, height: 16 }} />
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}
window.ZigZag = ZigZag;

// The cinematic dark interstitial — a typographic statement on the ink band,
// seamed top + bottom with the light-strip.
function Statement({ children }) {
  return (
    <>
      <div className="light-strip" />
      <section className="bg-slat mk-band mk-ink" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="amber-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        <p className="font-display" style={{ position: 'relative', maxWidth: 'var(--width-hero)', margin: '0 auto', textAlign: 'center',
          color: 'var(--color-on-ink)', fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', lineHeight: 1.1 }}>
          {children}
        </p>
      </section>
      <div className="light-strip" />
    </>
  );
}
window.MkStatement = Statement;

// Proof — a three-up stat strip (gated behind the social-proof floor in prod).
function StatStrip() {
  const { Stat, SectionHeading } = NSS;
  return (
    <Section tone="surface" width="var(--width-wide)">
      <EdHead eyebrow="Proof, not adjectives" title="We count" script="who showed up" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
        <Stat value="212" label="Circles met last week" />
        <Stat value="64%" label="came back the next week" />
        <Stat value="0" label="minutes of screen time measured" />
      </div>
      <p style={{ margin: '1.75rem auto 0', maxWidth: 'var(--width-read)', textAlign: 'center', fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>
        Every number here is a count of something that happened in a room. We do not measure time on site, and we never will.
      </p>
    </Section>
  );
}
window.StatStrip = StatStrip;

// FAQ — native <details> disclosures at the shared rhythm.
function FaqList({ items = DEFAULT_FAQ, tone = 'canvas' }) {
  return (
    <Section tone={tone}>
      <EdHead eyebrow="Plainly" title="Questions" script="answered plainly" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((f) => (
          <details key={f.q} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', padding: '1rem 1.25rem' }}>
            <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: 16, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)' }}>
              {f.q}<window.MkIco n="chevron-down" style={{ width: 18, height: 18, color: 'var(--color-text-subtle)', flexShrink: 0 }} />
            </summary>
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--color-text-muted)' }}>{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
window.FaqList = FaqList;

const DEFAULT_FAQ = [
    { q: 'Is it really free?', a: 'Yes. The Member tier is free forever, there is no card to start, and you can leave anytime. Crew is the paid personal tier, and you choose what you contribute.' },
    { q: 'Where is Frequency?', a: 'The first Lab is taking root in North County San Diego. A Circle can start anywhere on Earth, and plenty already have.' },
    { q: 'What is a Circle?', a: 'A small standing local group around one interest that meets weekly. It is the atomic unit of the whole thing.' },
    { q: 'Is this a meditation app?', a: 'Yes, partly. We made it a game so you would actually do it, and the game only pays out for things you do with other people in real life.' },
];

// The closing CTA — dark beat with the amber glow + seam.
function BetaCTA({ onNav }) {
  const { Button } = NSS;
  return (
    <section className="bg-slat mk-band mk-ink" style={{ position: 'relative', textAlign: 'center', overflow: 'hidden' }}>
      <div className="light-strip" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
      <div className="amber-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: 'var(--width-narrow)', margin: '0 auto' }}>
        <h2 className="font-display" style={{ margin: 0, color: 'var(--color-on-ink)', fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>
          You're not a user here. <span style={{ color: 'var(--color-primary)' }}>You're a founder.</span>
        </h2>
        <p style={{ margin: '1.25rem auto 2rem', maxWidth: 460, color: 'var(--color-on-ink-muted)', fontSize: '1.15rem', lineHeight: 1.6 }}>
          The feed that ate everyone's attention, we're building the thing that takes it back. Come build it.
        </p>
        <Button size="lg" iconRight={<window.MkIco n="arrow-right" style={{ width: 18, height: 18 }} />} onClick={() => onNav && onNav('beta')}>
          Join the Beta
        </Button>
      </div>
    </section>
  );
}
window.BetaCTA = BetaCTA;

// ── PageHero ────────────────────────────────────────────────────────────────
// The shared photographic opening. Every public page except pricing starts here,
// so the site has one entrance and only the photograph and the words change.
//
// The picture has to survive being a background, which takes three layers in a
// fixed order: a warm ink gradient weighted to the EDGES (the middle third stays
// light, so the photograph is still a photograph where no type sits), a vignette
// so centred type holds, and grain so scrim and image read as one printed thing.
function PageHero({ image, alt = '', eyebrow, title, script, lead, primary, secondary, facts, align = 'center', aside, onNav, height = '86vh' }) {
  const { Button } = NSS;
  const centered = align === 'center';
  // A fact dock overhangs the hero, so the hero tells the next section to clear it.
  return (
    <section className={'vignette grain mk-hero mk-ink' + (facts ? ' mk-hero-dock' : '')} style={{ position: 'relative', minHeight: height, display: 'grid',
      placeItems: centered ? 'center' : 'center start', overflow: 'hidden', padding: '6rem 1.5rem ' + (facts ? '9.5rem' : '5rem') }}>
      <img src={image} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,'
        + ' color-mix(in srgb, var(--color-ink) 90%, transparent) 0%,'
        + ' color-mix(in srgb, var(--color-ink) 64%, transparent) 26%,'
        + ' color-mix(in srgb, var(--color-ink) 56%, transparent) 48%,'
        + ' color-mix(in srgb, var(--color-ink) 84%, transparent) 80%,'
        + ' var(--color-ink) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen',
        background: 'radial-gradient(ellipse 60% 44% at 50% 60%, color-mix(in srgb, var(--color-primary) 22%, transparent) 0%, transparent 70%)' }} />
      <div className="amber-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 3, width: '100%', maxWidth: aside ? 'var(--width-wide)' : 'var(--width-hero)',
        margin: '0 auto', display: aside ? 'grid' : 'block', gridTemplateColumns: aside ? 'minmax(0, 1.15fr) 20rem' : undefined,
        gap: 40, alignItems: 'center', textAlign: centered ? 'center' : 'left' }} className="mk-hero-grid">
        <div>
          {eyebrow ? (
            <p className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '0 0 1.3rem',
              padding: '0.3rem 0.85rem 0.3rem 0.6rem', borderRadius: 'var(--radius-pill)', color: 'var(--color-primary)',
              background: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-primary) 32%, transparent)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
              <span className="halo" style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: 'var(--color-primary)' }} />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display" style={{ margin: 0, color: 'var(--color-on-ink)', fontSize: 'clamp(2.9rem, 6.8vw, 5.2rem)',
            lineHeight: 0.92, letterSpacing: '-0.028em', textWrap: 'balance', textShadow: '0 2px 30px rgb(20 16 10 / 0.45)' }}>{title}</h1>
          {script ? (
            <p style={{ margin: '0.1rem 0 0', fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
              fontSize: 'clamp(1.6rem, 3.3vw, 2.8rem)', lineHeight: 1.08, color: 'var(--color-primary)',
              textShadow: '0 2px 24px rgb(20 16 10 / 0.5)' }}>{script}</p>
          ) : null}
          {lead ? (
            <p className="text-shadow-soft" style={{ margin: centered ? '1.5rem auto 0' : '1.5rem 0 0', maxWidth: '35rem',
              color: 'var(--color-on-ink)', fontSize: '1.15rem', lineHeight: 1.65 }}>{lead}</p>
          ) : null}
          {primary || secondary ? (
            <div style={{ display: 'flex', gap: 12, marginTop: '2rem', flexWrap: 'wrap', justifyContent: centered ? 'center' : 'flex-start' }}>
              {primary ? (
                <Button size="lg" iconRight={<window.MkIco n="arrow-right" style={{ width: 18, height: 18 }} />} onClick={() => onNav && onNav('beta')}>{primary}</Button>
              ) : null}
              {/* The secondary is glass, not a ghost outline: it sits on moving
                  photography, the one place glass earns its cost. The treatment must
                  be inline — Button's own inline transparent background beats a class. */}
              {secondary ? (
                <Button size="lg" variant="ghost" style={{ color: 'var(--color-on-ink)', borderRadius: 'var(--radius-control)',
                  background: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
                  backdropFilter: 'saturate(1.3) blur(16px)', WebkitBackdropFilter: 'saturate(1.3) blur(16px)',
                  borderColor: 'color-mix(in srgb, var(--color-on-ink) 26%, transparent)' }}>{secondary}</Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {aside}
      </div>

      {/* The fact dock. Glass, because it sits on photography — the one place glass
          earns what it costs. Three numbers, never more. */}
      {facts ? (
        <div className="glass-ink lift-3" style={{ position: 'absolute', zIndex: 4, bottom: -32, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 34, padding: '1.1rem 2rem', borderRadius: 'var(--radius-2xl)', whiteSpace: 'nowrap' }}>
          {facts.map(([v, l]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div className="font-display" style={{ fontSize: '1.9rem', lineHeight: 1, color: 'var(--color-primary)' }}>{v}</div>
              <div className="eyebrow" style={{ marginTop: 5, fontSize: 'var(--text-3xs)', color: 'var(--color-on-ink-muted)' }}>{l}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="light-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 }} />
    </section>
  );
}
window.PageHero = PageHero;

// ── PhotoBeat ───────────────────────────────────────────────────────────────
// A full-bleed photograph carrying one sentence. The rhythm alternative to the
// slat band: same job, but the picture is the argument.
function PhotoBeat({ image, alt = '', eyebrow, line, script, note, height = '58vh' }) {
  return (
    <section className="vignette mk-band mk-ink" style={{ position: 'relative', minHeight: height, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <img src={image} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,'
        + ' color-mix(in srgb, var(--color-ink) 82%, transparent),'
        + ' color-mix(in srgb, var(--color-ink) 58%, transparent) 45%,'
        + ' color-mix(in srgb, var(--color-ink) 86%, transparent))' }} />
      <div style={{ position: 'relative', zIndex: 3, maxWidth: 'var(--width-hero)', textAlign: 'center' }}>
        {eyebrow ? <p className="eyebrow" style={{ margin: 0, color: 'var(--color-primary)' }}>{eyebrow}</p> : null}
        <p className="font-display" style={{ margin: '1rem 0 0', fontSize: 'clamp(2rem, 4.6vw, 3.5rem)', lineHeight: 1.02,
          color: 'var(--color-on-ink)', textShadow: '0 2px 26px rgb(20 16 10 / 0.5)' }}>{line}</p>
        {script ? (
          <p style={{ margin: '0.15rem 0 0', fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
            fontSize: 'clamp(1.4rem, 3vw, 2.3rem)', color: 'var(--color-primary)' }}>{script}</p>
        ) : null}
        {note ? (
          <p className="text-shadow-soft" style={{ margin: '1.3rem auto 0', maxWidth: 'var(--width-read)', fontSize: '1.02rem', lineHeight: 1.7, color: 'var(--color-on-ink-muted)' }}>{note}</p>
        ) : null}
      </div>
      <div className="light-strip" style={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 4 }} />
      <div className="light-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4 }} />
    </section>
  );
}
window.PhotoBeat = PhotoBeat;

// ── PhotoTrio ───────────────────────────────────────────────────────────────
// Three framed photographs with a caption each. The figure row: lift-1, because
// a figure rests on the page rather than floating off it.
function PhotoTrio({ items, tone = 'surface' }) {
  return (
    <div className="mk-trio stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 'var(--space-10)' }}>
      {items.map(([img, t, d]) => (
        <figure key={t} className="reveal lift-1" style={{ margin: 0, borderRadius: 'var(--radius-2xl)', overflow: 'hidden',
          background: tone === 'ink' ? 'color-mix(in srgb, var(--color-on-ink) 6%, transparent)' : 'var(--color-canvas)',
          border: tone === 'ink' ? '1px solid color-mix(in srgb, var(--color-on-ink) 12%, transparent)' : '1px solid var(--color-border)' }}>
          <img src={img} alt="" style={{ display: 'block', width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
          <figcaption style={{ padding: '1.2rem 1.3rem 1.4rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', letterSpacing: 'var(--tracking-tight)',
              color: tone === 'ink' ? 'var(--color-on-ink)' : 'var(--color-text)' }}>{t}</h3>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.93rem', lineHeight: 1.65,
              color: tone === 'ink' ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)' }}>{d}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
window.PhotoTrio = PhotoTrio;
