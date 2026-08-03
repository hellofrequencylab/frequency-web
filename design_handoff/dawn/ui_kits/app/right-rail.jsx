// The right rail — the member's own status, not analytics. Two utility rows, an
// invite card, the Season standing card (the ONLY place the four game counts
// appear together), a Days/Weeks/Months activity read, upcoming events, and the
// Frequency Signature. Modules group with a title and spacing; the two tinted
// cards are deliberate objects.
const NSR = window.DAWNFrequencyDesignSystem_c868e3;
// Stand-ins used only until the compiled bundle carries Counter/StreakMeter.
const RailCounterRow = NSR.CounterRow || (({ items = [] }) => (
  <div style={{ display: 'flex', gap: 14 }}>{items.map((it, i) => (
    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{it.value}</span>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>{it.caption}</span>
    </span>))}</div>
));
const RailStreak = NSR.StreakMeter || (({ days, hint }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--color-text)' }}>{days}</span>{hint}
  </span>
));

function Module({ title, action, children }) {
  return (
    <section>
      {title && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'var(--weight-heading)', color: 'var(--color-text)', letterSpacing: 'var(--tracking-tight)' }}>{title}</h3>
          {action && <span style={{ fontSize: 'var(--text-meta)', fontWeight: 700, color: 'var(--color-primary-strong)', cursor: 'pointer' }}>{action}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function UtilityRow({ icon, label }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '0.6rem 0.8rem', cursor: 'pointer',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', fontFamily: 'inherit',
        background: hover ? 'var(--color-surface-elevated)' : 'var(--color-surface)', color: 'var(--color-text)',
        fontSize: '0.88rem', fontWeight: 700, transition: 'background var(--motion-fast) ease' }}>
      <window.Ico n={icon} style={{ width: 16, height: 16, color: 'var(--color-text-muted)' }} />{label}
    </button>
  );
}

function SeasonStanding() {
  return (
    <div style={{ background: 'var(--color-primary-bg)', borderRadius: 'var(--radius-card)', padding: '0.95rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <window.Ico n="trophy" style={{ width: 16, height: 16, color: 'var(--color-primary-strong)' }} />
        <span className="eyebrow" style={{ flex: 1, color: 'var(--color-primary-strong)' }}>Season standing</span>
        <NSR.RankBadge rank="initiate" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>Climbing to Adept</span>
        <span style={{ color: 'var(--color-text-muted)' }}>1 Journey to go</span>
      </div>
      <div style={{ height: 7, borderRadius: 'var(--radius-pill)', background: 'var(--color-surface)', overflow: 'hidden' }}>
        <div style={{ width: '58%', height: '100%', background: 'var(--color-primary)', borderRadius: 'var(--radius-pill)' }} />
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)' }}>
        <RailCounterRow size="md" items={[
          { kind: 'zaps', value: '2,095', caption: 'Zaps' },
          { kind: 'gems', value: '169', caption: 'Gems' },
          { kind: 'streak', value: '50', caption: 'Streak' },
        ]} />
      </div>
      <div style={{ marginTop: 12 }}>
        <RailStreak days={50} freezes={2} showWeek={false} hint="Day 50. Never miss twice." />
      </div>
    </div>
  );
}

function Activity() {
  const [tab, setTab] = React.useState('Days');
  const bars = { Days: [3, 6, 2, 8, 5, 9, 4, 7, 6, 2, 8, 5, 3, 7], Weeks: [12, 18, 9, 22, 16, 20, 14], Months: [40, 52, 38, 61, 47] }[tab];
  const max = Math.max(...bars);
  return (
    <Module title="Your activity">
      <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
        {['Days', 'Weeks', 'Months'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '0.3rem 0.7rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-meta)',
              fontWeight: tab === t ? 800 : 600, borderRadius: 'var(--radius-control)',
              background: tab === t ? 'var(--color-surface-elevated)' : 'transparent',
              color: tab === t ? 'var(--color-text)' : 'var(--color-text-subtle)' }}>{t}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 62 }}>
        {bars.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, borderRadius: 'var(--radius-sm)',
            background: i === bars.length - 1 ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 38%, var(--color-surface-elevated))' }} />
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)' }}>Practices logged. 50 days without a gap.</p>
    </Module>
  );
}

