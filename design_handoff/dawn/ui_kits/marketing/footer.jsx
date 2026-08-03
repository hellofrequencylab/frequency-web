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
