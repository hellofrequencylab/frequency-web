// The left navigation rail — the member's areas, grouped and titled the way the
// product groups them. Group, don't box: a small tracked group label plus
// spacing, no card per section. The active row is the one amber moment.
const NSN = window.DAWNFrequencyDesignSystem_c868e3;

function NavRow({ icon, label, active, badge, collapsed, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '0.5rem 0' : '0.42rem 0.7rem', borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer',
        background: active ? 'var(--color-primary-bg)' : hover ? 'var(--color-surface)' : 'transparent',
        color: active ? 'var(--color-primary-strong)' : 'var(--color-text-muted)', fontFamily: 'inherit',
        fontSize: '0.88rem', fontWeight: active ? 800 : 600, transition: 'background var(--motion-fast) ease, color var(--motion-fast) ease' }}>
      <window.Ico n={icon} style={{ width: 17, height: 17, flexShrink: 0 }} />
      {collapsed ? (
        badge != null ? <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: 99, background: 'var(--color-primary)' }} /> : null
      ) : (<>
        <span style={{ flex: 1 }}>{label}</span>
        {badge != null && (
          <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, color: active ? 'var(--color-primary-strong)' : 'var(--color-text-muted)' }}>{badge}</span>
        )}
      </>)}
    </button>
  );
}

// Areas, order, section grouping and labels are lifted from lib/nav-areas.ts
// (NAV_AREAS is the framework-free source of truth: order here IS render order);
// the glyphs are AREA_ICONS in components/layout/nav-icons.ts, by lucide name.
// One deviation, deliberate: production still labels the commerce-umbrella row
// "Marketplace" (ADR-868) while the naming canon reserves that word, so it reads
// "Market" here. Flagged in handoff/CHANGES.md.
// Messages, Notifications and Search live in the header; Friends and the personal
// utilities live in the account menu. They are NOT rail items.
const GROUPS = [
  { items: [
    { id: 'feed', icon: 'home', label: 'Feed' },
    { id: 'profile', icon: 'user', label: 'Profile' },
  ] },
  { h: 'Community', items: [
    { id: 'broadcast', icon: 'megaphone', label: 'Around You' },
    { id: 'circles', icon: 'users', label: 'Circles' },
    { id: 'channels', icon: 'radio', label: 'Channels' },
    { id: 'events', icon: 'calendar-days', label: 'Events', badge: 3 },
    { id: 'market', icon: 'store', label: 'Market' },
    { id: 'housing', icon: 'map-pin-house', label: 'Housing' },
    { id: 'messageBoards', icon: 'message-square', label: 'Message Boards', badge: 2 },
    { id: 'people', icon: 'book-user', label: 'Members' },
    { id: 'connections', icon: 'contact-round', label: 'My Contacts' },
    { id: 'my-spaces', icon: 'building-2', label: 'Business Spaces' },
  ] },
  { h: 'The Quest', items: [
    { id: 'quest', icon: 'compass', label: 'My Quest' },
    { id: 'journeys', icon: 'route', label: 'Journeys' },
    { id: 'practices', icon: 'sparkles', label: 'Practices' },
    { id: 'library', icon: 'library', label: 'Library' },
    { id: 'journal', icon: 'notebook-pen', label: 'Journal' },
    { id: 'vault', icon: 'gem', label: 'The Vault' },
  ] },
  // The operator world telescopes: a member never sees it. Shown here because the
  // reference capture is a janitor's rail.
  { h: 'Admin', items: [
    { id: 'admin-home', icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'lead', icon: 'flag', label: 'Leadership' },
    { id: 'admin-programs', icon: 'gamepad-2', label: 'Programs' },
    { id: 'admin-growth', icon: 'trending-up', label: 'Growth' },
    { id: 'admin-crm', icon: 'contact', label: 'Resonance CRM' },
    { id: 'admin-vera-ai', icon: 'bot', label: 'Vera AI' },
    { id: 'admin-qr', icon: 'qr-code', label: 'QR Studio' },
    { id: 'admin-spaces', icon: 'layout-grid', label: 'Manage Spaces' },
  ] },
];

function NavRail({ active, onNav, collapsed = false, onToggle, overlay = false }) {
  return (
    <aside className={overlay ? '' : 'app-nav'}
      style={{ width: '100%', flexShrink: 0,
        position: overlay ? 'static' : 'sticky', top: 0,
        maxHeight: overlay ? 'none' : 'calc(100vh - 62px)', display: 'flex', flexDirection: 'column', minHeight: 0,
        padding: overlay ? '1rem 0.6rem 1.5rem' : collapsed ? '1.5rem 0.35rem 1rem' : '1.5rem 0 1rem' }}>
      {onToggle && overlay ? (
        <button onClick={onToggle} title="Close the menu" aria-label="Close the menu"
          style={{ alignSelf: 'flex-end', marginBottom: 10, width: 26, height: 26,
            display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--color-text-subtle)', borderRadius: 'var(--radius-control)' }}>
          <window.Ico n="x" style={{ width: 15, height: 15 }} />
        </button>
      ) : null}
      {/* Only the AREAS scroll. The account dock is a non-shrinking footer, so it is
         always at the rail's lower-left edge no matter how long the list gets. */}
      <div className="rail-scroll" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: collapsed ? 10 : 16 }}>
        {GROUPS.map((g, i) => (
          <div key={i}>
            {g.h && (!collapsed || overlay) ? <p className="eyebrow" style={{ margin: '0 0 6px 0.7rem', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>{g.h}</p> : null}
            {g.h && collapsed && !overlay && i > 0 ? <div style={{ height: 1, background: 'var(--color-border)', margin: '0 0.35rem 8px' }} /> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? 3 : 1 }}>
              {g.items.map((it) => (
                <NavRow key={it.id} {...it} collapsed={collapsed && !overlay} active={active === it.id} onClick={() => onNav(it.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* The rail's foot is the account dock: me, what I run, and money. It opens
          upward, so the community-management surface never leaves the left side. */}
      <div style={{ flex: '0 0 auto' }}><window.AccountDock collapsed={collapsed && !overlay} /></div>
      {/* The fold control lives at the FOOT of the rail, under everything it affects.
          Quiet, borderless, warm only on hover — folding a menu is rare, so the
          control should not compete with the first real row for attention. */}
      {onToggle && !overlay ? (
        <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', paddingTop: 10 }}>
          <button onClick={onToggle} title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-subtle)'; }}
            style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--color-text-subtle)', borderRadius: 'var(--radius-control)',
              transition: 'color var(--motion-fast) ease' }}>
            <window.Ico n={collapsed ? 'panel-left-open' : 'panel-left-close'} style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
window.NavRail = NavRail;