function EventRow({ mon, day, name, where, when }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ width: 40, flexShrink: 0, textAlign: 'center', borderRadius: 'var(--radius-sm)', background: 'var(--color-signal-bg)', padding: '4px 0' }}>
        <div style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-signal-strong)' }}>{mon}</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.1, color: 'var(--color-signal-strong)' }}>{day}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{where}</div>
      </div>
      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)', flexShrink: 0 }}>{when}</span>
    </div>
  );
}

function Signature() {
  // Four Pillars, plotted as a diamond. A derived identity visual, not a chart.
  const P = [{ k: 'Mind', v: 0.9 }, { k: 'Body', v: 0.62 }, { k: 'Spirit', v: 0.78 }, { k: 'Expression', v: 0.45 }];
  const c = 64, r = 52;
  const pt = (i, f) => { const a = (-90 + i * 90) * Math.PI / 180; return [c + r * f * Math.cos(a), c + r * f * Math.sin(a)]; };
  const poly = P.map((p, i) => pt(i, p.v).join(',')).join(' ');
  const ring = P.map((_, i) => pt(i, 1).join(',')).join(' ');
  return (
    <Module title="Frequency Signature">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <svg viewBox="0 0 128 128" width="112" height="112" style={{ flexShrink: 0 }}>
          <polygon points={ring} fill="none" stroke="var(--color-border-strong)" strokeWidth="1" />
          <polygon points={P.map((_, i) => pt(i, 0.5).join(',')).join(' ')} fill="none" stroke="var(--color-border)" strokeWidth="1" />
          <polygon points={poly} fill="color-mix(in srgb, var(--color-signal) 30%, transparent)" stroke="var(--color-signal)" strokeWidth="2" />
        </svg>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {P.map((p) => (
            <div key={p.k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-meta)' }}>
              <span style={{ width: 66, color: 'var(--color-text-muted)' }}>{p.k}</span>
              <span style={{ flex: 1, height: 5, borderRadius: 'var(--radius-pill)', background: 'var(--color-surface-elevated)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${p.v * 100}%`, height: '100%', background: 'var(--color-signal)' }} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)', lineHeight: 1.5 }}>Heaviest on Mind. Expression is the thin one, and the Expression Challenge is how it fills in.</p>
    </Module>
  );
}

function RightRail({ onCollapse }) {
  return (
    <aside style={{ width: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 26, padding: '1.25rem 1.25rem 2.5rem 0' }}>
      <UtilityRow icon="bug" label="Report a bug" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '0.8rem 0.9rem', marginTop: -14 }}>
        <span style={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)', background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}>
          <window.Ico n="gift" style={{ width: 17, height: 17 }} />
        </span>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>Invite a friend</div>
          <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>Earn Zaps when they join</div>
        </div>
      </div>

      <Module title="Your Quest"><SeasonStanding /></Module>
      <Activity />

      <Module title="Upcoming events" action="See all">
        <EventRow mon="Aug" day="6" name="Breathe Connect Expand" where="Encinitas Viewpoint Park" when="6:30p" />
        <EventRow mon="Aug" day="8" name="Sunrise cold plunge" where="The Lab" when="6:30a" />
        <EventRow mon="Aug" day="9" name="Neighborhood supper" where="Leucadia" when="6:00p" />
      </Module>

      <Signature />
      {/* The fold control at the FOOT, quiet and borderless — the same affordance the
          screen frame uses, so one gesture works everywhere. */}
      {onCollapse ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 14 }}>
          <button onClick={onCollapse} title="Hide the rail" aria-label="Hide the rail"
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-subtle)'; }}
            style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', cursor: 'pointer', border: 'none',
              background: 'transparent', borderRadius: 'var(--radius-control)', color: 'var(--color-text-subtle)',
              transition: 'color var(--motion-fast) ease' }}>
            <window.Ico n="panel-right-close" style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
window.RightRail = RightRail;
