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

const NSD = window.DAWNFrequencyDesignSystem_c868e3;
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
