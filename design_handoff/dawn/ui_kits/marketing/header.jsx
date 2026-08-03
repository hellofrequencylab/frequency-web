// Marketing site header — unified nav used across the public splash. Brandmark
// wordmark (engraved), flat site tabs + a Discover dropdown, and the amber
// "Join the Beta" CTA. Transparent over the hero, solid once scrolled.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
const NS = window.DAWNFrequencyDesignSystem_c868e3;

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
