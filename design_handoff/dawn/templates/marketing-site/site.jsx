// site.jsx — the Frequency public-site kit, in one file.
//
// A CONCATENATION of the marketing kit (icons, header, photographic hero, the section
// grammar, footer, the beta oath + CTA), assembled so a template can load it with one
// <x-import>. Each source is wrapped in an IIFE and registers on `window`.
//
// Recreating this in a real codebase: read it for structure and values, then rebuild in
// your own conventions. Do not ship this file.
const NS = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });


/* ── icon.jsx ─────────────────────────────────────────────────── */
;(function(){
// MkIco — React-owned lucide icons for the marketing pages.
// lucide.createIcons() REPLACES an <i data-lucide> node with a fresh <svg>. When
// React created that <i>, the next re-render tries to remove a node that is gone
// and the page unmounts. So we read lucide's icon DATA and render our own SVG.
function MkIco({ n, style, className }) {
  const inner = React.useMemo(() => {
    const L = window.lucide;
    if (!L || !L.icons || !n) return '';
    const key = String(n).split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const parts = (node) => {
      if (!node) return [];
      if (Array.isArray(node)) return typeof node[0] === 'string' ? (Array.isArray(node[2]) ? node[2] : []) : node;
      return Array.isArray(node.children) ? node.children : [];
    };
    const ser = (p) => {
      if (!p) return '';
      const tag = Array.isArray(p) ? p[0] : p.tag;
      if (typeof tag !== 'string') return '';
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {};
      const kids = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : (p.children || []);
      const a = Object.keys(attrs)
        .filter((k) => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object')
        .map((k) => k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"').join(' ');
      const open = '<' + tag + (a ? ' ' + a : '');
      return kids.length ? open + '>' + kids.map(ser).join('') + '</' + tag + '>' : open + '/>';
    };
    return parts(L.icons[key]).map(ser).join('');
  }, [n]);
  const w = (style && style.width) || 18;
  const h = (style && style.height) || w;
  return (
    <svg className={className} width={w} height={h} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style, width: w, height: h }}
      dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
window.MkIco = MkIco;

})();


/* ── header.jsx ─────────────────────────────────────────────────── */
;(function(){
// Marketing site header — unified nav used across the public splash. Brandmark
// wordmark (engraved), flat site tabs + a Discover dropdown, and the amber
// "Join the Beta" CTA. Transparent over the hero, solid once scrolled.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
const NS = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });

// The variant is about what is UNDER the header, not a style preference: 'dark' is
// the cream-knockout treatment and belongs only over a photographic hero.
//
// Nobody passes it. The header sits absolutely over whatever the page opens with,
// so it READS that section's tone instead of trusting each page to remember: the
// heroes already declare themselves `mk-ink` or `mk-cream`, and a page that adds a
// photographic hero later gets the cream knockout automatically. `variant` remains
// as an explicit override for the rare page whose first section lies about its tone.
function MarketingHeader({ onNav, variant }) {
  const { Button } = NS;
  const [sensed, setSensed] = React.useState(null);
  const hdrRef = React.useRef(null);
  React.useEffect(() => {
    if (variant) return;
    const read = () => {
      // The first section in DOCUMENT ORDER that is not the header's own subtree.
      // Deliberately shape-agnostic: an earlier version asked for `#root section,
      // body > section` and silently found nothing wherever the mount was not #root
      // or the sections were not direct children of body (a Design Component wraps
      // them in its own hosts). The effect bailed, `sensed` stayed null, and a dark
      // hero got the light treatment — a brown wordmark on a photograph.
      const hdr = hdrRef.current;
      const first = [...document.querySelectorAll('section')]
        .find((s) => !hdr || (!s.contains(hdr) && !hdr.contains(s)));
      if (!first) return;
      const cls = first.className || '';
      if (/\bmk-ink\b/.test(cls)) return setSensed('dark');
      if (/\bmk-cream\b/.test(cls)) return setSensed('light');
      // No tone class: fall back to how light the thing actually is.
      const bg = getComputedStyle(first).backgroundColor;
      const m = bg && bg.match(/[\d.]+/g);
      if (m && m.length >= 3 && (+m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114) < 128) return setSensed('dark');
      // A hero carrying a full-bleed photograph is dark by construction.
      setSensed(first.querySelector(':scope > img') ? 'dark' : 'light');
    };
    read();
    // The page mounts around us, so look again once React has settled — and keep
    // looking until a section exists, since a hero may arrive several frames late in
    // a streaming or lazily-imported mount.
    let n = 0;
    const id = setInterval(() => { read(); if (++n > 12) clearInterval(id); }, 60);
    return () => clearInterval(id);
  }, [variant]);
  const dark = (variant || sensed) === 'dark';
  const tabs = ['The Lab', 'The Community', 'The Quest', 'About'];
  // Over photography the muted cream was too quiet to read. On dark the nav sits at
  // full cream with a soft shadow, so it stays legible over whatever the picture is
  // doing underneath it.
  const tab = {
    padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)',
    fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
    color: dark ? 'var(--color-on-ink)' : 'var(--color-text-muted)',
    textShadow: dark ? '0 1px 12px rgb(20 16 10 / 0.55)' : 'none',
    transition: 'color 140ms ease, background 140ms ease', whiteSpace: 'nowrap',
  };
  return (
    <header ref={hdrRef} style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.1rem 1.75rem',
    }}>
      {/* A whisper of a scrim on dark. The hero's own gradient is strongest at the
          very top, but a photo with a bright sky still eats the nav — this guarantees
          the chrome is readable no matter what the picture does. */}
      {dark ? (
        <span aria-hidden="true" style={{ position: 'absolute', inset: '0 0 auto', height: '9rem', pointerEvents: 'none',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 55%, transparent), transparent)' }} />
      ) : null}
      <a className="brandmark-link" onClick={() => onNav && onNav('home')} style={{ position: 'relative', cursor: 'pointer' }}>
        <span className="brandmark" style={{ '--brand-logo': `url("${LOGO}")`, width: 168, height: 34,
          ...(dark ? { '--brand-mark': '#FFFFFF', filter: 'drop-shadow(0 1px 10px rgb(20 16 10 / 0.45))', opacity: 1 } : {}) }} />
      </a>
      <nav style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="mk-nav">
        {tabs.map((t) => (
          <span key={t} style={tab}
            onMouseEnter={(e) => { e.currentTarget.style.color = dark ? '#FFFFFF' : 'var(--color-text)'; e.currentTarget.style.background = dark ? 'color-mix(in srgb, var(--color-on-ink) 14%, transparent)' : 'var(--color-surface-elevated)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = dark ? 'var(--color-on-ink)' : 'var(--color-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
          >{t}</span>
        ))}
        <span style={{ ...tab, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          Discover <window.MkIco n="chevron-down" style={{ width: 14, height: 14 }} />
        </span>
        <div style={{ marginLeft: '0.6rem' }}>
          <Button size="sm" iconRight={<window.MkIco n="arrow-right" style={{ width: 15, height: 15 }} />} onClick={() => onNav && onNav('beta')}>
            Join the Beta
          </Button>
        </div>
      </nav>
    </header>
  );
}
window.MarketingHeader = MarketingHeader;

})();


/* ── hero.jsx ─────────────────────────────────────────────────── */
;(function(){
// PhotoHero — the one full-bleed splash hero.
//
// The photograph has to survive being a background. Three layers do that, in
// order: a warm ink gradient that is DARK at the edges and lighter across the
// middle third (so the picture is still a picture where no type sits), a vignette
// that pulls the corners down so centred type holds, and grain so the whole thing
// reads as one printed image rather than a photo with a scrim on it.
const NSH = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });

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

})();


