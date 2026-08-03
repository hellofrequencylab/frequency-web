// The global top bar — the product's outermost chrome. Engraved wordmark, the
// six public nav areas (three with mega-menu chevrons), a search pill with its
// keyboard hint, then Mindless, friends, notifications, and the SYSTEM menu.
// Law of place: the top right is the system — which world, who am I, and the
// settings that outlive a page. Personal and community management live in the
// account dock at the foot of the rail; score lives in the Vault dock.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
const NST = window.DAWNFrequencyDesignSystem_c868e3;
// Stand-in used only until the compiled bundle carries Counter.
const BarCounter = NST.Counter || (({ value }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-pill)',
    background: 'var(--color-primary-bg)', color: 'var(--color-primary-strong)' }}>
    <window.Ico n="flame" style={{ width: 13, height: 13 }} />
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-text)' }}>{value}</span>
  </span>
));

function NavItem({ label, menu, active }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.4rem 0.6rem', border: 'none', cursor: 'pointer',
        background: 'transparent', borderRadius: 'var(--radius-control)', fontFamily: 'inherit', fontSize: '0.92rem',
        fontWeight: active ? 800 : 600, color: active || hover ? 'var(--color-primary-strong)' : 'var(--color-text-muted)',
        transition: 'color var(--motion-fast) ease' }}>
      {label}
      {menu && <window.Ico n="chevron-down" style={{ width: 14, height: 14, opacity: 0.7 }} />}
    </button>
  );
}

function IconSlot({ icon, badge, label }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button aria-label={label} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', width: 34, height: 34, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer',
        borderRadius: 'var(--radius-control)', background: hover ? 'var(--color-surface-elevated)' : 'transparent',
        color: 'var(--color-text-muted)', transition: 'background var(--motion-fast) ease' }}>
      <window.Ico n={icon} style={{ width: 18, height: 18 }} />
      {badge && <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%',
        background: 'var(--color-primary)', border: '1.5px solid var(--color-surface)' }} />}
    </button>
  );
}

function TopBar({ onToggleNav }) {
  return (
    <header className="app-topbar" style={{ height: 62, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 18, padding: '0 1.1rem',
      background: 'var(--color-chrome)', borderBottom: '1px solid var(--color-chrome-border)', minWidth: 0, overflow: 'hidden' }}>
      {onToggleNav ? (
        <button onClick={onToggleNav} aria-label="Toggle the menu" title="Toggle the menu"
          style={{ width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer',
            borderRadius: 'var(--radius-control)', background: 'transparent', color: 'var(--color-text-muted)' }}>
          <window.Ico n="panel-left" style={{ width: 17, height: 17 }} />
        </button>
      ) : null}
      <a className="brandmark-link" href="#" style={{ flexShrink: 0 }}>
        <span className="brandmark" style={{ '--brand-logo': `url("${LOGO}")`, width: 156, height: 32 }} />
      </a>
      <nav className="tb-nav" style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}>
        <NavItem label="Home" active />
        <NavItem label="Community" menu />
        <NavItem label="The Quest" menu />
        <NavItem label="The Lab" />
        <NavItem label="Spaces" menu />
        <NavItem label="About" menu />
      </nav>
      <span style={{ flex: 1, minWidth: 8 }} />
      <label className="tb-search" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 208, minWidth: 96, flexShrink: 1, padding: '0.42rem 0.7rem',
        border: '1px solid var(--color-chrome-border)', borderRadius: 'var(--radius-pill)', background: 'var(--color-surface)',
        color: 'var(--color-text-subtle)', cursor: 'text' }}>
        <window.Ico n="search" style={{ width: 15, height: 15 }} />
        <input placeholder="Search" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: 'inherit', fontSize: '0.88rem', color: 'var(--color-text)' }} />
        <kbd className="tb-kbd" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xs)', padding: '1px 5px', borderRadius: 4,
          background: 'var(--color-surface-elevated)', border: '1px solid var(--color-chrome-border)' }}>⌘K</kbd>
      </label>
      <button className="tb-mindless" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '0.4rem 0.7rem', border: 'none', cursor: 'pointer',
        borderRadius: 'var(--radius-control)', background: 'transparent', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-signal-strong)' }}>
        <window.Ico n="leaf" style={{ width: 17, height: 17 }} /> <span className="tb-mindless-label">Mindless</span>
      </button>
      <div className="tb-icons" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <IconSlot icon="users" label="Friends" />
        <IconSlot icon="bell" label="Notifications" badge />
      </div>
      {/* The streak is NOT here: it belongs to the Vault dock, bottom right. The
          top bar is the system, and the system does not keep score. */}
      <window.SystemMenu />
    </header>
  );
}
window.TopBar = TopBar;
