// chrome.jsx — the Frequency app chrome, in one file.
//
// This is a CONCATENATION of the design system's app kit (icon, top bar, nav rail,
// feed parts, right rail, the three docks), assembled so a template can load the whole
// shell with a single <x-import>. Each source file is wrapped in an IIFE, so their
// top-level names cannot collide; each one registers its components on `window`.
//
// Recreating this in a real codebase: read these components for structure and exact
// values, then rebuild them in your own conventions. Do not ship this file.
const NS = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });


/* ── icon.jsx ─────────────────────────────────────────────────── */
;(function(){
// Ico — React-owned lucide icons for the marketing pages.
// lucide.createIcons() REPLACES an <i data-lucide> node with a fresh <svg>. When
// React created that <i>, the next re-render tries to remove a node that is gone
// and the page unmounts. So we read lucide's icon DATA and render our own SVG.
function Ico({ n, style, className }) {
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
window.Ico = Ico;

})();


/* ── topbar.jsx ─────────────────────────────────────────────────── */
;(function(){
// The global top bar — the product's outermost chrome. Engraved wordmark, the
// six public nav areas (three with mega-menu chevrons), a search pill with its
// keyboard hint, then Mindless, friends, notifications, and the SYSTEM menu.
// Law of place: the top right is the system — which world, who am I, and the
// settings that outlive a page. Personal and community management live in the
// account dock at the foot of the rail; score lives in the Vault dock.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
const NST = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });
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

})();


/* ── nav-rail.jsx ─────────────────────────────────────────────────── */
;(function(){
// The left navigation rail — the member's areas, grouped and titled the way the
// product groups them. Group, don't box: a small tracked group label plus
// spacing, no card per section. The active row is the one amber moment.
const NSN = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });

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

})();


/* ── feed.jsx ─────────────────────────────────────────────────── */
;(function(){
// The feed. Grounded in components/feed/post-card.tsx, post-replies.tsx and
// reaction-button.tsx: a kicker is the ONE slot for a post's special state and
// announcement / pinned tint only the HAIRLINE, never the fill; role chips show
// only where they carry signal (leadership and the system voice, never member or
// crew); Zaps earned is a derived count, one reaction is 1 and one reply is 2;
// reaction counts sit beside the comment count on the right, while the inline
// picker shares the composer row. Post cards sit on --color-surface-post.
const NSF = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });

// The curated set from lib/feed/reactions.ts. Skin tones carry the medium tan
// modifier so the row reads as one tone. First five are the quick picks.
const REACTIONS = [
  { key: '❤️', label: 'Love this' },
  { key: '🔥', label: 'Fire' },
  { key: '🙌🏽', label: 'Celebrate' },
  { key: '😂', label: 'Funny' },
  { key: '😮', label: 'Wow' },
  { key: '🙏🏽', label: 'Grateful' },
];
const QUICK = REACTIONS.slice(0, 5);

// Role chips only where they carry signal: the leadership ladder and the system
// voice, which members always see as "Moderator" (never an operational web role).
function RolePill({ role }) {
  if (!role || role === 'member' || role === 'crew') return null;
  const label = { host: 'Host', guide: 'Guide', mentor: 'Mentor', admin: 'Admin', janitor: 'Janitor', moderator: 'Moderator' }[role];
  if (!label) return null;
  const signal = role === 'host' || role === 'guide' || role === 'mentor';
  return (
    <span style={{ fontSize: 'var(--text-meta)', fontWeight: 700, padding: '1px 9px', borderRadius: 'var(--radius-pill)',
      background: signal ? 'var(--color-signal-bg)' : 'var(--color-surface-elevated)',
      color: signal ? 'var(--color-signal-strong)' : 'var(--color-text-muted)',
      border: `1px solid ${signal ? 'color-mix(in srgb, var(--color-signal) 26%, transparent)' : 'var(--color-border)'}` }}>{label}</span>
  );
}

function Flag({ icon, label, tone }) {
  return (
    <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-2xs)', color: tone }}>
      <window.Ico n={icon} style={{ width: 13, height: 13 }} />{label}
    </span>
  );
}

