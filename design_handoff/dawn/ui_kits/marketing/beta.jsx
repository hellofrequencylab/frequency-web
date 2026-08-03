// The beta induction "Oath" — the cinematic <90s sequence that turns a signup
// into a Founder. A dark, glowing screen; three checkboxes gate the CTA. On
// taking the oath, it confirms with a warm Founder welcome (Vera's "hot" voice).
const NSB = window.DAWNFrequencyDesignSystem_c868e3;

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
