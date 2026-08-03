// The shared frame every screen mock sits in. Reuses the real app chrome
// (TopBar + NavRail from ui_kits/app) and adds two controls:
//   · the theme switcher, so each screen can be read in all four render states
//     (DAWN light/dark, Midnight light/dark), and
//   · rail collapse, either side, independently. Collapsing is a user control,
//     not just a breakpoint: the left rail folds to an icon strip and the right
//     rail folds away to a reopen tab.
// The grid keeps equal flexible side tracks, so the content column stays put and
// only gets wider when a rail folds.

// Rail track widths live in TRACK, below.

function Seg({ label, value, options, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="eyebrow" style={{ width: '4.6rem', flexShrink: 0, fontSize: 'var(--text-3xs)', color: 'var(--color-text-muted)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 'var(--radius-pill)', background: 'var(--color-canvas)', border: '1px solid var(--color-border)' }}>
        {options.map(([id, text]) => {
          const on = value === id;
          return (
            <button key={id} onClick={() => onChange(id)}
              style={{ padding: '0.22rem 0.6rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-2xs)', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
                background: on ? 'var(--color-surface)' : 'transparent',
                color: on ? 'var(--color-text)' : 'var(--color-text-muted)',
                boxShadow: on ? 'var(--shadow-2xs)' : 'none' }}>{text}</button>
          );
        })}
      </div>
    </div>
  );
}

// The tweaks panel. Collapsed to a button by default so it never covers the design.
// Each rail control has three positions: Auto follows the room, the other two are a
// standing instruction until the window is too narrow to obey it.
function Tweaks({ state, set, room, leftState, rightState, hasRail }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', state.mode === 'dark');
    const shell = document.querySelector('.shell');
    if (shell) {
      if (state.skin === 'midnight') shell.setAttribute('data-skin', 'midnight');
      else shell.removeAttribute('data-skin');
    }
  }, [state.mode, state.skin]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Tweaks"
        style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '0.45rem 0.8rem', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 'var(--text-2xs)', fontWeight: 700, background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', color: 'var(--color-text)' }}>
        <Ico n="sliders-horizontal" style={{ width: 14, height: 14 }} /> Tweaks
      </button>
    );
  }
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 60, width: '19rem', padding: '0.9rem 1rem',
      borderRadius: 'var(--radius-card)', background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ico n="sliders-horizontal" style={{ width: 15, height: 15, color: 'var(--color-primary-strong)' }} />
        <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 700, letterSpacing: 'var(--tracking-tight)' }}>Tweaks</span>
        <button onClick={() => setOpen(false)} aria-label="Close tweaks"
          style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--color-text-subtle)' }}>
          <Ico n="x" style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <Seg label="Skin" value={state.skin} onChange={(v) => set({ skin: v })} options={[['dawn', 'DAWN'], ['midnight', 'Midnight']]} />
        <Seg label="Mode" value={state.mode} onChange={(v) => set({ mode: v })} options={[['light', 'Light'], ['dark', 'Dark']]} />
        {room.overlayMenu
          ? <Seg label="Menu" value={state.drawer ? 'over' : 'icons'} onChange={(v) => set({ drawer: v === 'over' })} options={[['icons', 'Strip'], ['over', 'Over content']]} />
          : <Seg label="Menu" value={state.left || 'auto'} onChange={(v) => set({ left: v === 'auto' ? null : v })} options={[['auto', 'Auto'], ['open', 'Open'], ['icons', 'Icons']]} />}
        {hasRail ? (
          <Seg label="Rail" value={room.forceRightStrip ? 'closed' : (state.right || 'auto')}
            onChange={(v) => set({ right: v === 'auto' ? null : v })}
            options={[['auto', 'Auto'], ['open', 'Open'], ['closed', 'Strip']]} />
        ) : null}
        <Seg label="Canvas" value={state.width} onChange={(v) => set({ width: v })} options={[['comfort', 'Comfort'], ['wide', 'Wide'], ['full', 'Full']]} />
      </div>
      <p style={{ margin: '11px 0 0', fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)', lineHeight: 1.5 }}>
        {room.overlayMenu
          ? `${room.w}px: the menu is an icon strip and opens over the content.`
          : room.forceRightStrip
            ? `${room.w}px: too narrow for an open rail, so it is holding the strip.`
            : `${room.w}px · menu ${leftState}, rail ${hasRail ? rightState : 'none'}. Auto follows the room; anything else is your standing instruction.`}
      </p>
    </div>
  );
}