function PostCard({ post, onReact }) {
  const { Avatar } = NSF;
  // Zaps earned: one per reaction, two per reply. Derived, never authored.
  const zaps = post.hearts + post.plus + (post.replies || 0) * 2;
  // Announcement and pinned tint the hairline only; the fill stays the post surface.
  const border = post.announcement
    ? 'color-mix(in srgb, var(--color-primary) 45%, var(--color-border))'
    : post.pinned
      ? 'color-mix(in srgb, var(--color-primary) 26%, var(--color-border))'
      : 'var(--color-border)';
  return (
    <article style={{ background: 'var(--color-surface-post)', border: `1px solid ${border}`,
      borderRadius: 'var(--radius-card)', padding: '1rem 1.1rem 0.85rem' }}>
      {(post.announcement || post.pinned) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 11 }}>
          {post.announcement && <Flag icon="megaphone" label="Announcement" tone="var(--color-primary-strong)" />}
          {post.pinned && <Flag icon="pin" label="Pinned" tone="var(--color-primary-strong)" />}
        </div>
      )}
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Avatar name={post.author} src={post.avatar} size={40} online={post.online} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.02rem', fontWeight: 'var(--weight-heading)', letterSpacing: 'var(--tracking-tight)', color: 'var(--color-text)' }}>{post.author}</span>
            <RolePill role={post.role} />
            {post.scope && (<>
              <window.Ico n="arrow-right" style={{ width: 12, height: 12, color: 'var(--color-text-subtle)' }} />
              <span style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>{post.scope}</span>
            </>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1, fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)' }}>
            {post.time}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: 'var(--color-primary-strong)' }}>
              <window.Ico n="zap" style={{ width: 12, height: 12 }} />{zaps}
            </span>
          </div>
        </div>
        <window.Ico n="more-horizontal" style={{ width: 18, height: 18, color: 'var(--color-text-subtle)', cursor: 'pointer' }} />
      </div>
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.98rem', lineHeight: 1.65, color: 'var(--color-text)', textWrap: 'pretty' }}>{post.body}</p>
      {post.image && (
        <div style={{ marginTop: 12, borderRadius: 'var(--radius-control)', overflow: 'hidden', height: 230 }}>
          <img src={post.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 12, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        <button onClick={() => onReact(post.id, 'heart')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: post.myHeart ? 800 : 600, color: post.myHeart ? 'var(--color-danger)' : 'inherit' }}>
          ❤️ {post.hearts}
        </button>
        <button onClick={() => onReact(post.id, 'plus')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: post.myPlus ? 800 : 600, color: post.myPlus ? 'var(--color-primary-strong)' : 'inherit' }}>
          🔥 {post.plus}
        </button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <window.Ico n="message-circle" style={{ width: 15, height: 15 }} />{post.replies || ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {QUICK.map((r) => (
            <button key={r.key} aria-label={r.label} title={r.label} onClick={() => onReact(post.id, 'plus')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1, padding: 2 }}>{r.key}</button>
          ))}
          <button aria-label="More reactions" title="More reactions" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', display: 'grid', placeItems: 'center' }}>
            <window.Ico n="smile-plus" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <input placeholder="Add a comment" style={{ flex: 1, minWidth: 0, padding: '0.45rem 0.8rem', borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontFamily: 'inherit', fontSize: '0.88rem', color: 'var(--color-text)' }} />
        <button aria-label="Send" style={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', border: 'none', cursor: 'pointer',
          borderRadius: 'var(--radius-pill)', background: 'var(--color-primary-bg)', color: 'var(--color-primary-strong)' }}>
          <window.Ico n="send" style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </article>
  );
}