/* ── sections.jsx ─────────────────────────────────────────────────── */
;(function(){
// The marketing content sections, composed from DAWN primitives + the editorial
// layout patterns (Section rhythm, ZigZag, the dark "beat", stat strip, FAQ).
const NSS = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });

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
    { q: 'Is it really free?', a: 'Free during the beta, no card today, and you can leave anytime. Founding pricing is locked for the life of the subscription.' },
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

})();


/* ── footer.jsx ─────────────────────────────────────────────────── */
;(function(){
// Marketing footer — quiet, warm. Wordmark + tagline, flat nav, contact + org
// line. Sits on the marketing canvas.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
function MarketingFooter() {
  const cols = [
    { h: 'Explore', links: ['The Lab', 'The Community', 'The Quest', 'Discover'] },
    { h: 'About', links: ['Our mission', 'How it works', 'Pricing', 'Help center'] },
    { h: 'Join', links: ['Join the Beta', 'Start a Circle', 'Become a host', 'hello@frequencylocal.com'] },
  ];
  return (
    <footer style={{ background: 'var(--color-marketing-canvas)', borderTop: '1px solid var(--color-border)', padding: '3.5rem 1.75rem 2.5rem' }}>
      <div style={{ maxWidth: 'var(--width-wide)', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 36 }} className="mk-foot">
        <div>
          <a className="brandmark-link"><span className="brandmark" style={{ '--brand-logo': `url("${LOGO}")`, width: 170, height: 34 }} /></a>
          <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)', maxWidth: 260, lineHeight: 1.6 }}>
            Community Collective. Real-world community, taking root in North County San Diego.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <p style={{ margin: '0 0 0.85rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-subtle)' }}>{c.h}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {c.links.map((l) => (
                <li key={l}><a style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'none' }}>{l}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 'var(--width-wide)', margin: '2.5rem auto 0', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
        <span>© 2026 Frequency Labs Holdings</span>
        <span>Circulation, not exclusion.</span>
      </div>
    </footer>
  );
}
window.MarketingFooter = MarketingFooter;

})();