// ── The rail affordance ─────────────────────────────────────────────────────
// Every open/close control in the app is this one thing: a quiet glyph at the FOOT
// of the rail it belongs to. At the top it competed with the first real row for
// attention, and folding a rail is not something anyone does often — so it sits
// under the content, borderless, at subtle weight, warming only on hover.
function RailToggle({ icon, label, onClick, align = 'flex-end' }) {
  const [h, setH] = React.useState(false);
  return (
    <div style={{ display: 'flex', justifyContent: align, marginTop: 'auto', paddingTop: 14 }}>
      <button onClick={onClick} title={label} aria-label={label}
        onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: 'none', background: 'transparent', borderRadius: 'var(--radius-control)',
          color: h ? 'var(--color-text-muted)' : 'var(--color-text-subtle)',
          transition: 'color var(--motion-fast) ease' }}>
        <Ico n={icon} style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}

// The folded right rail. It never disappears: the strip stays, carrying the glyphs
// of what is behind it, so a member can always see there is a rail to open.
function RailTab({ onOpen, hints = ['compass', 'trophy', 'calendar-days'] }) {
  return (
    <aside style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '1.75rem 0',
      minHeight: '13rem', position: 'sticky', top: 0 }}>
      {hints.map((h) => (
        <span key={h} onClick={onOpen} title="Show the rail"
          style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--color-text-subtle)' }}>
          <Ico n={h} style={{ width: 15, height: 15 }} />
        </span>
      ))}
      <RailToggle icon="panel-right-open" label="Show the rail" onClick={onOpen} align="center" />
    </aside>
  );
}

// ── The geometry ─────────────────────────────────────────────────────────────
// Both rails are tracks of the same grid, so they are ATTACHED to the inner column
// and folding one only ever moves its own edge. Four numbers, and nothing else
// decides the layout.
const TRACK = { nav: '12rem', navIcons: '3.25rem', rail: '17rem', railStrip: '2.375rem' };

// The ladder. Each rail has an automatic state for the space available, and a user
// state that overrides it until the window can no longer honour it. `null` means
// "follow the room", which is the default and what makes the layout dynamic.
function useRoom() {
  const [w, setW] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setW(window.innerWidth)); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return {
    w,
    // Under 1000px the menu leaves the layout entirely and arrives over the content.
    overlayMenu: w < 1000,
    autoLeft: w < 1180 ? 'icons' : 'open',
    autoRight: w < 1400 ? 'closed' : 'open',
    // Below this there is no room for an open right rail at any user's request.
    forceRightStrip: w < 1100,
  };
}

function Screen({ active, children, rail, wide, canvas, collapseLeft = false, collapseRight = false, dock }) {
  const room = useRoom();
  const [t, setT] = React.useState({
    skin: 'dawn', mode: 'light',
    // null = follow the room. A page may ask to arrive folded (editors do) and that
    // reads as a user intent, not a new rule.
    left: collapseLeft ? 'icons' : null,
    right: collapseRight ? 'closed' : null,
    width: canvas ? 'full' : wide ? 'wide' : 'comfort',
  });
  const set = (patch) => setT((prev) => ({ ...prev, ...patch }));
  const drawer = !!t.drawer;
  const setDrawer = (v) => set({ drawer: typeof v === 'function' ? v(drawer) : v });

  const leftState = room.overlayMenu ? 'icons' : (t.left || room.autoLeft);
  const rightState = !rail ? 'none' : room.forceRightStrip ? 'closed' : (t.right || room.autoRight);
  const center = t.width === 'full' ? 'none' : t.width === 'wide' ? '1180px' : '820px';
  const vars = {
    '--center': center,
    '--nav-w': leftState === 'open' ? TRACK.nav : TRACK.navIcons,
    '--rail-w': rightState === 'none' ? '0px' : rightState === 'open' ? TRACK.rail : TRACK.railStrip,
    '--rail-gap': room.w < 1100 ? 'var(--space-6)' : room.w < 1300 ? 'var(--space-7)' : 'var(--space-10)',
  };
  const toggleLeft = () => {
    if (room.overlayMenu) setDrawer((d) => !d);
    else set({ left: leftState === 'open' ? 'icons' : 'open' });
  };
  return (
    <div className="shell">
      <window.TopBar onToggleNav={toggleLeft} />
      <main className="scroll app-main" style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 1.5rem' }}>
        <div className="app-grid" style={vars}>
          <window.NavRail active={active} onNav={() => {}} collapsed={leftState === 'icons'} onToggle={toggleLeft} />
          <div className="app-main-col" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', padding: '1.75rem 0 3.5rem' }}>{children}</div>
          <div className="app-rail">
            {rightState === 'open' ? React.cloneElement(rail, { onCollapse: () => set({ right: 'closed' }) })
              : rightState === 'closed' ? <RailTab onOpen={() => set({ right: 'open' })} />
              : null}
          </div>
        </div>
      </main>
      {room.overlayMenu && drawer ? (
        <>
          <button className="app-scrim" aria-label="Close the menu" onClick={() => setDrawer(false)} />
          <div className="app-drawer" style={{ width: '13.5rem' }}>
            <window.NavRail active={active} onNav={() => setDrawer(false)} overlay onToggle={() => setDrawer(false)} />
          </div>
        </>
      ) : null}
      <Tweaks state={t} set={set} room={room} leftState={leftState} rightState={rightState} hasRail={!!rail} />
      {/* Bottom right: the Vault in member mode, this page's stats and switches in
          operator mode. A screen passes its own dock; the default is the Vault. */}
      {dock === null ? null : (dock || <window.VaultDock />)}
    </div>
  );
}