function Composer({ onPost }) {
  const { Button } = NSF;
  const [text, setText] = React.useState('');
  const [focus, setFocus] = React.useState(false);
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)',
      boxShadow: focus ? 'var(--shadow-md)' : 'var(--shadow-2xs)', transition: 'box-shadow var(--motion-base) ease', padding: '1rem 1.1rem' }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} rows={3}
        placeholder="What's on your mind?"
        style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'none', background: 'transparent',
          fontFamily: 'var(--font-sans)', fontSize: '1rem', lineHeight: 1.65, color: 'var(--color-text)' }} />
      <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 'var(--text-meta)', fontWeight: 700, color: 'var(--color-text-muted)', padding: 0 }}>
        <window.Ico n="chevron-up" style={{ width: 14, height: 14 }} /> Format
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-border-strong)', fontSize: 'var(--text-meta)', fontWeight: 700, color: 'var(--color-text)' }}>
          <window.Ico n="pen-line" style={{ width: 14, height: 14 }} /> Post
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {['camera', 'file-pen', 'user-plus', 'megaphone'].map((ic) => (
            <button key={ic} style={{ width: 32, height: 32, borderRadius: 'var(--radius-control)', border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--color-text-subtle)', display: 'grid', placeItems: 'center' }}>
              <window.Ico n={ic} style={{ width: 17, height: 17 }} />
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--text-meta)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-subtle)' }}>⌘ + Enter</span>
        <Button size="sm" disabled={!text.trim()} onClick={() => { onPost(text.trim()); setText(''); }}>Capture</Button>
      </div>
    </div>
  );
}

// An event surfaces inline in the stream, flagged and linked, never boxed like a post.
function EventTeaser({ mon, day, name, meta }) {
  return (
    <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 13, textDecoration: 'none', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', padding: '0.85rem 1rem' }}>
      <div style={{ width: 46, flexShrink: 0, textAlign: 'center', borderRadius: 'var(--radius-control)', background: 'var(--color-signal-bg)', padding: '5px 0' }}>
        <div style={{ fontSize: 'var(--text-3xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-signal-strong)' }}>{mon}</div>
        <div style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.05, color: 'var(--color-signal-strong)' }}>{day}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <window.Ico n="calendar-days" style={{ width: 12, height: 12, color: 'var(--color-signal-strong)' }} />
          <span style={{ fontSize: 'var(--text-meta)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-signal-strong)' }}>Upcoming event</span>
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)' }}>{name}</div>
        <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>{meta}</div>
      </div>
      <window.Ico n="arrow-right" style={{ width: 18, height: 18, color: 'var(--color-signal)' }} />
    </a>
  );
}

// The quiet line between posts: someone earned something. Never a card.
function ActivityLine({ who, zaps, text }) {
  return (
    <p style={{ margin: 0, padding: '2px 1.1rem', fontSize: '0.88rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
      <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{who}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: 'var(--color-primary-strong)', margin: '0 6px' }}>
        <window.Ico n="zap" style={{ width: 12, height: 12 }} />{zaps}
      </span>
      {text}
    </p>
  );
}

window.FeedComposer = Composer;
window.FeedPostCard = PostCard;
window.FeedEventTeaser = EventTeaser;
window.FeedActivityLine = ActivityLine;

})();


/* ── right-rail.jsx ─────────────────────────────────────────────────── */
;(function(){
// The right rail — the member's own status, not analytics. Two utility rows, an
// invite card, the Season standing card (the ONLY place the four game counts
// appear together), a Days/Weeks/Months activity read, upcoming events, and the
// Frequency Signature. Modules group with a title and spacing; the two tinted
// cards are deliberate objects.
const NSR = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });
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

})();