/* ── beta.jsx ─────────────────────────────────────────────────── */
;(function(){
// The beta induction "Oath" — the cinematic <90s sequence that turns a signup
// into a Founder. A dark, glowing screen; three checkboxes gate the CTA. On
// taking the oath, it confirms with a warm Founder welcome (Vera's "hot" voice).
const NSB = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });

function BetaOath({ onNav }) {
  const { Checkbox, Button } = NSB;
  const [oath, setOath] = React.useState([false, false, false]);
  const [done, setDone] = React.useState(false);
  const lines = [
    'I agree to break things on this website.',
    'I agree to submit bug reports.',
    'I agree to be a Frequency Web Founder.',
  ];
  const all = oath.every(Boolean);
  const set = (i) => (v) => setOath((o) => o.map((x, j) => (j === i ? v : x)));

  return (
    <section className="bg-slat mk-band mk-ink" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '4rem 1.5rem' }}>
      <div className="amber-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <button onClick={() => onNav && onNav('home')} style={{ position: 'absolute', top: 22, left: 24, background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--color-on-ink-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 700 }}>
        <window.MkIco n="arrow-left" style={{ width: 16, height: 16 }} /> Back
      </button>

      <div style={{ position: 'relative', maxWidth: 540, width: '100%', textAlign: 'center' }}>
        {!done ? (
          <>
            <p className="eyebrow" style={{ color: 'var(--color-primary)', margin: '0 0 1.25rem' }}>The founding cohort</p>
            <h1 className="font-display" style={{ margin: 0, color: 'var(--color-on-ink)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', lineHeight: 0.96 }}>
              This isn't a product yet. <span style={{ color: 'var(--color-primary)' }}>It's a promise.</span>
            </h1>
            <p style={{ margin: '1.25rem auto 2.25rem', maxWidth: 420, color: 'var(--color-on-ink-muted)', fontSize: '1.1rem', lineHeight: 1.65 }}>
              You're early to the thing that replaces the feed. Take the oath and you're in.
            </p>
            <div style={{ background: 'var(--color-ink-elevated)', border: '1px solid var(--color-ink-border)', borderRadius: 'var(--radius-2xl)',
              padding: '1.5rem 1.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: 'var(--shadow-pop)' }}>
              {lines.map((l, i) => (
                <Checkbox key={i} checked={oath[i]} onChange={set(i)}
                  label={<span style={{ color: 'var(--color-on-ink)' }}>{l}</span>} />
              ))}
            </div>
            <div style={{ marginTop: '1.75rem' }}>
              <Button size="lg" disabled={!all} onClick={() => setDone(true)}
                iconRight={<window.MkIco n="arrow-right" style={{ width: 18, height: 18 }} />}>
                Take the oath
              </Button>
            </div>
          </>
        ) : (
          <div className="animate-cue-pop">
            <div style={{ width: 64, height: 64, margin: '0 auto 1.5rem', borderRadius: 'var(--radius-full)', background: 'var(--color-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-pop)' }}>
              <window.MkIco n="check" style={{ width: 32, height: 32, color: 'var(--color-text-on-primary)' }} />
            </div>
            <h1 className="font-display" style={{ margin: 0, color: 'var(--color-on-ink)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', lineHeight: 0.96 }}>
              Welcome, <span style={{ color: 'var(--color-primary)' }}>Founder.</span>
            </h1>
            <p style={{ margin: '1.25rem auto 2rem', maxWidth: 420, color: 'var(--color-on-ink-muted)', fontSize: '1.1rem', lineHeight: 1.65 }}>
              The feed that ate everyone's attention, we're building the thing that takes it back, and you're early. Let's go.
            </p>
            <Button size="lg" onClick={() => onNav && onNav('home')}
              iconRight={<window.MkIco n="arrow-right" style={{ width: 18, height: 18 }} />}>
              Enter the community
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
window.BetaOath = BetaOath;

})();


module.exports = {
  MkIco: window.MkIco, MarketingHeader: window.MarketingHeader, MarketingFooter: window.MarketingFooter,
  PhotoHero: window.PhotoHero, PageHero: window.PageHero, PhotoBeat: window.PhotoBeat, PhotoTrio: window.PhotoTrio,
  FaqList: window.FaqList, BetaOath: window.BetaOath, BetaCTA: window.BetaCTA,
};