// The rail wrapper every screen's right rail uses, so padding and the collapse
// affordance stay consistent. It fills its track; the track owns the width.
function Rail({ children, onCollapse }) {
  return (
    <aside style={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24, padding: '1.75rem 0 3.5rem' }}>
      {children}
      {onCollapse ? <RailToggle icon="panel-right-close" label="Hide the rail" onClick={onCollapse} /> : null}
    </aside>
  );
}

// ── Icons that React owns ────────────────────────────────────────────────────
// lucide.createIcons() REPLACES an <i data-lucide> element with a fresh <svg>. If
// React created that <i>, its next re-render tries to remove a node that is no
// longer in the tree and the whole app unmounts. So icons render as React-owned
// SVG built from lucide's own icon data instead of being swapped in afterwards.
function Ico({ n, style, className }) {
  const inner = React.useMemo(() => {
    const L = window.lucide;
    if (!L || !L.icons || !n) return '';
    const key = String(n).split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    // A lucide icon node is either [tag, attrs, children] or a bare list of parts,
    // and each part nests the same way. Walk it rather than assuming one shape.
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
  const w = (style && style.width) || 16;
  const h = (style && style.height) || w;
  return (
    <svg className={className} width={w} height={h} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style, width: w, height: h }}
      dangerouslySetInnerHTML={{ __html: inner }} />
  );
}
window.Ico = Ico;

// ── The detail-page grammar, lifted from the live Events page ────────────────
// Every entity page opens the same way: a breadcrumb, poster art, ONE title with a
// status chip and icon-only operator actions, then icon meta rows. Facts are stated
// once, as chips. This is what stops each page inventing its own header.