/* ── docks.jsx ─────────────────────────────────────────────────── */
;(function(){
// ── The three docks ──────────────────────────────────────────────────────────
// One law of place, so nothing is ever offered twice:
//
//   TOP RIGHT     the SYSTEM. Which world am I in, who am I signed in as, and the
//                 settings that outlive any one page: security, billing, language,
//                 appearance, help, sign out.
//   BOTTOM LEFT   ME and MY COMMUNITY. My profile and standing, my own content, and
//                 the things I run: Circles, events, listings, Spaces, payouts.
//                 This is where a host manages the community and the market.
//   BOTTOM RIGHT  in member mode, THE VAULT: sparks, the stash, the streak and the
//                 season. In operator mode, THIS PAGE: its stats and its settings.
//
// All three share the Popover shell below: glass chrome, lift-3, cue-pop in, Esc or
// an outside click to dismiss. Anchored to its dock, opening toward the interior.

const NSD = new Proxy({}, { get: (_t, k) => (window.DAWNFrequencyDesignSystem_c868e3 || {})[k] });
const D = ({ n, s = 16, c }) => <window.Ico n={n} style={{ width: s, height: s, color: c }} />;

function usePopover() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

// The shell. `place` says which corner it grows from; nothing else varies.
function Popover({ place = 'up-left', width = '17.5rem', children, style }) {
  const pos = {
    'up-left': { bottom: 'calc(100% + 10px)', left: 0 },
    'up-right': { bottom: 'calc(100% + 10px)', right: 0 },
    'down-right': { top: 'calc(100% + 8px)', right: 0 },
  }[place];
  return (
    <div className="glass lift-3 animate-cue-pop" role="menu"
      style={{ position: 'absolute', zIndex: 70, width, maxHeight: '72vh', overflowY: 'auto', padding: '0.55rem',
        borderRadius: 'var(--radius-card)', ...pos, ...style }}>
      {children}
    </div>
  );
}

function Group({ label, children }) {
  return (
    <div style={{ padding: '0.35rem 0 0.15rem' }}>
      {label ? <p className="eyebrow" style={{ margin: '0.3rem 0 4px 0.55rem', fontSize: 'var(--text-3xs)', color: 'var(--color-text-subtle)' }}>{label}</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</div>
    </div>
  );
}

function Item({ icon, label, meta, tone, onClick }) {
  const [h, setH] = React.useState(false);
  return (
    <button role="menuitem" onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0.42rem 0.55rem', textAlign: 'left',
        border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-control)', fontFamily: 'inherit', fontSize: '0.86rem',
        fontWeight: 600, background: h ? 'var(--color-surface-elevated)' : 'transparent',
        color: tone === 'danger' ? 'var(--color-danger-strong)' : 'var(--color-text)' }}>
      <D n={icon} s={15} c={tone === 'danger' ? 'var(--color-danger-strong)' : 'var(--color-text-muted)'} />
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {meta != null ? <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>{meta}</span> : null}
    </button>
  );
}

function Divide() { return <hr className="rule-amber" style={{ margin: '0.45rem 0.25rem' }} />; }

// ── Bottom left: the account dock ────────────────────────────────────────────
// The rail's foot IS the button. Everything personal and everything the member
// runs lives behind it, grouped by whose it is: mine, then what I host, then money.
function AccountDock({ collapsed = false }) {
  const { open, setOpen, ref } = usePopover();
  const btn = React.useRef(null);
  const { Avatar, RankBadge } = NSD;
  // The rail scrolls, so an absolutely-positioned popover would be clipped by it.
  // Anchor to the button's rect and escape the scroller with position: fixed.
  const [rect, setRect] = React.useState(null);
  const toggle = () => {
    if (btn.current) setRect(btn.current.getBoundingClientRect());
    setOpen((v) => !v);
  };
  const fixed = rect ? { position: 'fixed', left: Math.max(10, rect.left), bottom: Math.round(window.innerHeight - rect.top + 10), top: 'auto', right: 'auto' } : null;
  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
      <button ref={btn} onClick={toggle} aria-expanded={open} title="You"
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: collapsed ? '0.3rem 0' : '0.35rem 0.45rem',
          justifyContent: collapsed ? 'center' : 'flex-start', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          borderRadius: 'var(--radius-control)', background: open ? 'var(--color-surface-elevated)' : 'transparent', textAlign: 'left' }}>
        <Avatar name="Daniel Tyack" size={collapsed ? 28 : 34} online />
        {collapsed ? null : (<>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Daniel Tyack</span>
            <span style={{ display: 'block', marginTop: 2 }}><RankBadge rank="initiate" /></span>
          </span>
          <D n={open ? 'chevron-down' : 'chevron-up'} s={15} c="var(--color-text-subtle)" />
        </>)}
      </button>
      {open ? (
        <Popover place="up-left" width="17.5rem" style={fixed}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.55rem 0.6rem' }}>
            <Avatar name="Daniel Tyack" size={38} online />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>Daniel Tyack</div>
              <div style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)' }}>@danieltyack · Vista</div>
            </div>
          </div>
          <Group label="You">
            <Item icon="user" label="My profile" />
            <Item icon="compass" label="My standing" meta="Initiate" />
            <Item icon="notebook-pen" label="Journal" />
            <Item icon="bookmark" label="Saved" meta="24" />
            <Item icon="bell" label="Notification preferences" />
          </Group>
          <Divide />
          <Group label="What you run">
            <Item icon="users" label="My Circles" meta="2" />
            <Item icon="calendar-days" label="My events" meta="1" />
            <Item icon="store" label="My listings" meta="3" />
            <Item icon="building-2" label="Business Spaces" />
            <Item icon="qr-code" label="QR studio" />
          </Group>
          <Divide />
          <Group label="Money">
            <Item icon="wallet" label="Payouts" meta="Preview" />
            <Item icon="receipt" label="Orders and passes" />
          </Group>
          <Divide />
          <Group>
            <Item icon="shield-check" label="Switch to operator view" />
          </Group>
          <p style={{ margin: '0.35rem 0.6rem 0.3rem', fontSize: 'var(--text-2xs)', lineHeight: 1.5, color: 'var(--color-text-subtle)' }}>
            Account, billing and appearance live in the system menu, top right.
          </p>
        </Popover>
      ) : null}
    </div>
  );
}