function Breadcrumb({ trail = [] }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-meta)', color: 'var(--color-text-muted)', marginBottom: 14 }}>
      {trail.map((t, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Ico n="chevron-right" style={{ width: 13, height: 13, color: 'var(--color-text-subtle)' }} /> : null}
          {i < trail.length - 1 ? <a href="#">{t}</a> : <span>{t}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

// Poster art. The frame is art only: the title never lives inside it, so it is
// never said twice.
function Cover({ src, height = 240, children }) {
  return (
    <div style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden', position: 'relative', border: '1px solid var(--color-border)' }}>
      <img src={src} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
      <span className="light-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
      {children}
    </div>
  );
}

function MetaRow({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95rem', color: 'var(--color-text-muted)' }}>
      <Ico n={icon} style={{ width: 15, height: 15, flexShrink: 0, color: 'var(--color-text-subtle)' }} />
      <span>{children}</span>
    </div>
  );
}

// One title, one status chip, and operator actions reduced to glyphs so the
// member's primary action is never out-shouted.
function TitleRow({ title, status, meta = [], actions = [] }) {
  const { IconButton } = window.DAWNFrequencyDesignSystem_c868e3;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 18 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.9rem', letterSpacing: 'var(--tracking-tight-display)', lineHeight: 1.15 }}>{title}</h1>
          {status}
        </div>
        {meta.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
            {meta.map((m, i) => <MetaRow key={i} icon={m.icon}>{m.text}</MetaRow>)}
          </div>
        ) : null}
      </div>
      {actions.length ? (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {actions.map((a) => (
            <IconButton key={a.label} label={a.label} size={34}>
              <Ico n={a.icon} style={{ width: 15, height: 15 }} />
            </IconButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// A chip row: variants to pick (dates, tiers) or facts to know. Never prose that
// repeats what a chip already says.
function ChipRow({ label, items = [], value, onChange, tone = 'primary' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
      {label ? <span className="eyebrow" style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', marginRight: 4 }}>{label}</span> : null}
      {items.map((it, i) => {
        const on = onChange ? value === i : false;
        const Tag = onChange ? 'button' : 'span';
        return (
          <Tag key={it} onClick={onChange ? () => onChange(i) : undefined}
            style={{ padding: '0.32rem 0.78rem', borderRadius: 'var(--radius-pill)', fontFamily: 'inherit', fontSize: 'var(--text-meta)',
              fontWeight: on ? 700 : 500, cursor: onChange ? 'pointer' : 'default',
              background: on ? `var(--color-${tone}-bg)` : onChange ? 'var(--color-surface)' : `var(--color-${tone}-bg)`,
              color: on ? `var(--color-${tone}-strong)` : onChange ? 'var(--color-text-muted)' : `var(--color-${tone}-strong)`,
              border: onChange ? `1px solid ${on ? `color-mix(in srgb, var(--color-${tone}) 34%, transparent)` : 'var(--color-border)'}` : 'none' }}>{it}</Tag>
        );
      })}
    </div>
  );
}

// A titled beat: a tinted glyph chip, a title, an optional count and action. This
// is what breaks a long page into readable sections instead of one grey column.
function Beat({ icon, tone = 'primary', title, count, action, children, first }) {
  return (
    <section style={{ marginTop: first ? 0 : 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--radius-control)',
          background: `var(--color-${tone}-bg)`, color: `var(--color-${tone}-strong)` }}>
          <Ico n={icon} style={{ width: 15, height: 15 }} />
        </span>
        <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: '1.08rem', letterSpacing: 'var(--tracking-tight)' }}>{title}</h2>
        {count != null ? <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-meta)', color: 'var(--color-text-subtle)' }}>{count}</span> : null}
        {action ? <span style={{ flexShrink: 0, fontSize: 'var(--text-meta)', fontWeight: 700, color: 'var(--color-primary-strong)', cursor: 'pointer', whiteSpace: 'nowrap' }}>{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

// The featured header: poster art carrying the title in the display face, with an
// editorial italic second line. The hero IS the title treatment, so the page never
// says the name twice.
function FeatureHero({ src, kicker, title, script, blurb, height = 300 }) {
  return (
    <div style={{ position: 'relative', borderRadius: 'var(--radius-2xl)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
      <img src={src} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, color-mix(in srgb, var(--color-ink) 82%, transparent) 0%, color-mix(in srgb, var(--color-ink) 52%, transparent) 52%, color-mix(in srgb, var(--color-ink) 20%, transparent) 100%)' }} />
      <span className="amber-glow" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.7 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 2.2rem' }}>
        {kicker ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', padding: '0.28rem 0.7rem',
            borderRadius: 'var(--radius-pill)', background: 'var(--color-primary)', color: 'var(--color-text-on-primary)',
            fontFamily: 'var(--font-grotesk)', fontSize: 'var(--text-2xs)', fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{kicker}</span>
        ) : null}
        <h1 className="font-display" style={{ margin: '0.7rem 0 0', fontSize: 'clamp(2.4rem, 5vw, 3.9rem)', lineHeight: 0.92,
          color: 'var(--color-on-ink)', letterSpacing: '0.012em' }}>{title}</h1>
        {script ? (
          <p style={{ margin: '0.15rem 0 0', fontFamily: 'var(--font-editorial)', fontStyle: 'italic',
            fontSize: 'clamp(1.4rem, 2.5vw, 2rem)', lineHeight: 1.1, color: 'var(--color-primary)' }}>{script}</p>
        ) : null}
        {blurb ? (
          <p className="text-shadow-soft" style={{ margin: '0.85rem 0 0', maxWidth: '26rem', fontSize: '1rem', lineHeight: 1.55, color: 'var(--color-on-ink)' }}>{blurb}</p>
        ) : null}
      </div>
      <span className="light-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />
    </div>
  );
}

// The two-column body every detail page uses: content, then a sticky action column.
function DetailBody({ children, aside, asideWidth = '19rem' }) {
  // Below about 720px of available width the aside stacks under the content rather
  // than squeezing both columns into unreadable strips.
  const [narrow, setNarrow] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 720));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : `minmax(0, 1fr) ${asideWidth}`, gap: 22, marginTop: 24, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div style={{ position: narrow ? 'static' : 'sticky', top: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>{aside}</div>
    </div>
  );
}

Object.assign(window, { Screen, Rail, Tweaks, RailTab, Breadcrumb, Cover, MetaRow, TitleRow, ChipRow, DetailBody, Ico, Beat, FeatureHero });