// ── Top right: the system menu ───────────────────────────────────────────────
// Only what outlives a page: which world, who am I, and the settings that are not
// about any one community.
function SystemMenu() {
  const { open, setOpen, ref } = usePopover();
  const { Avatar } = NSD;
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'flex' }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="System menu" title="System"
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
        <Avatar name="Daniel Tyack" size={34} />
      </button>
      {open ? (
        <Popover place="down-right" width="16.5rem">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.5rem 0.55rem 0.55rem' }}>
            <span style={{ width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)', background: 'var(--color-primary-bg)', color: 'var(--color-primary-strong)' }}>
              <D n="orbit" s={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>North County</div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>Your region · beta</div>
            </div>
            <D n="chevrons-up-down" s={14} c="var(--color-text-subtle)" />
          </div>
          <Divide />
          <Group label="System">
            <Item icon="lock" label="Account and security" />
            <Item icon="credit-card" label="Plan and billing" meta="Preview" />
            <Item icon="palette" label="Appearance" meta="DAWN" />
            <Item icon="globe" label="Language and region" />
            <Item icon="download" label="Export your data" />
          </Group>
          <Divide />
          <Group label="Help">
            <Item icon="life-buoy" label="Help and feedback" />
            <Item icon="keyboard" label="Keyboard shortcuts" meta="?" />
            <Item icon="sparkle" label="What is new" />
          </Group>
          <Divide />
          <Group>
            <Item icon="log-out" label="Sign out" tone="danger" />
          </Group>
        </Popover>
      ) : null}
    </div>
  );
}

// ── Bottom right: the Vault ──────────────────────────────────────────────────
// Sparks are earned by turning up. Stashing them is the point of the dock: a
// stashed spark buys a freeze, and a freeze is a kindness, not a purchase of
// status. So the numbers are big, the ledger is honest, and nothing here is red.
function VaultDock({ sparks = 1240, today = 18, streak = 50 }) {
  const { open, setOpen, ref } = usePopover();
  const [stashed, setStashed] = React.useState(false);
  const { Counter, CounterRow, StreakMeter, Button, RankBadge } = NSD;
  const loose = stashed ? 0 : today;
  return (
    <div ref={ref} style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 65 }}>
      {open ? (
        <Popover place="up-right" width="20.5rem" style={{ padding: 0, overflow: 'hidden' }}>
          {/* The stash head sits on ink with a halo: the one hot object in the app. */}
          <div className="bg-slat scanlines" style={{ position: 'relative', padding: '1.15rem 1.1rem 1.2rem' }}>
            <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span className="halo" style={{ position: 'relative', width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center',
                borderRadius: 'var(--radius-control)', background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}>
                <span style={{ position: 'relative', zIndex: 1, display: 'grid' }}><D n="gem" s={20} /></span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="eyebrow" style={{ margin: 0, fontSize: 'var(--text-3xs)', color: 'var(--color-primary)' }}>The Vault</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 3 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '2rem', lineHeight: 1, color: 'var(--color-on-ink)' }}>
                    {(sparks + (stashed ? today : 0)).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-on-ink-muted)' }}>sparks</span>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close the Vault"
                style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-on-ink-muted)' }}>
                <D n="x" s={14} />
              </button>
            </div>
            <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-meta)', color: 'var(--color-on-ink-muted)' }}>
                {loose ? `${loose} loose from today` : 'Everything is stashed'}
              </div>
              <Button size="sm" disabled={!loose} onClick={() => setStashed(true)}
                iconRight={<D n={loose ? 'arrow-down-to-line' : 'check'} s={14} />}>
                {loose ? `Stash ${loose}` : 'Stashed'}
              </Button>
            </div>
            <span className="light-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4 }} />
          </div>
          <div style={{ padding: '0.9rem 1rem 1rem', background: 'var(--color-surface)' }}>
            <StreakMeter days={streak} freezes={2} best={64} showWeek
              week={['logged', 'logged', 'missed', 'logged', 'frozen', 'logged', 'today']}
              hint="A freeze spends 40 sparks. Never miss twice." />
            <hr className="rule-amber" style={{ margin: '0.9rem 0' }} />
            <CounterRow size="sm" shape="tile" items={[
              { kind: 'practices', value: 34, caption: 'Practices' },
              { kind: 'events', value: 11, caption: 'Turned up' },
              { kind: 'trophies', value: 3, caption: 'Badges' },
            ]} />
            <hr className="rule-amber" style={{ margin: '0.9rem 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="eyebrow" style={{ flex: 1, fontSize: 'var(--text-3xs)', color: 'var(--color-text-subtle)' }}>Recent</span>
              <RankBadge rank="initiate" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[['Sunrise plunge', '+12', 'checkins'], ['Morning breath', '+4', 'practices'], ['Freeze used', '-40', 'gems']].map(([t, v, k]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-meta)' }}>
                  <D n={k === 'gems' ? 'snowflake' : k === 'checkins' ? 'door-open' : 'sparkles'} s={13} c="var(--color-text-subtle)" />
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--color-text-muted)' }}>{t}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: v.startsWith('-') ? 'var(--color-text-subtle)' : 'var(--color-primary-strong)' }}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '0.85rem 0 0', fontSize: 'var(--text-2xs)', lineHeight: 1.55, color: 'var(--color-text-subtle)' }}>
              Sparks never expire and cannot be bought. They buy freezes and season cosmetics, never standing.
            </p>
          </div>
        </Popover>
      ) : null}
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title="The Vault"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '0.45rem 0.8rem 0.45rem 0.6rem', cursor: 'pointer',
          fontFamily: 'inherit', borderRadius: 'var(--radius-pill)', background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', color: 'var(--color-text)' }}>
        <span className="halo" style={{ position: 'relative', width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: '50%',
          background: 'var(--color-primary)', color: 'var(--color-text-on-primary)' }}>
          <span style={{ position: 'relative', zIndex: 1, display: 'grid' }}><D n="gem" s={13} /></span>
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem', fontWeight: 500 }}>
          {(sparks + (stashed ? today : 0)).toLocaleString()}
        </span>
        {loose ? (
          <span style={{ padding: '0.05rem 0.4rem', borderRadius: 'var(--radius-pill)', background: 'var(--color-primary-bg)',
            color: 'var(--color-primary-strong)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)' }}>+{loose}</span>
        ) : null}
        <span style={{ width: 1, height: 16, background: 'var(--color-border)' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
          <D n="flame" s={13} c="var(--color-primary-strong)" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{streak}</span>
        </span>
      </button>
    </div>
  );
}

// ── Bottom right, operator mode: this page ───────────────────────────────────
// Same dock, same shell, different subject. An operator on a page wants two things
// about THAT page: how it is doing, and its switches. Global admin lives in the rail.
function PageDock({ page = 'This page', stats = [], settings = [], note }) {
  const { open, setOpen, ref } = usePopover();
  const { Switch, CounterRow, Badge } = NSD;
  const [on, setOn] = React.useState(() => settings.map((s) => !!s.on));
  return (
    <div ref={ref} style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 65 }}>
      {open ? (
        <Popover place="up-right" width="20.5rem" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.85rem 1rem', background: 'var(--color-canvas)', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)',
              background: 'var(--color-broadcast-bg)', color: 'var(--color-broadcast-strong)' }}><D n="gauge" s={15} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="eyebrow" style={{ margin: 0, fontSize: 'var(--text-3xs)', color: 'var(--color-text-subtle)' }}>Operator · this page</p>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: 'var(--tracking-tight)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-subtle)' }}>
              <D n="x" s={14} />
            </button>
          </div>
          <div style={{ padding: '0.9rem 1rem 1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ padding: '0.6rem 0.7rem', borderRadius: 'var(--radius-control)', background: 'var(--color-canvas)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: '1.25rem', lineHeight: 1.1 }}>{s.value}</div>
                  <div className="eyebrow" style={{ marginTop: 3, fontSize: 'var(--text-3xs)', color: 'var(--color-text-muted)' }}>{s.label}</div>
                  {s.sub ? <div style={{ marginTop: 3, fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>{s.sub}</div> : null}
                </div>
              ))}
            </div>
            <hr className="rule-amber" style={{ margin: '0.9rem 0' }} />
            <span className="eyebrow" style={{ fontSize: 'var(--text-3xs)', color: 'var(--color-text-subtle)' }}>Page settings</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
              {settings.map((s, i) => (
                <label key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0.1rem', cursor: 'pointer' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 600 }}>{s.label}</span>
                    {s.hint ? <span style={{ display: 'block', marginTop: 1, fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>{s.hint}</span> : null}
                  </span>
                  <Switch checked={on[i]} onChange={(v) => setOn((prev) => prev.map((p, j) => (j === i ? v : p)))} />
                </label>
              ))}
            </div>
            {note ? (
              <p style={{ margin: '0.85rem 0 0', fontSize: 'var(--text-2xs)', lineHeight: 1.55, color: 'var(--color-text-subtle)' }}>{note}</p>
            ) : null}
          </div>
        </Popover>
      ) : null}
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Page stats and settings"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.45rem 0.85rem', cursor: 'pointer', fontFamily: 'inherit',
          borderRadius: 'var(--radius-pill)', background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-md)', color: 'var(--color-text)', fontSize: 'var(--text-2xs)', fontWeight: 700 }}>
        <D n="gauge" s={14} c="var(--color-broadcast-strong)" />
        {stats[0] ? (<>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 500 }}>{stats[0].value}</span>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{stats[0].label}</span>
        </>) : 'This page'}
      </button>
    </div>
  );
}

Object.assign(window, { AccountDock, SystemMenu, VaultDock, PageDock, DockPopover: Popover });

})();


// The rail strip: a folded rail is a VISIBLE strip, never a missing track.
function RailStrip({ hints = ['compass', 'calendar-days', 'users'] }) {
  return (
    <aside style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      padding: '1.5rem 0', minHeight: '13rem', position: 'sticky', top: 0 }}>
      {hints.map((h) => (
        <span key={h} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', color: 'var(--color-text-subtle)' }}>
          <window.Ico n={h} style={{ width: 15, height: 15 }} />
        </span>
      ))}
      <span style={{ marginTop: 'auto', width: 26, height: 26, display: 'grid', placeItems: 'center', color: 'var(--color-text-subtle)' }}>
        <window.Ico n="panel-right-open" style={{ width: 14, height: 14 }} />
      </span>
    </aside>
  );
}
window.RailStrip = RailStrip;
module.exports = {
  Ico: window.Ico, TopBar: window.TopBar, NavRail: window.NavRail, RightRail: window.RightRail,
  RailStrip, AccountDock: window.AccountDock, VaultDock: window.VaultDock, SystemMenu: window.SystemMenu,
  FeedComposer: window.FeedComposer, FeedPostCard: window.FeedPostCard,
  FeedEventTeaser: window.FeedEventTeaser, FeedActivityLine: window.FeedActivityLine,
};
