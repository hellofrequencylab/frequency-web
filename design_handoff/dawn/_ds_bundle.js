/* @ds-bundle: {"format":4,"namespace":"DAWNFrequencyDesignSystem_c868e3","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"BrandMark","sourcePath":"components/core/BrandMark.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Glyph","sourcePath":"components/core/Glyph.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"RankBadge","sourcePath":"components/core/RankBadge.jsx"},{"name":"Stat","sourcePath":"components/core/Stat.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Counter","sourcePath":"components/kit/Counter.jsx"},{"name":"CounterRow","sourcePath":"components/kit/Counter.jsx"},{"name":"EntityCard","sourcePath":"components/kit/EntityCard.jsx"},{"name":"GateNotice","sourcePath":"components/kit/GateNotice.jsx"},{"name":"Meter","sourcePath":"components/kit/Meter.jsx"},{"name":"PageHeading","sourcePath":"components/kit/PageHeading.jsx"},{"name":"PersonCard","sourcePath":"components/kit/PersonCard.jsx"},{"name":"ProgressTrack","sourcePath":"components/kit/ProgressTrack.jsx"},{"name":"RowCard","sourcePath":"components/kit/RowCard.jsx"},{"name":"SectionHeader","sourcePath":"components/kit/SectionHeader.jsx"},{"name":"StatCard","sourcePath":"components/kit/StatCard.jsx"},{"name":"StreakMeter","sourcePath":"components/kit/StreakMeter.jsx"},{"name":"UnderlineTabs","sourcePath":"components/kit/UnderlineTabs.jsx"},{"name":"SectionHeading","sourcePath":"components/marketing/SectionHeading.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"4828ed2b6e66","components/core/Badge.jsx":"5edb4a5624b0","components/core/BrandMark.jsx":"19a6c9207f5d","components/core/Button.jsx":"bdf1fd995ed1","components/core/Card.jsx":"5a3d9f83e845","components/core/Glyph.jsx":"de8035663ad0","components/core/IconButton.jsx":"168f1804c967","components/core/RankBadge.jsx":"509ace580871","components/core/Stat.jsx":"0bbe264dd55d","components/feedback/EmptyState.jsx":"0e79adbc7d06","components/feedback/Toast.jsx":"acd5b2770dc0","components/forms/Checkbox.jsx":"f712b1a19883","components/forms/Input.jsx":"b26de5c3093a","components/forms/Select.jsx":"732e3410c0dd","components/forms/Switch.jsx":"f422f88b05be","components/forms/Textarea.jsx":"3a02d5660729","components/kit/Counter.jsx":"b6dee18ec31f","components/kit/EntityCard.jsx":"24db0f5a59cf","components/kit/GateNotice.jsx":"154c7a9b4acb","components/kit/Meter.jsx":"cf9944e8cbbb","components/kit/PageHeading.jsx":"6edd01ded777","components/kit/PersonCard.jsx":"bd94dec261f1","components/kit/ProgressTrack.jsx":"e2c53fd04f51","components/kit/RowCard.jsx":"70a1e046705d","components/kit/SectionHeader.jsx":"9b8b68fcf174","components/kit/StatCard.jsx":"5d9d0b6a365d","components/kit/StreakMeter.jsx":"c27b748454e2","components/kit/UnderlineTabs.jsx":"70c66a36fb4f","components/marketing/SectionHeading.jsx":"257ab2e30017","components/navigation/Tabs.jsx":"447cd7df4b5f","guidelines/infographics.js":"0848fd8d5eae","ui_kits/app/docks.jsx":"1d8976a5c7b5","ui_kits/app/feed.jsx":"6da281553291","ui_kits/app/icon.jsx":"51fe765d6d95","ui_kits/app/nav-rail.jsx":"a3f5f8b7f83c","ui_kits/app/right-rail.jsx":"04cc9fed72d7","ui_kits/app/topbar.jsx":"022dabc434b7","ui_kits/marketing/beta.jsx":"7d128652b47c","ui_kits/marketing/footer.jsx":"ef20fb641714","ui_kits/marketing/header.jsx":"830410837d44","ui_kits/marketing/hero.jsx":"a6c85e8349ad","ui_kits/marketing/icon.jsx":"bdc98221bc41","ui_kits/marketing/reveal.js":"070024654a34","ui_kits/marketing/sections.jsx":"ad320d0433b6","ui_kits/screens/frame.jsx":"7762179159b0"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DAWNFrequencyDesignSystem_c868e3 = window.DAWNFrequencyDesignSystem_c868e3 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Avatar — a round member image with a warm initials fallback (amber-bg /
 * primary-strong text, the in-app convention). Optional teal "online now" dot.
 */
function Avatar({
  name = '',
  src,
  size = 44,
  online = false,
  className = '',
  style
}) {
  const ring = Math.max(2, Math.round(size / 18));
  const wrap = {
    position: 'relative',
    width: size,
    height: size,
    flexShrink: 0,
    ...style
  };
  const common = {
    width: size,
    height: size,
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
    display: 'block'
  };
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: wrap
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: common
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      ...common,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-primary-bg)',
      color: 'var(--color-primary-strong)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: Math.round(size * 0.38),
      userSelect: 'none'
    }
  }, initials(name)), online && /*#__PURE__*/React.createElement("span", {
    "aria-label": "Online now",
    style: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: size * 0.26,
      height: size * 0.26,
      borderRadius: '50%',
      background: 'var(--color-success)',
      boxShadow: `0 0 0 ${ring}px var(--color-surface)`
    }
  }));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
const TONES = {
  neutral: {
    bg: 'var(--color-surface-elevated)',
    fg: 'var(--color-text-muted)',
    bd: 'var(--color-border)'
  },
  primary: {
    bg: 'var(--color-primary-bg)',
    fg: 'var(--color-primary-strong)',
    bd: 'transparent'
  },
  signal: {
    bg: 'var(--color-signal-bg)',
    fg: 'var(--color-signal-strong)',
    bd: 'transparent'
  },
  broadcast: {
    bg: 'var(--color-broadcast-bg)',
    fg: 'var(--color-broadcast-strong)',
    bd: 'transparent'
  },
  success: {
    bg: 'var(--color-success-bg)',
    fg: 'var(--color-success)',
    bd: 'transparent'
  },
  warning: {
    bg: 'var(--color-warning-bg)',
    fg: 'var(--color-warning)',
    bd: 'transparent'
  },
  danger: {
    bg: 'var(--color-danger-bg)',
    fg: 'var(--color-danger)',
    bd: 'transparent'
  }
};

/**
 * Badge — a small status / category pill. Tones map to the semantic palette
 * (amber primary, teal signal, azure broadcast, plus states). `solid` fills
 * with the tone color for a louder marker. Use sparingly; one accent per row.
 */
function Badge({
  children,
  tone = 'neutral',
  solid = false,
  icon,
  className = '',
  style
}) {
  const t = TONES[tone] || TONES.neutral;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.15rem 0.55rem',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-meta)',
    fontWeight: 700,
    lineHeight: 1.4,
    letterSpacing: '0.01em',
    border: `1px solid ${t.bd}`,
    background: solid ? t.fg : t.bg,
    color: solid ? 'var(--color-surface)' : t.fg,
    ...style
  };
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: base
  }, icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/BrandMark.jsx
try { (() => {
// Custom-property url() values do not reliably resolve relative to the document,
// so the mask always gets an absolute href.
function absolute(src) {
  try {
    return new URL(src, document.baseURI).href;
  } catch (e) {
    return src;
  }
}

/**
 * BrandMark — the Frequency wordmark rendered as an engraved, tinted fill (the
 * `.brandmark` motif): the logo PNG is used as an alpha MASK, filled with warm
 * dark-sandy-brown, with a two-tone emboss + a slow amber shine sweep. Reads as
 * burnt-in, not flat. Hover lifts the catch-light; press deepens the engrave.
 * Pass the logo URL (relative to the host page) and a width.
 */
function BrandMark({
  logo,
  width = 200,
  height = 36,
  href,
  className = '',
  style
}) {
  const mark = /*#__PURE__*/React.createElement("span", {
    className: "brandmark",
    style: {
      '--brand-logo': `url("${absolute(logo)}")`,
      width,
      height,
      ...style
    },
    role: "img",
    "aria-label": "Frequency"
  });
  if (href) {
    return /*#__PURE__*/React.createElement("a", {
      href: href,
      className: `brandmark-link ${className}`,
      "aria-label": "Frequency \u2014 home"
    }, mark);
  }
  return /*#__PURE__*/React.createElement("span", {
    className: `brandmark-link ${className}`
  }, mark);
}
Object.assign(__ds_scope, { BrandMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/BrandMark.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the one Frequency action. Amber `primary` is the only filled chrome
 * accent; `secondary` is the quiet outline; `ghost` is an inline text link.
 * Renders an <a> when `href` is given (most marketing CTAs are navigations),
 * otherwise a <button>. Embossed label on the primary fill.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  type = 'button',
  disabled = false,
  iconRight,
  iconLeft,
  onClick,
  className = '',
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: '0.55rem 1.1rem',
      fontSize: '0.875rem',
      gap: '0.4rem'
    },
    md: {
      padding: '0.8rem 2rem',
      fontSize: '1rem',
      gap: '0.5rem'
    },
    lg: {
      padding: '1rem 2.5rem',
      fontSize: '1.125rem',
      gap: '0.5rem'
    }
  };
  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)',
      boxShadow: 'var(--shadow-pop)',
      border: '1px solid transparent'
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
      border: '1px solid var(--color-border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary-strong)',
      border: '1px solid transparent',
      boxShadow: 'none'
    }
  };
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans)',
    fontWeight: 700,
    lineHeight: 1.1,
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    textDecoration: 'none',
    transition: 'background 160ms ease, box-shadow 160ms ease, border-color 160ms ease, transform 90ms ease',
    whiteSpace: 'nowrap',
    ...sizes[size],
    ...variants[variant],
    ...style
  };
  const labelClass = variant === 'primary' ? 'text-emboss' : '';
  const content = /*#__PURE__*/React.createElement(React.Fragment, null, iconLeft, /*#__PURE__*/React.createElement("span", {
    className: labelClass
  }, children), iconRight);
  if (href && !disabled) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href,
      className: className,
      style: base,
      onClick: onClick
    }, rest), content);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: className,
    style: base,
    disabled: disabled,
    onClick: onClick
  }, rest), content);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the one Frequency surface card. A card means a *distinct object*; for
 * lists, group with a title + whitespace instead. `soft` is a borderless tinted
 * surface; `feature` is a hairline box; `elevated` adds the marketing pop
 * shadow. Radius is `xl` (in-app) by default, `2xl` for marketing feature media.
 */
function Card({
  children,
  tone = 'feature',
  radius = 'xl',
  padding = '1.5rem',
  hover = false,
  className = '',
  style,
  ...rest
}) {
  const tones = {
    soft: {
      background: 'color-mix(in srgb, var(--color-surface-elevated) 60%, transparent)',
      border: '1px solid transparent',
      boxShadow: 'none'
    },
    feature: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)'
    },
    elevated: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-pop)'
    }
  };
  const radii = {
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
    '2xl': 'var(--radius-2xl)'
  };
  const base = {
    borderRadius: radii[radius] || radii.xl,
    padding,
    transition: 'box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease',
    ...tones[tone],
    ...style
  };
  const hoverProps = hover ? {
    onMouseEnter: e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      e.currentTarget.style.borderColor = 'var(--color-primary-bg)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.boxShadow = tones[tone].boxShadow;
      e.currentTarget.style.borderColor = tone === 'soft' ? 'transparent' : 'var(--color-border)';
    }
  } : {};
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: base
  }, hoverProps, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Glyph.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Glyph — a React-owned Lucide icon.
 *
 * Why this exists: `lucide.createIcons()` REPLACES an `<i data-lucide>` node with a
 * fresh `<svg>`. When React created that `<i>`, the next re-render tries to remove a
 * node that no longer exists and the whole tree unmounts. So no component in this
 * system may render `<i data-lucide>` — we read Lucide's icon DATA and render our
 * own SVG, which React owns end to end.
 *
 * The page only needs `<script src="…/lucide.min.js">` present. If it is missing, or
 * the name is unknown, Glyph renders an empty box of the right size rather than
 * throwing — an icon is never worth a blank screen.
 */
function Glyph({
  name,
  size = 16,
  stroke = 2,
  className = '',
  style,
  ...rest
}) {
  const inner = React.useMemo(() => {
    const L = typeof window !== 'undefined' ? window.lucide : null;
    if (!L || !L.icons || !name) return '';
    const key = String(name).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const node = L.icons[key];
    if (!node) return '';
    // Lucide ships nodes as either `[tag, attrs, children]` triples or
    // `{tag, attrs, children}` objects, depending on version. Handle both.
    const kids = Array.isArray(node) ? typeof node[0] === 'string' ? Array.isArray(node[2]) ? node[2] : [] : node : Array.isArray(node.children) ? node.children : [];
    const ser = p => {
      if (!p) return '';
      const tag = Array.isArray(p) ? p[0] : p.tag;
      if (typeof tag !== 'string') return '';
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {};
      const sub = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : p.children || [];
      const a = Object.keys(attrs).filter(k => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object').map(k => `${k}="${String(attrs[k]).replace(/"/g, '&quot;')}"`).join(' ');
      const open = `<${tag}${a ? ' ' + a : ''}`;
      return sub.length ? `${open}>${sub.map(ser).join('')}</${tag}>` : `${open}/>`;
    };
    return kids.map(ser).join('');
  }, [name]);
  return /*#__PURE__*/React.createElement("svg", _extends({
    className: className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    style: {
      flexShrink: 0,
      ...style,
      width: size,
      height: size
    },
    dangerouslySetInnerHTML: {
      __html: inner
    }
  }, rest));
}
Object.assign(__ds_scope, { Glyph });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Glyph.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — a compact icon-only control (reactions, kebab menus, toolbar
 * actions). Quiet by default (subtle icon, warm hover wash); `active` lights it
 * in a tone (amber primary, danger for a liked heart, etc.).
 */
function IconButton({
  children,
  label,
  size = 36,
  tone = 'neutral',
  active = false,
  round = false,
  onClick,
  className = '',
  style,
  ...rest
}) {
  const toneColor = {
    neutral: 'var(--color-primary-strong)',
    danger: 'var(--color-danger)',
    signal: 'var(--color-signal-strong)',
    broadcast: 'var(--color-broadcast-strong)'
  }[tone] || 'var(--color-primary-strong)';
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: round ? 'var(--radius-full)' : 'var(--radius-md)',
    border: 'none',
    background: active ? 'var(--color-surface-elevated)' : 'transparent',
    color: active ? toneColor : 'var(--color-text-subtle)',
    cursor: 'pointer',
    transition: 'background 140ms ease, color 140ms ease',
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    className: className,
    style: base,
    onClick: onClick,
    onMouseEnter: e => {
      if (!active) {
        e.currentTarget.style.background = 'var(--color-surface-elevated)';
        e.currentTarget.style.color = 'var(--color-text-muted)';
      }
    },
    onMouseLeave: e => {
      if (!active) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-text-subtle)';
      }
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/RankBadge.jsx
try { (() => {
// The Quest season ranks are COMPLETION-based: how many of the season's three
// Journeys you have finished. Ghost (0) → Initiate (1) → Adept (2) → Master (3).
// Ghost is a real status, not a guilt trip, so it gets a real badge in stone.
// Any spectrum color name is also accepted, for Pillar dots and Space accents.
const RANK_COLOR = {
  ghost: 'stone',
  initiate: 'clay',
  adept: 'gold',
  master: 'jade',
  stone: 'stone',
  clay: 'clay',
  gold: 'gold',
  olive: 'olive',
  jade: 'jade',
  teal: 'teal',
  slate: 'slate',
  indigo: 'indigo',
  plum: 'plum',
  rose: 'rose'
};

// Journeys finished, for the optional progress read.
const RANK_STEP = {
  ghost: 0,
  initiate: 1,
  adept: 2,
  master: 3
};

/**
 * RankBadge — the in-app season-rank pill (The Quest). Drives the `.rank-badge`
 * primitive off the three rank CSS vars (core / deep / bright) so it reads
 * correctly in light and dark. Pass a season rank or any spectrum color.
 */
function RankBadge({
  rank = 'adept',
  showStep = false,
  children,
  className = '',
  style
}) {
  const key = String(rank).toLowerCase();
  const c = RANK_COLOR[key] || 'gold';
  const label = children ?? String(rank).charAt(0).toUpperCase() + String(rank).slice(1);
  const step = RANK_STEP[key];
  return /*#__PURE__*/React.createElement("span", {
    className: `rank-badge ${className}`,
    style: {
      '--rank': `var(--rank-${c})`,
      '--rank-deep': `var(--rank-${c}-deep)`,
      '--rank-bright': `var(--rank-${c}-bright)`,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "rank-dot"
  }), label, showStep && step !== undefined ? /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7,
      fontVariantNumeric: 'tabular-nums'
    }
  }, step, "/3") : null);
}
Object.assign(__ds_scope, { RankBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/RankBadge.jsx", error: String((e && e.message) || e) }); }

// components/core/Stat.jsx
try { (() => {
/**
 * Stat — a big display numeral over an uppercase label, the editorial way
 * Frequency shows counts (members, events, circles). Anton numeral; `ink` tone
 * for use inside a dark band. Group three in a row for a stat strip.
 */
function Stat({
  value,
  label,
  tone = 'light',
  className = '',
  style
}) {
  const isInk = tone === 'ink';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-display",
    style: {
      fontSize: 'var(--text-stat)',
      color: isInk ? 'var(--color-on-ink)' : 'var(--color-text)',
      lineHeight: 1
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '0.6rem',
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: isInk ? 'var(--color-on-ink-subtle)' : 'var(--color-text-subtle)'
    }
  }, label));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Stat.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/**
 * EmptyState — a warm, encouraging empty surface (no circles yet, no events
 * near you). Icon chip + title + one line of guidance + optional CTA. Never a
 * cold "No data"; always points to the next human action.
 */
function EmptyState({
  icon,
  title,
  children,
  action,
  className = '',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      textAlign: 'center',
      padding: '3rem 1.5rem',
      maxWidth: '26rem',
      marginInline: 'auto',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 'var(--radius-xl)',
      background: 'var(--color-primary-bg)',
      color: 'var(--color-primary-strong)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '1.1rem'
    }
  }, icon), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: '0 0 0.5rem',
      fontSize: '1.125rem',
      fontWeight: 800,
      color: 'var(--color-text)'
    }
  }, title), children && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-body-sm)',
      lineHeight: 1.6,
      color: 'var(--color-text-muted)'
    }
  }, children), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '1.4rem'
    }
  }, action));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/**
 * Toast — a transient achievement / status notice (The Quest awards, "saved",
 * "you earned 5 zaps"). Soft elevated surface, amber accent rail, slide-up
 * entrance (`slideUp` keyframes). Tones tint the icon + rail.
 */
function Toast({
  icon,
  title,
  children,
  tone = 'primary',
  onClose,
  className = '',
  style
}) {
  const railColor = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success)',
    broadcast: 'var(--color-broadcast)',
    danger: 'var(--color-danger)'
  }[tone] || 'var(--color-primary)';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.85rem',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderLeft: `3px solid ${railColor}`,
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-lg)',
      padding: '0.9rem 1rem',
      minWidth: '17rem',
      maxWidth: '22rem',
      animation: 'slideUp 280ms cubic-bezier(0.22,1,0.36,1)',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      color: railColor,
      display: 'inline-flex',
      marginTop: 1,
      flexShrink: 0
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-body-sm)',
      fontWeight: 800,
      color: 'var(--color-text)'
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)',
      marginTop: 2,
      lineHeight: 1.5
    }
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Dismiss",
    onClick: onClose,
    style: {
      appearance: 'none',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)',
      padding: 2,
      lineHeight: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  }))));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/**
 * Checkbox — a custom warm checkbox. Amber fill + check when on. Used for the
 * beta "Oath" gate, settings, and filters. Supports an optional rich label.
 */
function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  id,
  className = '',
  style
}) {
  const box = {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    border: `1.5px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
    background: checked ? 'var(--color-primary)' : 'var(--color-surface)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 140ms ease, border-color 140ms ease',
    cursor: disabled ? 'not-allowed' : 'pointer'
  };
  return /*#__PURE__*/React.createElement("label", {
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: label ? 'flex-start' : 'center',
      gap: '0.6rem',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "checkbox",
    "aria-checked": checked,
    id: id,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: box
  }, checked && /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "20 6 9 17 4 12"
  }))), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-body-sm)',
      lineHeight: 1.5,
      color: 'var(--color-text)'
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — a single-line text field. Hairline warm border, generous height,
 * calm neutral focus ring (text fields never glow amber). Optional leading icon
 * and label. Set `invalid` for the danger border.
 */
function Input({
  label,
  id,
  icon,
  invalid = false,
  hint,
  type = 'text',
  className = '',
  style,
  ...rest
}) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const field = {
    width: '100%',
    boxSizing: 'border-box',
    height: '2.75rem',
    padding: icon ? '0 0.9rem 0 2.4rem' : '0 0.9rem',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    transition: 'border-color 140ms ease, box-shadow 140ms ease'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: 'block',
      fontSize: 'var(--text-body-sm)',
      fontWeight: 700,
      marginBottom: '0.4rem',
      color: 'var(--color-text)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: '0.8rem',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--color-text-subtle)',
      display: 'inline-flex'
    }
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    style: field,
    "aria-invalid": invalid || undefined
  }, rest))), hint && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.4rem 0 0',
      fontSize: 'var(--text-meta)',
      color: invalid ? 'var(--color-danger)' : 'var(--color-text-subtle)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — a styled native dropdown (toolbar filters, settings). Matches Input
 * chrome with a warm chevron. Pass `options` as strings or {value,label}.
 */
function Select({
  label,
  id,
  options = [],
  invalid = false,
  hint,
  className = '',
  style,
  ...rest
}) {
  const inputId = id || (label ? `sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const field = {
    width: '100%',
    boxSizing: 'border-box',
    height: '2.75rem',
    padding: '0 2.4rem 0 0.9rem',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    fontWeight: 600,
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none'
  };
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: 'block',
      fontSize: 'var(--text-body-sm)',
      fontWeight: 700,
      marginBottom: '0.4rem',
      color: 'var(--color-text)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: inputId,
    style: field,
    "aria-invalid": invalid || undefined
  }, rest), norm.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--color-text-subtle)",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: 'absolute',
      right: '0.85rem',
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  }))), hint && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.4rem 0 0',
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/**
 * Switch — a toggle for instant on/off settings (notifications, presence,
 * demo content). Amber when on; pill track + sliding knob. Keyboard + ARIA.
 */
function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  id,
  className = '',
  style
}) {
  const w = 44,
    h = 26,
    pad = 3;
  const knob = h - pad * 2;
  const track = {
    position: 'relative',
    width: w,
    height: h,
    borderRadius: 'var(--radius-full)',
    background: checked ? 'var(--color-primary)' : 'var(--color-border-strong)',
    transition: 'background 160ms ease',
    flexShrink: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    padding: 0,
    opacity: disabled ? 0.5 : 1
  };
  const dot = {
    position: 'absolute',
    top: pad,
    left: checked ? w - knob - pad : pad,
    width: knob,
    height: knob,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: 'var(--shadow-sm)',
    transition: 'left 160ms cubic-bezier(0.34,1.4,0.64,1)'
  };
  const btn = /*#__PURE__*/React.createElement("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    id: id,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: track
  }, /*#__PURE__*/React.createElement("span", {
    style: dot
  }));
  if (!label) return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: style
  }, btn);
  return /*#__PURE__*/React.createElement("label", {
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.65rem',
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...style
    }
  }, btn, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-body-sm)',
      fontWeight: 600,
      color: 'var(--color-text)'
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Textarea — a multi-line text field matching Input's chrome. Used by the feed
 * composer, replies, and bios. Auto-min-height via rows.
 */
function Textarea({
  label,
  id,
  invalid = false,
  hint,
  rows = 4,
  className = '',
  style,
  ...rest
}) {
  const inputId = id || (label ? `ta-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const field = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.7rem 0.9rem',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    lineHeight: 1.6,
    color: 'var(--color-text)',
    background: 'var(--color-surface)',
    border: `1px solid ${invalid ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
    borderRadius: 'var(--radius-md)',
    outline: 'none',
    resize: 'vertical',
    transition: 'border-color 140ms ease, box-shadow 140ms ease'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      display: 'block',
      fontSize: 'var(--text-body-sm)',
      fontWeight: 700,
      marginBottom: '0.4rem',
      color: 'var(--color-text)'
    }
  }, label), /*#__PURE__*/React.createElement("textarea", _extends({
    id: inputId,
    rows: rows,
    style: field,
    "aria-invalid": invalid || undefined
  }, rest)), hint && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.4rem 0 0',
      fontSize: 'var(--text-meta)',
      color: invalid ? 'var(--color-danger)' : 'var(--color-text-subtle)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/kit/Counter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// One glyph per counted thing, so a number is always readable at a glance.
const GLYPH = {
  zaps: 'zap',
  gems: 'gem',
  streak: 'flame',
  airtime: 'timer',
  amplitude: 'activity',
  members: 'users',
  circles: 'users-round',
  events: 'calendar-days',
  practices: 'sparkles',
  journeys: 'route',
  trophies: 'trophy',
  invites: 'user-plus',
  checkins: 'footprints',
  posts: 'message-circle',
  replies: 'message-square',
  rooms: 'hash'
};

// Zaps and streaks are amber; Gems and anything "done" are the teal; movement is Move.
const TONE = {
  zaps: 'primary',
  streak: 'primary',
  gems: 'signal',
  trophies: 'signal',
  airtime: 'move',
  practices: 'move',
  amplitude: 'signal'
};
const SIZES = {
  xs: {
    v: '0.9rem',
    i: 13,
    cap: 'var(--text-3xs)',
    gap: 4,
    pad: '0.2rem 0.5rem'
  },
  sm: {
    v: '1.05rem',
    i: 15,
    cap: 'var(--text-2xs)',
    gap: 5,
    pad: '0.25rem 0.6rem'
  },
  md: {
    v: '1.3rem',
    i: 17,
    cap: 'var(--text-2xs)',
    gap: 6,
    pad: '0.3rem 0.7rem'
  },
  lg: {
    v: '1.75rem',
    i: 20,
    cap: 'var(--text-meta)',
    gap: 8,
    pad: '0.4rem 0.8rem'
  }
};

/**
 * Counter — the one way a number appears in the member register. A glyph, a
 * tabular value, and an optional caption. Three shapes: `inline` (a run of
 * numbers in a row), `chip` (a standalone pill in chrome), `tile` (stacked, for
 * a stat triad). Never an analytics delta: that is StatCard, operator only.
 */
function Counter({
  kind = 'zaps',
  value,
  caption,
  icon,
  tone,
  size = 'sm',
  shape = 'inline',
  muted = false,
  title,
  className = '',
  style
}) {
  const s = SIZES[size] || SIZES.sm;
  const t = tone || TONE[kind] || 'primary';
  const g = icon || GLYPH[kind] || 'circle';
  const color = muted ? 'var(--color-text-muted)' : `var(--color-${t}-strong)`;
  const num = /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: s.v,
      fontWeight: 500,
      letterSpacing: '-0.02em',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
      color: muted ? 'var(--color-text-muted)' : 'var(--color-text)'
    }
  }, value);
  const glyph = /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: g,
    size: s.i,
    style: {
      color
    }
  });
  if (shape === 'tile') {
    return /*#__PURE__*/React.createElement("div", {
      className: className,
      title: title,
      style: {
        flex: 1,
        minWidth: 0,
        textAlign: 'center',
        ...style
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap
      }
    }, glyph, num), caption ? /*#__PURE__*/React.createElement("div", {
      className: "eyebrow",
      style: {
        fontSize: s.cap,
        color: 'var(--color-text-muted)',
        marginTop: 3
      }
    }, caption) : null);
  }
  if (shape === 'chip') {
    return /*#__PURE__*/React.createElement("span", {
      className: className,
      title: title,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        padding: s.pad,
        borderRadius: 'var(--radius-pill)',
        background: muted ? 'var(--color-surface-elevated)' : `var(--color-${t}-bg)`,
        ...style
      }
    }, glyph, num, caption ? /*#__PURE__*/React.createElement("span", {
      className: "eyebrow",
      style: {
        fontSize: s.cap,
        color: 'var(--color-text-muted)'
      }
    }, caption) : null);
  }
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    title: title,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: s.gap,
      ...style
    }
  }, glyph, num, caption ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: s.cap,
      color: 'var(--color-text-muted)'
    }
  }, caption) : null);
}

/**
 * CounterRow — a run of Counters with one rule: at most four, and the four are
 * the game counts (Zaps, Gems, Streak, rank). Keeps every stat strip identical.
 */
function CounterRow({
  items = [],
  size = 'md',
  shape = 'tile',
  divided = true,
  className = '',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: shape === 'tile' ? 6 : 14,
      ...style
    }
  }, items.slice(0, 4).map((it, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: it.kind || i
  }, divided && i > 0 && shape === 'tile' ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      alignSelf: 'stretch',
      background: 'var(--color-border)'
    }
  }) : null, /*#__PURE__*/React.createElement(Counter, _extends({}, it, {
    size: size,
    shape: shape
  })))));
}
Object.assign(__ds_scope, { Counter, CounterRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/Counter.jsx", error: String((e && e.message) || e) }); }

// components/kit/EntityCard.jsx
try { (() => {
/**
 * EntityCard — a card because it IS a distinct object: a Circle, an event, a
 * Journey, a Space. Optional cover, an eyebrow, a title, a line of meta, and a
 * footer slot. Never use it for a row in a list.
 */
function EntityCard({
  cover,
  icon,
  eyebrow,
  title,
  meta,
  children,
  footer,
  accent = 'primary',
  hover = true,
  className = '',
  style
}) {
  const [lift, setLift] = React.useState(false);
  const tone = `var(--color-${accent})`;
  const toneStrong = `var(--color-${accent}-strong)`;
  const toneBg = `var(--color-${accent}-bg)`;
  return /*#__PURE__*/React.createElement("article", {
    className: className,
    onMouseEnter: () => hover && setLift(true),
    onMouseLeave: () => setLift(false),
    style: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: lift ? 'var(--shadow-md)' : 'var(--shadow-2xs)',
      transition: 'box-shadow var(--motion-base) ease',
      ...style
    }
  }, cover ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 132,
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: cover,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0.95rem 1rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: toneBg,
      color: toneStrong
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: icon,
    size: 17
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: '0 0 2px',
      fontSize: 'var(--text-2xs)',
      color: toneStrong
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '1.05rem',
      fontWeight: 'var(--weight-heading)',
      letterSpacing: 'var(--tracking-tight)',
      lineHeight: 1.25
    }
  }, title), meta ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '2px 0 0',
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, meta) : null)), children ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      fontSize: '0.92rem',
      lineHeight: 1.6,
      color: 'var(--color-text-muted)',
      textWrap: 'pretty'
    }
  }, children) : null, footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, footer) : null));
}
Object.assign(__ds_scope, { EntityCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/EntityCard.jsx", error: String((e && e.message) || e) }); }

// components/kit/GateNotice.jsx
try { (() => {
// The four honest states for something that exists but is not on yet. Every one
// says what is true, and none of them pretend the thing is missing or broken.
const KINDS = {
  preview: {
    icon: 'eye',
    tone: 'broadcast',
    label: 'Preview'
  },
  gated: {
    icon: 'clock',
    tone: 'primary',
    label: 'Not on yet'
  },
  dormant: {
    icon: 'moon',
    tone: 'signal',
    label: 'Built, waiting'
  },
  hold: {
    icon: 'pause',
    tone: 'primary',
    label: 'On hold'
  }
};

/**
 * GateNotice — how the product tells the truth about a dormant capability.
 * Billing is off in the beta, AI fails closed, SMS waits on registration: those
 * are states, not errors. The pattern: name the state, say what happens when it
 * turns on, and leave the surface browsable underneath.
 */
function GateNotice({
  kind = 'gated',
  title,
  children,
  action,
  inline = false,
  className = '',
  style
}) {
  const k = KINDS[kind] || KINDS.gated;
  const tone = `var(--color-${k.tone})`;
  const bg = `var(--color-${k.tone}-bg)`;
  const strong = `var(--color-${k.tone}-strong)`;
  if (inline) {
    return /*#__PURE__*/React.createElement("span", {
      className: className,
      title: typeof children === 'string' ? children : undefined,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color: strong,
        fontSize: 'var(--text-2xs)',
        fontWeight: 700,
        ...style
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
      name: k.icon,
      size: 12
    }), title || k.label);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      background: bg,
      borderRadius: 'var(--radius-card)',
      padding: '0.95rem 1.1rem',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-surface)',
      color: strong
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: k.icon,
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.98rem',
      fontWeight: 'var(--weight-heading)',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, title || k.label), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      fontSize: 'var(--text-3xs)',
      color: strong
    }
  }, k.label)), children ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '3px 0 0',
      fontSize: '0.92rem',
      lineHeight: 1.6,
      color: 'var(--color-text-muted)',
      textWrap: 'pretty'
    }
  }, children) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 11
    }
  }, action) : null));
}
Object.assign(__ds_scope, { GateNotice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/GateNotice.jsx", error: String((e && e.message) || e) }); }

// components/kit/Meter.jsx
try { (() => {
/**
 * Meter — an allowance against a cap. The paywall is caps and take-rate, never
 * feature locks, so a Space never shows a lock: it shows how much room is left.
 * Warns at 80% and reads "full" at the cap, in plain language, never in red
 * alarm until the cap is actually reached.
 */
function Meter({
  label,
  used = 0,
  cap,
  unit,
  period,
  hint,
  size = 'md',
  className = '',
  style
}) {
  const unlimited = cap == null;
  const pct = unlimited ? 0 : Math.min(100, Math.round(used / cap * 100));
  const state = unlimited ? 'open' : pct >= 100 ? 'full' : pct >= 80 ? 'near' : 'ok';
  const tone = state === 'full' ? 'var(--color-danger)' : state === 'near' ? 'var(--color-warning)' : 'var(--color-signal)';
  const h = size === 'sm' ? 5 : 7;
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: size === 'sm' ? 'var(--text-meta)' : '0.92rem',
      fontWeight: 600,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-muted)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, used.toLocaleString(), unlimited ? '' : ` / ${cap.toLocaleString()}`, unit ? ` ${unit}` : '', period ? ` ${period}` : '')), /*#__PURE__*/React.createElement("div", {
    style: {
      height: h,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: unlimited ? '100%' : `${pct}%`,
      height: '100%',
      borderRadius: 'var(--radius-pill)',
      background: unlimited ? `repeating-linear-gradient(90deg, var(--color-signal-bg) 0 6px, var(--color-surface-elevated) 6px 12px)` : tone,
      transition: 'width var(--motion-slow) var(--ease-out)'
    }
  })), hint || state !== 'ok' ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '5px 0 0',
      fontSize: 'var(--text-meta)',
      color: state === 'ok' || state === 'open' ? 'var(--color-text-subtle)' : tone,
      lineHeight: 1.5
    }
  }, hint || (state === 'full' ? 'That is the cap for this plan. Nothing is deleted, and new ones wait.' : 'Getting close to the cap.')) : null);
}
Object.assign(__ds_scope, { Meter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/Meter.jsx", error: String((e && e.message) || e) }); }

// components/kit/PageHeading.jsx
try { (() => {
/**
 * PageHeading — the ONE header grammar. Every template opens with it, so no page
 * hand-rolls its own title block. Eyebrow rides the grotesk; the title is the
 * heading weight (700, tracked in), never extra-bold.
 */
function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
  size = 'page',
  className = '',
  style
}) {
  const fs = size === 'section' ? '1.35rem' : size === 'hero' ? '2.3rem' : '1.9rem';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '1rem',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: 0,
      color: 'var(--color-primary-strong)'
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: eyebrow ? '0.4rem 0 0' : 0,
      fontSize: fs,
      fontWeight: 'var(--weight-heading)',
      letterSpacing: 'var(--tracking-tight-display)',
      lineHeight: 1.15
    }
  }, title), subtitle ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.35rem 0 0',
      fontSize: '0.98rem',
      color: 'var(--color-text-muted)',
      maxWidth: '46rem',
      textWrap: 'pretty'
    }
  }, subtitle) : null), actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexShrink: 0
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { PageHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/PageHeading.jsx", error: String((e && e.message) || e) }); }

// components/kit/PersonCard.jsx
try { (() => {
/**
 * PersonCard — a member as an object: avatar, name, role chip, the one line that
 * says who they are, and an action. Role chips appear only where they carry
 * signal (leadership and the system voice), never for member or crew.
 */
function PersonCard({
  avatar,
  name,
  handle,
  role,
  line,
  rank,
  action,
  className = '',
  style
}) {
  const signal = role === 'Host' || role === 'Guide' || role === 'Mentor';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '0.8rem 0.9rem',
      ...style
    }
  }, avatar, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.98rem',
      fontWeight: 'var(--weight-heading)',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, name), role ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-2xs)',
      fontWeight: 700,
      padding: '1px 8px',
      borderRadius: 'var(--radius-pill)',
      background: signal ? 'var(--color-signal-bg)' : 'var(--color-surface-elevated)',
      color: signal ? 'var(--color-signal-strong)' : 'var(--color-text-muted)',
      border: `1px solid ${signal ? 'color-mix(in srgb, var(--color-signal) 26%, transparent)' : 'var(--color-border)'}`
    }
  }, role) : null, rank), handle || line ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, handle ? `@${handle}` : '', handle && line ? ' · ' : '', line) : null), action ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, action) : null);
}
Object.assign(__ds_scope, { PersonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/PersonCard.jsx", error: String((e && e.message) || e) }); }

// components/kit/ProgressTrack.jsx
try { (() => {
/**
 * ProgressTrack — the honest progress read. Either a continuous bar or discrete
 * steps (a Journey's four weeks, a season's three Journeys). Never a percentage
 * for its own sake: the label says what the number means.
 */
function ProgressTrack({
  label,
  hint,
  value = 0,
  total = 100,
  steps,
  accent = 'primary',
  size = 'md',
  className = '',
  style
}) {
  const tone = `var(--color-${accent})`;
  const h = size === 'sm' ? 6 : size === 'lg' ? 12 : 8;
  const pct = total ? Math.max(0, Math.min(100, value / total * 100)) : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: style
  }, label || hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 10,
      marginBottom: 6
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.9rem',
      fontWeight: 600,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, label) : null, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, hint) : null) : null, steps ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4
    }
  }, Array.from({
    length: steps
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      height: h,
      borderRadius: 'var(--radius-pill)',
      background: i < value ? tone : 'var(--color-surface-elevated)',
      border: i < value ? 'none' : '1px solid var(--color-border)',
      boxSizing: 'border-box'
    }
  }))) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: h,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: '100%',
      background: tone,
      borderRadius: 'var(--radius-pill)',
      transition: 'width var(--motion-slow) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressTrack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/ProgressTrack.jsx", error: String((e && e.message) || e) }); }

// components/kit/RowCard.jsx
try { (() => {
/**
 * RowCard — one item in a list. Borderless by default: a leading glyph or date
 * square, a title, a meta line, an optional trailing value, separated from its
 * neighbours by a hairline. This is what a list uses instead of a card each.
 */
function RowCard({
  icon,
  date,
  avatar,
  title,
  meta,
  trailing,
  accent = 'primary',
  divider = true,
  onClick,
  className = '',
  style
}) {
  const [hover, setHover] = React.useState(false);
  const toneStrong = `var(--color-${accent}-strong)`;
  const toneBg = `var(--color-${accent}-bg)`;
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0.6rem 0.5rem',
      boxSizing: 'border-box',
      width: '100%',
      borderRadius: 'var(--radius-control)',
      borderBottom: divider ? '1px solid var(--color-border)' : 'none',
      background: hover && onClick ? 'var(--color-surface)' : 'transparent',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background var(--motion-fast) ease',
      ...style
    }
  }, date ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      flexShrink: 0,
      textAlign: 'center',
      borderRadius: 'var(--radius-control)',
      background: toneBg,
      padding: '4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      fontSize: 'var(--text-3xs)',
      color: toneStrong
    }
  }, date.mon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1.05rem',
      fontWeight: 700,
      lineHeight: 1.1,
      color: toneStrong
    }
  }, date.day)) : avatar ? avatar : icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: toneBg,
      color: toneStrong
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: icon,
    size: 16
  })) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.95rem',
      fontWeight: 600,
      letterSpacing: 'var(--tracking-tight)',
      color: 'var(--color-text)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title), meta ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, meta) : null), trailing ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, trailing) : null);
}
Object.assign(__ds_scope, { RowCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/RowCard.jsx", error: String((e && e.message) || e) }); }

// components/kit/SectionHeader.jsx
try { (() => {
/**
 * SectionHeader — how a group of things gets a name. This is the "group, don't
 * box" primitive: a title, an optional count and action, and spacing. No card,
 * no all-caps micro-label.
 */
function SectionHeader({
  title,
  count,
  action,
  onAction,
  className = '',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '1rem',
      marginBottom: '0.7rem',
      ...style
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      fontSize: '1.05rem',
      fontWeight: 'var(--weight-heading)',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, title, count != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-meta)',
      fontWeight: 400,
      color: 'var(--color-text-subtle)'
    }
  }, count) : null), action ? /*#__PURE__*/React.createElement("button", {
    onClick: onAction,
    style: {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      color: 'var(--color-primary-strong)',
      padding: 0
    }
  }, action) : null);
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/kit/StatCard.jsx
try { (() => {
/**
 * StatCard — the OPERATOR register's number tile. Label, value, an optional
 * delta and sparkline. Deltas and KPI walls belong here and never on a primary
 * member page (the gamified-stat law): a member's numbers are the playful
 * glyph+tile of Stat, not an analytics read.
 */
function StatCard({
  label,
  value,
  unit,
  delta,
  direction,
  hint,
  spark,
  className = '',
  style
}) {
  const up = direction === 'up';
  const flat = !direction || direction === 'flat';
  const deltaColor = flat ? 'var(--color-text-muted)' : up ? 'var(--color-success)' : 'var(--color-danger)';
  const max = spark && spark.length ? Math.max(...spark) : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '0.9rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '1.6rem',
      fontWeight: 500,
      letterSpacing: '-0.02em',
      lineHeight: 1
    }
  }, value), unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)'
    }
  }, unit) : null, delta != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      color: deltaColor
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: flat ? 'minus' : up ? 'trending-up' : 'trending-down',
    size: 13
  }), delta) : null), spark && spark.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 2,
      height: 26,
      marginTop: 2
    }
  }, spark.map((v, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      flex: 1,
      height: `${max ? v / max * 100 : 0}%`,
      borderRadius: 2,
      background: i === spark.length - 1 ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 32%, var(--color-surface-elevated))'
    }
  }))) : null, hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/kit/StreakMeter.jsx
try { (() => {
/**
 * StreakMeter — the streak, told honestly. The count, the earned freezes, and the
 * last seven days as dots (logged / frozen / missed / today). No shame states: a
 * miss is a hollow dot, never red, and "never miss twice" is the only nudge.
 */
function StreakMeter({
  days = 0,
  freezes = 0,
  week = [],
  best,
  size = 'md',
  showWeek = true,
  hint,
  className = '',
  style
}) {
  const big = size === 'lg';
  const dot = (state, i) => {
    const base = {
      width: big ? 12 : 9,
      height: big ? 12 : 9,
      borderRadius: '50%',
      flexShrink: 0
    };
    if (state === 'logged') return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        ...base,
        background: 'var(--color-primary)'
      }
    });
    if (state === 'frozen') return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        ...base,
        background: 'var(--color-signal-bg)',
        border: '1.5px solid var(--color-signal)'
      }
    });
    if (state === 'today') return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        ...base,
        background: 'transparent',
        border: '1.5px dashed var(--color-primary)'
      }
    });
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        ...base,
        background: 'transparent',
        border: '1.5px solid var(--color-border-strong)'
      }
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: big ? 16 : 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: big ? 8 : 6,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: big ? 40 : 30,
      height: big ? 40 : 30,
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--color-primary-bg)',
      color: 'var(--color-primary-strong)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: "flame",
    size: big ? 20 : 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: big ? '1.5rem' : '1.15rem',
      fontWeight: 500,
      letterSpacing: '-0.02em',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums'
    }
  }, days), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, "day", days === 1 ? '' : 's'))), freezes > 0 ? /*#__PURE__*/React.createElement("span", {
    title: `${freezes} streak freeze${freezes === 1 ? '' : 's'} earned`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-signal-bg)',
      color: 'var(--color-signal-strong)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 700,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Glyph, {
    name: "snowflake",
    size: 12
  }), freezes) : null, showWeek && week.length ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: big ? 6 : 5
    }
  }, week.map(dot)) : null, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)',
      minWidth: 0
    }
  }, hint) : null, best != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)',
      flexShrink: 0
    }
  }, "Best ", best) : null);
}
Object.assign(__ds_scope, { StreakMeter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/StreakMeter.jsx", error: String((e && e.message) || e) }); }

// components/kit/UnderlineTabs.jsx
try { (() => {
/**
 * UnderlineTabs — the ONE tab vocabulary in the system. Pill tabs do not exist.
 * The active tab carries an amber underline that sits on the section hairline, so
 * the rule reads as one continuous line broken by the selection.
 */
function UnderlineTabs({
  tabs = [],
  value,
  onChange,
  className = '',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    role: "tablist",
    style: {
      display: 'flex',
      gap: '1.35rem',
      borderBottom: '1px solid var(--color-border)',
      ...style
    }
  }, tabs.map(t => {
    const id = typeof t === 'string' ? t : t.id;
    const label = typeof t === 'string' ? t : t.label;
    const count = typeof t === 'string' ? undefined : t.count;
    const on = id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '0 0 0.7rem',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        fontWeight: on ? 700 : 500,
        color: on ? 'var(--color-text)' : 'var(--color-text-muted)',
        boxShadow: on ? 'inset 0 -2px 0 var(--color-primary)' : 'none',
        marginBottom: -1,
        transition: 'color var(--motion-fast) ease'
      }
    }, label, count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xs)',
        padding: '1px 6px',
        borderRadius: 'var(--radius-pill)',
        background: on ? 'var(--color-primary-bg)' : 'var(--color-surface-elevated)',
        color: on ? 'var(--color-primary-strong)' : 'var(--color-text-muted)'
      }
    }, count) : null);
  }));
}
Object.assign(__ds_scope, { UnderlineTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/kit/UnderlineTabs.jsx", error: String((e && e.message) || e) }); }

// components/marketing/SectionHeading.jsx
try { (() => {
/**
 * SectionHeading — the one marketing section header: a tracked uppercase
 * eyebrow → a heavy Anton display H2 → an optional italic kicker (the deck).
 * Every page heading routes through this. Eyebrow tracking is locked at 0.25em.
 */
function SectionHeading({
  eyebrow,
  title,
  kicker,
  tone = 'light',
  align = 'left',
  size = 'default',
  className = '',
  style
}) {
  const isInk = tone === 'ink';
  const h2Size = size === 'sm' ? 'var(--text-display-h3)' : 'var(--text-display-h2)';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      textAlign: align,
      marginBottom: '2.25rem',
      ...style
    }
  }, eyebrow && /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: '0 0 1rem',
      color: isInk ? 'var(--color-primary)' : 'var(--color-primary-strong)'
    }
  }, eyebrow), /*#__PURE__*/React.createElement("h2", {
    className: "font-display",
    style: {
      margin: 0,
      fontSize: h2Size,
      color: isInk ? 'var(--color-on-ink)' : 'var(--color-text)'
    }
  }, title), kicker && /*#__PURE__*/React.createElement("p", {
    className: "kicker",
    style: {
      margin: '1rem 0 0',
      color: isInk ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)'
    }
  }, kicker));
}
Object.assign(__ds_scope, { SectionHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/SectionHeading.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Tabs — the in-app DetailTemplate tab row (a circle's About/Feed/Events, a
 * profile's tabs). Underline-style, amber active marker, hairline base rule.
 * Controlled via `value` + `onChange`, or uncontrolled with `defaultValue`.
 */
function Tabs({
  tabs = [],
  value,
  defaultValue,
  onChange,
  className = '',
  style
}) {
  const [internal, setInternal] = React.useState(defaultValue ?? (tabs[0] && (tabs[0].value ?? tabs[0])));
  const active = value !== undefined ? value : internal;
  const norm = tabs.map(t => typeof t === 'string' ? {
    value: t,
    label: t
  } : t);
  const pick = v => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    role: "tablist",
    style: {
      display: 'flex',
      gap: '1.5rem',
      borderBottom: '1px solid var(--color-border)',
      ...style
    }
  }, norm.map(t => {
    const on = t.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.value,
      role: "tab",
      "aria-selected": on,
      onClick: () => pick(t.value),
      style: {
        appearance: 'none',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0 0 0.75rem',
        margin: 0,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body-sm)',
        fontWeight: 700,
        color: on ? 'var(--color-text)' : 'var(--color-text-subtle)',
        borderBottom: `2px solid ${on ? 'var(--color-primary)' : 'transparent'}`,
        marginBottom: -1,
        transition: 'color 140ms ease, border-color 140ms ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem'
      }
    }, t.icon, t.label, t.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-meta)',
        fontWeight: 700,
        color: on ? 'var(--color-primary-strong)' : 'var(--color-text-subtle)'
      }
    }, t.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// guidelines/infographics.js
try { (() => {
// Shared renderer for the Frequency teaser infographics (flows 2–6).
// Each flow HTML defines window.DATA, then loads this. Renders #feed + #story.
const GLYPHS = {
  lotus: `<svg viewBox="0 0 48 48"><path d="M24 41 C15 32 15 20 24 11 C33 20 33 32 24 41Z"/><path d="M24 41 C33 36 41 31 43 21 C33 21 27 29 24 41Z"/><path d="M24 41 C15 36 7 31 5 21 C15 21 21 29 24 41Z"/></svg>`,
  ring: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="8"/></svg>`,
  tick: `<svg viewBox="0 0 48 48"><path d="M10 38h28"/><path d="M15 38V28M24 38V20M33 38V12"/><path d="M33 12l-4 4M33 12l4 4" fill="currentColor" stroke="none"/></svg>`,
  note: `<svg viewBox="0 0 48 48"><rect x="8" y="13" width="32" height="22" rx="3"/><path d="M9 16l15 11 15-11"/></svg>`,
  flame: `<svg viewBox="0 0 48 48"><path d="M24 41 C15 37 13 28 19 22 C20 26 22 26 23 24 C24 17 21 14 27 8 C26 16 33 18 32 28 C35 26 35 22 34 20 C38 27 36 37 24 41Z"/></svg>`,
  chat: `<svg viewBox="0 0 48 48"><path d="M10 12h28a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H23l-8 7v-7h-5a3 3 0 0 1-3-3V15a3 3 0 0 1 3-3Z"/></svg>`,
  snow: `<svg viewBox="0 0 48 48"><path d="M24 5v38M8 15l32 18M40 15L8 33"/><path d="M24 5l-4 5M24 5l4 5M24 43l-4-5M24 43l4-5M8 15l1 6M8 15l6-1M40 33l-1-6M40 33l-6 1M40 15l-6-1M40 15l-1 6M8 33l6 1M8 33l1-6"/></svg>`,
  qr: `<svg viewBox="0 0 48 48"><rect x="8" y="8" width="13" height="13"/><rect x="27" y="8" width="13" height="13"/><rect x="8" y="27" width="13" height="13"/><path d="M27 27h5v5M40 27v5M27 40h5M40 36v4"/></svg>`,
  phonecheck: `<svg viewBox="0 0 48 48"><rect x="15" y="6" width="18" height="36" rx="3"/><path d="M19 22l3 3 6-7"/></svg>`,
  checklist: `<svg viewBox="0 0 48 48"><path d="M17 14h20M17 24h20M17 34h20"/><path d="M8 12l2 3 4-5M8 22l2 3 4-5M8 32l2 3 4-5"/></svg>`,
  rows: `<svg viewBox="0 0 48 48"><circle cx="13" cy="14" r="4"/><path d="M22 14h18"/><circle cx="13" cy="24" r="4"/><path d="M22 24h18"/><circle cx="13" cy="34" r="4"/><path d="M22 34h18"/></svg>`,
  tag: `<svg viewBox="0 0 48 48"><path d="M9 9h16l15 15-16 16L9 25V9Z"/><circle cx="17" cy="17" r="3"/></svg>`,
  plane: `<svg viewBox="0 0 48 48"><path d="M43 7L6 21l13 5 4 14 6-11"/><path d="M43 7L23 29"/></svg>`,
  ping: `<svg viewBox="0 0 48 48"><path d="M8 13h24a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H20l-7 6v-6H8a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3Z"/><path d="M40 9l3-3M43 15h4M40 21l3 3" stroke-width="2"/></svg>`,
  bubbles: `<svg viewBox="0 0 48 48"><path d="M6 11h22a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H16l-6 5v-5H6a3 3 0 0 1-3-3V14a3 3 0 0 1 3-3Z"/><path d="M23 28h16a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-2v4l-5-4h-9a3 3 0 0 1-3-3" /></svg>`,
  doorcheck: `<svg viewBox="0 0 48 48"><path d="M14 8h20v34H14z"/><path d="M18 24l3 3 6-7"/><circle cx="30" cy="26" r="1.3" fill="currentColor" stroke="none"/></svg>`,
  house: `<svg viewBox="0 0 48 48"><path d="M8 24L24 10l16 14M12 22v18h24V22"/><path d="M20 40V30h8v10"/></svg>`,
  table: `<svg viewBox="0 0 48 48"><circle cx="15" cy="20" r="5"/><circle cx="33" cy="20" r="5"/><path d="M8 36h32M15 25v6M33 25v6"/></svg>`,
  calendar: `<svg viewBox="0 0 48 48"><rect x="9" y="12" width="30" height="28" rx="3"/><path d="M9 20h30M17 8v6M31 8v6"/><circle cx="24" cy="30" r="5"/></svg>`,
  returnloop: `<svg viewBox="0 0 48 48"><path d="M40 20a16 16 0 1 0-3 18"/><path d="M40 10v10h-10"/></svg>`
};
const ARROW = `<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
function stepHTML(s) {
  const cls = s.dim ? 'dim' : s.lit ? 'lit' : s.n;
  return `<div class="step ${s.dim ? 'dim' : ''}">
    <div class="glyph ${cls}">${GLYPHS[s.g]}</div>
    <div class="txt">
      ${s.day ? `<span class="daytag">${s.day}</span><br>` : ''}
      <p class="lbl">${s.lbl}</p>
      <p class="sub">${s.sub}</p>
      <p class="desc">${s.desc}</p>
    </div>
  </div>`;
}
function build(el, D) {
  el.style.setProperty('--accent', D.accent);
  el.style.setProperty('--n1', D.ramp[0]);
  el.style.setProperty('--n2', D.ramp[1]);
  el.style.setProperty('--n3', D.ramp[2]);
  el.innerHTML = `
    <div class="glowtop"></div><div class="slat"></div>
    <div class="hd">
      <span class="wordmark">Frequency</span>
      <p class="eyb">${D.eyebrow}</p>
      <h1 class="hl">${D.headline}</h1>
      <p class="intro">${D.intro}</p>
    </div>
    <div class="flow">
      <div class="spine"></div>
      ${D.steps.map(stepHTML).join('')}
      ${D.loop ? `<div class="loopnote"><span class="licon">${GLYPHS.returnloop}</span><p>${D.loopText}</p></div>` : ''}
    </div>
    <div class="foot">
      <div class="divider"></div>
      <p class="stat">${D.stat}</p>
      <span class="cta">${D.cta} ${ARROW}</span>
    </div>`;
}
build(document.getElementById('feed'), window.DATA);
build(document.getElementById('story'), window.DATA);
})(); } catch (e) { __ds_ns.__errors.push({ path: "guidelines/infographics.js", error: String((e && e.message) || e) }); }

// ui_kits/app/docks.jsx
try { (() => {
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
const D = ({
  n,
  s = 16,
  c
}) => /*#__PURE__*/React.createElement(window.Ico, {
  n: n,
  style: {
    width: s,
    height: s,
    color: c
  }
});
function usePopover() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return {
    open,
    setOpen,
    ref
  };
}

// The shell. `place` says which corner it grows from; nothing else varies.
function Popover({
  place = 'up-left',
  width = '17.5rem',
  children,
  style
}) {
  const pos = {
    'up-left': {
      bottom: 'calc(100% + 10px)',
      left: 0
    },
    'up-right': {
      bottom: 'calc(100% + 10px)',
      right: 0
    },
    'down-right': {
      top: 'calc(100% + 8px)',
      right: 0
    }
  }[place];
  return /*#__PURE__*/React.createElement("div", {
    className: "glass lift-3 animate-cue-pop",
    role: "menu",
    style: {
      position: 'absolute',
      zIndex: 70,
      width,
      maxHeight: '72vh',
      overflowY: 'auto',
      padding: '0.55rem',
      borderRadius: 'var(--radius-card)',
      ...pos,
      ...style
    }
  }, children);
}
function Group({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0.35rem 0 0.15rem'
    }
  }, label ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: '0.3rem 0 4px 0.55rem',
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-text-subtle)'
    }
  }, label) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }
  }, children));
}
function Item({
  icon,
  label,
  meta,
  tone,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    role: "menuitem",
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '0.42rem 0.55rem',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      borderRadius: 'var(--radius-control)',
      fontFamily: 'inherit',
      fontSize: '0.86rem',
      fontWeight: 600,
      background: h ? 'var(--color-surface-elevated)' : 'transparent',
      color: tone === 'danger' ? 'var(--color-danger-strong)' : 'var(--color-text)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: icon,
    s: 15,
    c: tone === 'danger' ? 'var(--color-danger-strong)' : 'var(--color-text-muted)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, label), meta != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-subtle)'
    }
  }, meta) : null);
}
function Divide() {
  return /*#__PURE__*/React.createElement("hr", {
    className: "rule-amber",
    style: {
      margin: '0.45rem 0.25rem'
    }
  });
}

// ── Bottom left: the account dock ────────────────────────────────────────────
// The rail's foot IS the button. Everything personal and everything the member
// runs lives behind it, grouped by whose it is: mine, then what I host, then money.
function AccountDock({
  collapsed = false
}) {
  const {
    open,
    setOpen,
    ref
  } = usePopover();
  const btn = React.useRef(null);
  const {
    Avatar,
    RankBadge
  } = NSD;
  // The rail scrolls, so an absolutely-positioned popover would be clipped by it.
  // Anchor to the button's rect and escape the scroller with position: fixed.
  const [rect, setRect] = React.useState(null);
  const toggle = () => {
    if (btn.current) setRect(btn.current.getBoundingClientRect());
    setOpen(v => !v);
  };
  const fixed = rect ? {
    position: 'fixed',
    left: Math.max(10, rect.left),
    bottom: Math.round(window.innerHeight - rect.top + 10),
    top: 'auto',
    right: 'auto'
  } : null;
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative',
      marginTop: 14,
      paddingTop: 12,
      borderTop: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    ref: btn,
    onClick: toggle,
    "aria-expanded": open,
    title: "You",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: collapsed ? '0.3rem 0' : '0.35rem 0.45rem',
      justifyContent: collapsed ? 'center' : 'flex-start',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      borderRadius: 'var(--radius-control)',
      background: open ? 'var(--color-surface-elevated)' : 'transparent',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Daniel Tyack",
    size: collapsed ? 28 : 34,
    online: true
  }), collapsed ? null : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: '0.84rem',
      fontWeight: 700,
      color: 'var(--color-text)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, "Daniel Tyack"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(RankBadge, {
    rank: "initiate"
  }))), /*#__PURE__*/React.createElement(D, {
    n: open ? 'chevron-down' : 'chevron-up',
    s: 15,
    c: "var(--color-text-subtle)"
  }))), open ? /*#__PURE__*/React.createElement(Popover, {
    place: "up-left",
    width: "17.5rem",
    style: fixed
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0.5rem 0.55rem 0.6rem'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Daniel Tyack",
    size: 38,
    online: true
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.92rem',
      fontWeight: 700,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, "Daniel Tyack"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, "@danieltyack \xB7 Vista"))), /*#__PURE__*/React.createElement(Group, {
    label: "You"
  }, /*#__PURE__*/React.createElement(Item, {
    icon: "user",
    label: "My profile"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "compass",
    label: "My standing",
    meta: "Initiate"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "notebook-pen",
    label: "Journal"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "bookmark",
    label: "Saved",
    meta: "24"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "bell",
    label: "Notification preferences"
  })), /*#__PURE__*/React.createElement(Divide, null), /*#__PURE__*/React.createElement(Group, {
    label: "What you run"
  }, /*#__PURE__*/React.createElement(Item, {
    icon: "users",
    label: "My Circles",
    meta: "2"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "calendar-days",
    label: "My events",
    meta: "1"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "store",
    label: "My listings",
    meta: "3"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "building-2",
    label: "Business Spaces"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "qr-code",
    label: "QR studio"
  })), /*#__PURE__*/React.createElement(Divide, null), /*#__PURE__*/React.createElement(Group, {
    label: "Money"
  }, /*#__PURE__*/React.createElement(Item, {
    icon: "wallet",
    label: "Payouts",
    meta: "Preview"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "receipt",
    label: "Orders and passes"
  })), /*#__PURE__*/React.createElement(Divide, null), /*#__PURE__*/React.createElement(Group, null, /*#__PURE__*/React.createElement(Item, {
    icon: "shield-check",
    label: "Switch to operator view"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.35rem 0.6rem 0.3rem',
      fontSize: 'var(--text-2xs)',
      lineHeight: 1.5,
      color: 'var(--color-text-subtle)'
    }
  }, "Account, billing and appearance live in the system menu, top right.")) : null);
}

// ── Top right: the system menu ───────────────────────────────────────────────
// Only what outlives a page: which world, who am I, and the settings that are not
// about any one community.
function SystemMenu() {
  const {
    open,
    setOpen,
    ref
  } = usePopover();
  const {
    Avatar
  } = NSD;
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative',
      flexShrink: 0,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(v => !v),
    "aria-expanded": open,
    "aria-label": "System menu",
    title: "System",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: 0,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Daniel Tyack",
    size: 34
  })), open ? /*#__PURE__*/React.createElement(Popover, {
    place: "down-right",
    width: "16.5rem"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '0.5rem 0.55rem 0.55rem'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-primary-bg)',
      color: 'var(--color-primary-strong)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "orbit",
    s: 16
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.88rem',
      fontWeight: 700
    }
  }, "North County"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-muted)'
    }
  }, "Your region \xB7 beta")), /*#__PURE__*/React.createElement(D, {
    n: "chevrons-up-down",
    s: 14,
    c: "var(--color-text-subtle)"
  })), /*#__PURE__*/React.createElement(Divide, null), /*#__PURE__*/React.createElement(Group, {
    label: "System"
  }, /*#__PURE__*/React.createElement(Item, {
    icon: "lock",
    label: "Account and security"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "credit-card",
    label: "Plan and billing",
    meta: "Preview"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "palette",
    label: "Appearance",
    meta: "DAWN"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "globe",
    label: "Language and region"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "download",
    label: "Export your data"
  })), /*#__PURE__*/React.createElement(Divide, null), /*#__PURE__*/React.createElement(Group, {
    label: "Help"
  }, /*#__PURE__*/React.createElement(Item, {
    icon: "life-buoy",
    label: "Help and feedback"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "keyboard",
    label: "Keyboard shortcuts",
    meta: "?"
  }), /*#__PURE__*/React.createElement(Item, {
    icon: "sparkle",
    label: "What is new"
  })), /*#__PURE__*/React.createElement(Divide, null), /*#__PURE__*/React.createElement(Group, null, /*#__PURE__*/React.createElement(Item, {
    icon: "log-out",
    label: "Sign out",
    tone: "danger"
  }))) : null);
}

// ── Bottom right: the Vault ──────────────────────────────────────────────────
// Sparks are earned by turning up. Stashing them is the point of the dock: a
// stashed spark buys a freeze, and a freeze is a kindness, not a purchase of
// status. So the numbers are big, the ledger is honest, and nothing here is red.
function VaultDock({
  sparks = 1240,
  today = 18,
  streak = 50
}) {
  const {
    open,
    setOpen,
    ref
  } = usePopover();
  const [stashed, setStashed] = React.useState(false);
  const {
    Counter,
    CounterRow,
    StreakMeter,
    Button,
    RankBadge
  } = NSD;
  const loose = stashed ? 0 : today;
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 65
    }
  }, open ? /*#__PURE__*/React.createElement(Popover, {
    place: "up-right",
    width: "20.5rem",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slat scanlines",
    style: {
      position: 'relative',
      padding: '1.15rem 1.1rem 1.2rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 3,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "halo",
    style: {
      position: 'relative',
      width: 42,
      height: 42,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'grid'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "gem",
    s: 20
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: 0,
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-primary)'
    }
  }, "The Vault"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 7,
      marginTop: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: '2rem',
      lineHeight: 1,
      color: 'var(--color-on-ink)'
    }
  }, (sparks + (stashed ? today : 0)).toLocaleString()), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-on-ink-muted)'
    }
  }, "sparks"))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(false),
    "aria-label": "Close the Vault",
    style: {
      width: 24,
      height: 24,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-on-ink-muted)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "x",
    s: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 3,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 'var(--text-meta)',
      color: 'var(--color-on-ink-muted)'
    }
  }, loose ? `${loose} loose from today` : 'Everything is stashed'), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    disabled: !loose,
    onClick: () => setStashed(true),
    iconRight: /*#__PURE__*/React.createElement(D, {
      n: loose ? 'arrow-down-to-line' : 'check',
      s: 14
    })
  }, loose ? `Stash ${loose}` : 'Stashed')), /*#__PURE__*/React.createElement("span", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 4
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0.9rem 1rem 1rem',
      background: 'var(--color-surface)'
    }
  }, /*#__PURE__*/React.createElement(StreakMeter, {
    days: streak,
    freezes: 2,
    best: 64,
    showWeek: true,
    week: ['logged', 'logged', 'missed', 'logged', 'frozen', 'logged', 'today'],
    hint: "A freeze spends 40 sparks. Never miss twice."
  }), /*#__PURE__*/React.createElement("hr", {
    className: "rule-amber",
    style: {
      margin: '0.9rem 0'
    }
  }), /*#__PURE__*/React.createElement(CounterRow, {
    size: "sm",
    shape: "tile",
    items: [{
      kind: 'practices',
      value: 34,
      caption: 'Practices'
    }, {
      kind: 'events',
      value: 11,
      caption: 'Turned up'
    }, {
      kind: 'trophies',
      value: 3,
      caption: 'Badges'
    }]
  }), /*#__PURE__*/React.createElement("hr", {
    className: "rule-amber",
    style: {
      margin: '0.9rem 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      flex: 1,
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-text-subtle)'
    }
  }, "Recent"), /*#__PURE__*/React.createElement(RankBadge, {
    rank: "initiate"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, [['Sunrise plunge', '+12', 'checkins'], ['Morning breath', '+4', 'practices'], ['Freeze used', '-40', 'gems']].map(([t, v, k]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 'var(--text-meta)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: k === 'gems' ? 'snowflake' : k === 'checkins' ? 'door-open' : 'sparkles',
    s: 13,
    c: "var(--color-text-subtle)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      color: 'var(--color-text-muted)'
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      color: v.startsWith('-') ? 'var(--color-text-subtle)' : 'var(--color-primary-strong)'
    }
  }, v)))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.85rem 0 0',
      fontSize: 'var(--text-2xs)',
      lineHeight: 1.55,
      color: 'var(--color-text-subtle)'
    }
  }, "Sparks never expire and cannot be bought. They buy freezes and season cosmetics, never standing."))) : null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(v => !v),
    "aria-expanded": open,
    title: "The Vault",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      padding: '0.45rem 0.8rem 0.45rem 0.6rem',
      cursor: 'pointer',
      fontFamily: 'inherit',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-md)',
      color: 'var(--color-text)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "halo",
    style: {
      position: 'relative',
      width: 24,
      height: 24,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '50%',
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'grid'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "gem",
    s: 13
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: '0.9rem',
      fontWeight: 500
    }
  }, (sparks + (stashed ? today : 0)).toLocaleString()), loose ? /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '0.05rem 0.4rem',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-primary-bg)',
      color: 'var(--color-primary-strong)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-2xs)'
    }
  }, "+", loose) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 16,
      background: 'var(--color-border)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: 'var(--color-text-muted)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "flame",
    s: 13,
    c: "var(--color-primary-strong)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.85rem'
    }
  }, streak))));
}

// ── Bottom right, operator mode: this page ───────────────────────────────────
// Same dock, same shell, different subject. An operator on a page wants two things
// about THAT page: how it is doing, and its switches. Global admin lives in the rail.
function PageDock({
  page = 'This page',
  stats = [],
  settings = [],
  note
}) {
  const {
    open,
    setOpen,
    ref
  } = usePopover();
  const {
    Switch,
    CounterRow,
    Badge
  } = NSD;
  const [on, setOn] = React.useState(() => settings.map(s => !!s.on));
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 65
    }
  }, open ? /*#__PURE__*/React.createElement(Popover, {
    place: "up-right",
    width: "20.5rem",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '0.85rem 1rem',
      background: 'var(--color-canvas)',
      borderBottom: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-broadcast-bg)',
      color: 'var(--color-broadcast-strong)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "gauge",
    s: 15
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: 0,
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-text-subtle)'
    }
  }, "Operator \xB7 this page"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.92rem',
      fontWeight: 700,
      letterSpacing: 'var(--tracking-tight)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, page)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(false),
    "aria-label": "Close",
    style: {
      width: 24,
      height: 24,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)'
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "x",
    s: 14
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0.9rem 1rem 1rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
    }
  }, stats.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      padding: '0.6rem 0.7rem',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-canvas)',
      border: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: '1.25rem',
      lineHeight: 1.1
    }
  }, s.value), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginTop: 3,
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-text-muted)'
    }
  }, s.label), s.sub ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 3,
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-subtle)'
    }
  }, s.sub) : null))), /*#__PURE__*/React.createElement("hr", {
    className: "rule-amber",
    style: {
      margin: '0.9rem 0'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-text-subtle)'
    }
  }, "Page settings"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      marginTop: 8
    }
  }, settings.map((s, i) => /*#__PURE__*/React.createElement("label", {
    key: s.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0.4rem 0.1rem',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: '0.86rem',
      fontWeight: 600
    }
  }, s.label), s.hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 1,
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-subtle)'
    }
  }, s.hint) : null), /*#__PURE__*/React.createElement(Switch, {
    checked: on[i],
    onChange: v => setOn(prev => prev.map((p, j) => j === i ? v : p))
  })))), note ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.85rem 0 0',
      fontSize: 'var(--text-2xs)',
      lineHeight: 1.55,
      color: 'var(--color-text-subtle)'
    }
  }, note) : null)) : null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(v => !v),
    "aria-expanded": open,
    title: "Page stats and settings",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '0.45rem 0.85rem',
      cursor: 'pointer',
      fontFamily: 'inherit',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-md)',
      color: 'var(--color-text)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement(D, {
    n: "gauge",
    s: 14,
    c: "var(--color-broadcast-strong)"
  }), stats[0] ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.85rem',
      fontWeight: 500
    }
  }, stats[0].value), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-text-muted)',
      fontWeight: 600
    }
  }, stats[0].label)) : 'This page'));
}
Object.assign(window, {
  AccountDock,
  SystemMenu,
  VaultDock,
  PageDock,
  DockPopover: Popover
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/docks.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/feed.jsx
try { (() => {
// The feed. Grounded in components/feed/post-card.tsx, post-replies.tsx and
// reaction-button.tsx: a kicker is the ONE slot for a post's special state and
// announcement / pinned tint only the HAIRLINE, never the fill; role chips show
// only where they carry signal (leadership and the system voice, never member or
// crew); Zaps earned is a derived count, one reaction is 1 and one reply is 2;
// reaction counts sit beside the comment count on the right, while the inline
// picker shares the composer row. Post cards sit on --color-surface-post.
const NSF = window.DAWNFrequencyDesignSystem_c868e3;

// The curated set from lib/feed/reactions.ts. Skin tones carry the medium tan
// modifier so the row reads as one tone. First five are the quick picks.
const REACTIONS = [{
  key: '❤️',
  label: 'Love this'
}, {
  key: '🔥',
  label: 'Fire'
}, {
  key: '🙌🏽',
  label: 'Celebrate'
}, {
  key: '😂',
  label: 'Funny'
}, {
  key: '😮',
  label: 'Wow'
}, {
  key: '🙏🏽',
  label: 'Grateful'
}];
const QUICK = REACTIONS.slice(0, 5);

// Role chips only where they carry signal: the leadership ladder and the system
// voice, which members always see as "Moderator" (never an operational web role).
function RolePill({
  role
}) {
  if (!role || role === 'member' || role === 'crew') return null;
  const label = {
    host: 'Host',
    guide: 'Guide',
    mentor: 'Mentor',
    admin: 'Admin',
    janitor: 'Janitor',
    moderator: 'Moderator'
  }[role];
  if (!label) return null;
  const signal = role === 'host' || role === 'guide' || role === 'mentor';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      padding: '1px 9px',
      borderRadius: 'var(--radius-pill)',
      background: signal ? 'var(--color-signal-bg)' : 'var(--color-surface-elevated)',
      color: signal ? 'var(--color-signal-strong)' : 'var(--color-text-muted)',
      border: `1px solid ${signal ? 'color-mix(in srgb, var(--color-signal) 26%, transparent)' : 'var(--color-border)'}`
    }
  }, label);
}
function Flag({
  icon,
  label,
  tone
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 'var(--text-2xs)',
      color: tone
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: icon,
    style: {
      width: 13,
      height: 13
    }
  }), label);
}
function PostCard({
  post,
  onReact
}) {
  const {
    Avatar
  } = NSF;
  // Zaps earned: one per reaction, two per reply. Derived, never authored.
  const zaps = post.hearts + post.plus + (post.replies || 0) * 2;
  // Announcement and pinned tint the hairline only; the fill stays the post surface.
  const border = post.announcement ? 'color-mix(in srgb, var(--color-primary) 45%, var(--color-border))' : post.pinned ? 'color-mix(in srgb, var(--color-primary) 26%, var(--color-border))' : 'var(--color-border)';
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: 'var(--color-surface-post)',
      border: `1px solid ${border}`,
      borderRadius: 'var(--radius-card)',
      padding: '1rem 1.1rem 0.85rem'
    }
  }, (post.announcement || post.pinned) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginBottom: 11
    }
  }, post.announcement && /*#__PURE__*/React.createElement(Flag, {
    icon: "megaphone",
    label: "Announcement",
    tone: "var(--color-primary-strong)"
  }), post.pinned && /*#__PURE__*/React.createElement(Flag, {
    icon: "pin",
    label: "Pinned",
    tone: "var(--color-primary-strong)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 11,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: post.author,
    src: post.avatar,
    size: 40,
    online: post.online
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '1.02rem',
      fontWeight: 'var(--weight-heading)',
      letterSpacing: 'var(--tracking-tight)',
      color: 'var(--color-text)'
    }
  }, post.author), /*#__PURE__*/React.createElement(RolePill, {
    role: post.role
  }), post.scope && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(window.Ico, {
    n: "arrow-right",
    style: {
      width: 12,
      height: 12,
      color: 'var(--color-text-subtle)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '0.88rem',
      color: 'var(--color-text-muted)'
    }
  }, post.scope))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 1,
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)'
    }
  }, post.time, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontWeight: 700,
      color: 'var(--color-primary-strong)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "zap",
    style: {
      width: 12,
      height: 12
    }
  }), zaps))), /*#__PURE__*/React.createElement(window.Ico, {
    n: "more-horizontal",
    style: {
      width: 18,
      height: 18,
      color: 'var(--color-text-subtle)',
      cursor: 'pointer'
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.75rem 0 0',
      fontSize: '0.98rem',
      lineHeight: 1.65,
      color: 'var(--color-text)',
      textWrap: 'pretty'
    }
  }, post.body), post.image && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      borderRadius: 'var(--radius-control)',
      overflow: 'hidden',
      height: 230
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: post.image,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 14,
      marginTop: 12,
      fontSize: '0.85rem',
      color: 'var(--color-text-muted)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onReact(post.id, 'heart'),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      fontWeight: post.myHeart ? 800 : 600,
      color: post.myHeart ? 'var(--color-danger)' : 'inherit'
    }
  }, "\u2764\uFE0F ", post.hearts), /*#__PURE__*/React.createElement("button", {
    onClick: () => onReact(post.id, 'plus'),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      fontWeight: post.myPlus ? 800 : 600,
      color: post.myPlus ? 'var(--color-primary-strong)' : 'inherit'
    }
  }, "\uD83D\uDD25 ", post.plus), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "message-circle",
    style: {
      width: 15,
      height: 15
    }
  }), post.replies || '')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
      paddingTop: 10,
      borderTop: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, QUICK.map(r => /*#__PURE__*/React.createElement("button", {
    key: r.key,
    "aria-label": r.label,
    title: r.label,
    onClick: () => onReact(post.id, 'plus'),
    style: {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontSize: '1.05rem',
      lineHeight: 1,
      padding: 2
    }
  }, r.key)), /*#__PURE__*/React.createElement("button", {
    "aria-label": "More reactions",
    title: "More reactions",
    style: {
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "smile-plus",
    style: {
      width: 16,
      height: 16
    }
  }))), /*#__PURE__*/React.createElement("input", {
    placeholder: "Add a comment",
    style: {
      flex: 1,
      minWidth: 0,
      padding: '0.45rem 0.8rem',
      borderRadius: 'var(--radius-pill)',
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      fontFamily: 'inherit',
      fontSize: '0.88rem',
      color: 'var(--color-text)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Send",
    style: {
      width: 34,
      height: 34,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      cursor: 'pointer',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-primary-bg)',
      color: 'var(--color-primary-strong)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "send",
    style: {
      width: 16,
      height: 16
    }
  }))));
}
function Composer({
  onPost
}) {
  const {
    Button
  } = NSF;
  const [text, setText] = React.useState('');
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      boxShadow: focus ? 'var(--shadow-md)' : 'var(--shadow-2xs)',
      transition: 'box-shadow var(--motion-base) ease',
      padding: '1rem 1.1rem'
    }
  }, /*#__PURE__*/React.createElement("textarea", {
    value: text,
    onChange: e => setText(e.target.value),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    rows: 3,
    placeholder: "What's on your mind?",
    style: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: '1rem',
      lineHeight: 1.65,
      color: 'var(--color-text)'
    }
  }), /*#__PURE__*/React.createElement("button", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      color: 'var(--color-text-muted)',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "chevron-up",
    style: {
      width: 14,
      height: 14
    }
  }), " Format"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTop: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '0.35rem 0.75rem',
      borderRadius: 'var(--radius-pill)',
      border: '1px solid var(--color-border-strong)',
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "pen-line",
    style: {
      width: 14,
      height: 14
    }
  }), " Post"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2
    }
  }, ['camera', 'file-pen', 'user-plus', 'megaphone'].map(ic => /*#__PURE__*/React.createElement("button", {
    key: ic,
    style: {
      width: 32,
      height: 32,
      borderRadius: 'var(--radius-control)',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: ic,
    style: {
      width: 17,
      height: 17
    }
  })))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      fontFamily: 'var(--font-mono)',
      color: 'var(--color-text-subtle)'
    }
  }, "\u2318 + Enter"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    disabled: !text.trim(),
    onClick: () => {
      onPost(text.trim());
      setText('');
    }
  }, "Capture")));
}

// An event surfaces inline in the stream, flagged and linked, never boxed like a post.
function EventTeaser({
  mon,
  day,
  name,
  meta
}) {
  return /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      textDecoration: 'none',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '0.85rem 1rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 46,
      flexShrink: 0,
      textAlign: 'center',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-signal-bg)',
      padding: '5px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-3xs)',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--color-signal-strong)'
    }
  }, mon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1.15rem',
      fontWeight: 700,
      lineHeight: 1.05,
      color: 'var(--color-signal-strong)'
    }
  }, day)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "calendar-days",
    style: {
      width: 12,
      height: 12,
      color: 'var(--color-signal-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'var(--color-signal-strong)'
    }
  }, "Upcoming event")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1.05rem',
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, meta)), /*#__PURE__*/React.createElement(window.Ico, {
    n: "arrow-right",
    style: {
      width: 18,
      height: 18,
      color: 'var(--color-signal)'
    }
  }));
}

// The quiet line between posts: someone earned something. Never a card.
function ActivityLine({
  who,
  zaps,
  text
}) {
  return /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      padding: '2px 1.1rem',
      fontSize: '0.88rem',
      color: 'var(--color-text-muted)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, who), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontWeight: 700,
      color: 'var(--color-primary-strong)',
      margin: '0 6px'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "zap",
    style: {
      width: 12,
      height: 12
    }
  }), zaps), text);
}
window.FeedComposer = Composer;
window.FeedPostCard = PostCard;
window.FeedEventTeaser = EventTeaser;
window.FeedActivityLine = ActivityLine;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/feed.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/icon.jsx
try { (() => {
// Ico — React-owned lucide icons for the marketing pages.
// lucide.createIcons() REPLACES an <i data-lucide> node with a fresh <svg>. When
// React created that <i>, the next re-render tries to remove a node that is gone
// and the page unmounts. So we read lucide's icon DATA and render our own SVG.
function Ico({
  n,
  style,
  className
}) {
  const inner = React.useMemo(() => {
    const L = window.lucide;
    if (!L || !L.icons || !n) return '';
    const key = String(n).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const parts = node => {
      if (!node) return [];
      if (Array.isArray(node)) return typeof node[0] === 'string' ? Array.isArray(node[2]) ? node[2] : [] : node;
      return Array.isArray(node.children) ? node.children : [];
    };
    const ser = p => {
      if (!p) return '';
      const tag = Array.isArray(p) ? p[0] : p.tag;
      if (typeof tag !== 'string') return '';
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {};
      const kids = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : p.children || [];
      const a = Object.keys(attrs).filter(k => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object').map(k => k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"').join(' ');
      const open = '<' + tag + (a ? ' ' + a : '');
      return kids.length ? open + '>' + kids.map(ser).join('') + '</' + tag + '>' : open + '/>';
    };
    return parts(L.icons[key]).map(ser).join('');
  }, [n]);
  const w = style && style.width || 18;
  const h = style && style.height || w;
  return /*#__PURE__*/React.createElement("svg", {
    className: className,
    width: w,
    height: h,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      ...style,
      width: w,
      height: h
    },
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
}
window.Ico = Ico;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/icon.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/nav-rail.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// The left navigation rail — the member's areas, grouped and titled the way the
// product groups them. Group, don't box: a small tracked group label plus
// spacing, no card per section. The active row is the one amber moment.
const NSN = window.DAWNFrequencyDesignSystem_c868e3;
function NavRow({
  icon,
  label,
  active,
  badge,
  collapsed,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    title: collapsed ? label : undefined,
    "aria-label": collapsed ? label : undefined,
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      width: '100%',
      textAlign: 'left',
      justifyContent: collapsed ? 'center' : 'flex-start',
      padding: collapsed ? '0.5rem 0' : '0.42rem 0.7rem',
      borderRadius: 'var(--radius-control)',
      border: 'none',
      cursor: 'pointer',
      background: active ? 'var(--color-primary-bg)' : hover ? 'var(--color-surface)' : 'transparent',
      color: active ? 'var(--color-primary-strong)' : 'var(--color-text-muted)',
      fontFamily: 'inherit',
      fontSize: '0.88rem',
      fontWeight: active ? 800 : 600,
      transition: 'background var(--motion-fast) ease, color var(--motion-fast) ease'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: icon,
    style: {
      width: 17,
      height: 17,
      flexShrink: 0
    }
  }), collapsed ? badge != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 6,
      height: 6,
      borderRadius: 99,
      background: 'var(--color-primary)'
    }
  }) : null : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, label), badge != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-2xs)',
      fontWeight: 700,
      color: active ? 'var(--color-primary-strong)' : 'var(--color-text-muted)'
    }
  }, badge)));
}

// Areas, order, section grouping and labels are lifted from lib/nav-areas.ts
// (NAV_AREAS is the framework-free source of truth: order here IS render order);
// the glyphs are AREA_ICONS in components/layout/nav-icons.ts, by lucide name.
// One deviation, deliberate: production still labels the commerce-umbrella row
// "Marketplace" (ADR-868) while the naming canon reserves that word, so it reads
// "Market" here. Flagged in handoff/CHANGES.md.
// Messages, Notifications and Search live in the header; Friends and the personal
// utilities live in the account menu. They are NOT rail items.
const GROUPS = [{
  items: [{
    id: 'feed',
    icon: 'home',
    label: 'Feed'
  }, {
    id: 'profile',
    icon: 'user',
    label: 'Profile'
  }]
}, {
  h: 'Community',
  items: [{
    id: 'broadcast',
    icon: 'megaphone',
    label: 'Around You'
  }, {
    id: 'circles',
    icon: 'users',
    label: 'Circles'
  }, {
    id: 'channels',
    icon: 'radio',
    label: 'Channels'
  }, {
    id: 'events',
    icon: 'calendar-days',
    label: 'Events',
    badge: 3
  }, {
    id: 'market',
    icon: 'store',
    label: 'Market'
  }, {
    id: 'housing',
    icon: 'map-pin-house',
    label: 'Housing'
  }, {
    id: 'messageBoards',
    icon: 'message-square',
    label: 'Message Boards',
    badge: 2
  }, {
    id: 'people',
    icon: 'book-user',
    label: 'Members'
  }, {
    id: 'connections',
    icon: 'contact-round',
    label: 'My Contacts'
  }, {
    id: 'my-spaces',
    icon: 'building-2',
    label: 'Business Spaces'
  }]
}, {
  h: 'The Quest',
  items: [{
    id: 'quest',
    icon: 'compass',
    label: 'My Quest'
  }, {
    id: 'journeys',
    icon: 'route',
    label: 'Journeys'
  }, {
    id: 'practices',
    icon: 'sparkles',
    label: 'Practices'
  }, {
    id: 'library',
    icon: 'library',
    label: 'Library'
  }, {
    id: 'journal',
    icon: 'notebook-pen',
    label: 'Journal'
  }, {
    id: 'vault',
    icon: 'gem',
    label: 'The Vault'
  }]
},
// The operator world telescopes: a member never sees it. Shown here because the
// reference capture is a janitor's rail.
{
  h: 'Admin',
  items: [{
    id: 'admin-home',
    icon: 'layout-dashboard',
    label: 'Dashboard'
  }, {
    id: 'lead',
    icon: 'flag',
    label: 'Leadership'
  }, {
    id: 'admin-programs',
    icon: 'gamepad-2',
    label: 'Programs'
  }, {
    id: 'admin-growth',
    icon: 'trending-up',
    label: 'Growth'
  }, {
    id: 'admin-crm',
    icon: 'contact',
    label: 'Resonance CRM'
  }, {
    id: 'admin-vera-ai',
    icon: 'bot',
    label: 'Vera AI'
  }, {
    id: 'admin-qr',
    icon: 'qr-code',
    label: 'QR Studio'
  }, {
    id: 'admin-spaces',
    icon: 'layout-grid',
    label: 'Manage Spaces'
  }]
}];
function NavRail({
  active,
  onNav,
  collapsed = false,
  onToggle,
  overlay = false
}) {
  return /*#__PURE__*/React.createElement("aside", {
    className: overlay ? '' : 'app-nav',
    style: {
      width: '100%',
      flexShrink: 0,
      position: overlay ? 'static' : 'sticky',
      top: 0,
      maxHeight: overlay ? 'none' : 'calc(100vh - 62px)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      padding: overlay ? '1rem 0.6rem 1.5rem' : collapsed ? '1.5rem 0.35rem 1rem' : '1.5rem 0 1rem'
    }
  }, onToggle && overlay ? /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    title: "Close the menu",
    "aria-label": "Close the menu",
    style: {
      alignSelf: 'flex-end',
      marginBottom: 10,
      width: 26,
      height: 26,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)',
      borderRadius: 'var(--radius-control)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "x",
    style: {
      width: 15,
      height: 15
    }
  })) : null, /*#__PURE__*/React.createElement("div", {
    className: "rail-scroll",
    style: {
      flex: '1 1 auto',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: collapsed ? 10 : 16
    }
  }, GROUPS.map((g, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, g.h && (!collapsed || overlay) ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: '0 0 6px 0.7rem',
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-muted)'
    }
  }, g.h) : null, g.h && collapsed && !overlay && i > 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--color-border)',
      margin: '0 0.35rem 8px'
    }
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: collapsed ? 3 : 1
    }
  }, g.items.map(it => /*#__PURE__*/React.createElement(NavRow, _extends({
    key: it.id
  }, it, {
    collapsed: collapsed && !overlay,
    active: active === it.id,
    onClick: () => onNav(it.id)
  }))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(window.AccountDock, {
    collapsed: collapsed && !overlay
  })), onToggle && !overlay ? /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 auto',
      display: 'flex',
      justifyContent: collapsed ? 'center' : 'flex-end',
      paddingTop: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    title: collapsed ? 'Expand the menu' : 'Collapse the menu',
    "aria-label": collapsed ? 'Expand the menu' : 'Collapse the menu',
    onMouseEnter: e => {
      e.currentTarget.style.color = 'var(--color-text-muted)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.color = 'var(--color-text-subtle)';
    },
    style: {
      width: 26,
      height: 26,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)',
      borderRadius: 'var(--radius-control)',
      transition: 'color var(--motion-fast) ease'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: collapsed ? 'panel-left-open' : 'panel-left-close',
    style: {
      width: 14,
      height: 14
    }
  }))) : null);
}
window.NavRail = NavRail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/nav-rail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/right-rail.jsx
try { (() => {
// The right rail — the member's own status, not analytics. Two utility rows, an
// invite card, the Season standing card (the ONLY place the four game counts
// appear together), a Days/Weeks/Months activity read, upcoming events, and the
// Frequency Signature. Modules group with a title and spacing; the two tinted
// cards are deliberate objects.
const NSR = window.DAWNFrequencyDesignSystem_c868e3;
// Stand-ins used only until the compiled bundle carries Counter/StreakMeter.
const RailCounterRow = NSR.CounterRow || (({
  items = []
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    gap: 14
  }
}, items.map((it, i) => /*#__PURE__*/React.createElement("span", {
  key: i,
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500
  }
}, it.value), /*#__PURE__*/React.createElement("span", {
  style: {
    fontSize: 'var(--text-2xs)',
    color: 'var(--color-text-muted)'
  }
}, it.caption)))));
const RailStreak = NSR.StreakMeter || (({
  days,
  hint
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 'var(--text-meta)',
    color: 'var(--color-text-muted)'
  }
}, /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    color: 'var(--color-text)'
  }
}, days), hint));
function Module({
  title,
  action,
  children
}) {
  return /*#__PURE__*/React.createElement("section", null, title && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 9
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '1rem',
      fontWeight: 'var(--weight-heading)',
      color: 'var(--color-text)',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, title), action && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      color: 'var(--color-primary-strong)',
      cursor: 'pointer'
    }
  }, action)), children);
}
function UtilityRow({
  icon,
  label
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      width: '100%',
      padding: '0.6rem 0.8rem',
      cursor: 'pointer',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      fontFamily: 'inherit',
      background: hover ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
      color: 'var(--color-text)',
      fontSize: '0.88rem',
      fontWeight: 700,
      transition: 'background var(--motion-fast) ease'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: icon,
    style: {
      width: 16,
      height: 16,
      color: 'var(--color-text-muted)'
    }
  }), label);
}
function SeasonStanding() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-primary-bg)',
      borderRadius: 'var(--radius-card)',
      padding: '0.95rem 1rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "trophy",
    style: {
      width: 16,
      height: 16,
      color: 'var(--color-primary-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      flex: 1,
      color: 'var(--color-primary-strong)'
    }
  }, "Season standing"), /*#__PURE__*/React.createElement(NSR.RankBadge, {
    rank: "initiate"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '0.85rem',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, "Climbing to Adept"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-text-muted)'
    }
  }, "1 Journey to go")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 7,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '58%',
      height: '100%',
      background: 'var(--color-primary)',
      borderRadius: 'var(--radius-pill)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      paddingTop: 12,
      borderTop: '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)'
    }
  }, /*#__PURE__*/React.createElement(RailCounterRow, {
    size: "md",
    items: [{
      kind: 'zaps',
      value: '2,095',
      caption: 'Zaps'
    }, {
      kind: 'gems',
      value: '169',
      caption: 'Gems'
    }, {
      kind: 'streak',
      value: '50',
      caption: 'Streak'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(RailStreak, {
    days: 50,
    freezes: 2,
    showWeek: false,
    hint: "Day 50. Never miss twice."
  })));
}
function Activity() {
  const [tab, setTab] = React.useState('Days');
  const bars = {
    Days: [3, 6, 2, 8, 5, 9, 4, 7, 6, 2, 8, 5, 3, 7],
    Weeks: [12, 18, 9, 22, 16, 20, 14],
    Months: [40, 52, 38, 61, 47]
  }[tab];
  const max = Math.max(...bars);
  return /*#__PURE__*/React.createElement(Module, {
    title: "Your activity"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 2,
      marginBottom: 12
    }
  }, ['Days', 'Weeks', 'Months'].map(t => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => setTab(t),
    style: {
      padding: '0.3rem 0.7rem',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: 'var(--text-meta)',
      fontWeight: tab === t ? 800 : 600,
      borderRadius: 'var(--radius-control)',
      background: tab === t ? 'var(--color-surface-elevated)' : 'transparent',
      color: tab === t ? 'var(--color-text)' : 'var(--color-text-subtle)'
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 4,
      height: 62
    }
  }, bars.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: `${v / max * 100}%`,
      borderRadius: 'var(--radius-sm)',
      background: i === bars.length - 1 ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 38%, var(--color-surface-elevated))'
    }
  }))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)'
    }
  }, "Practices logged. 50 days without a gap."));
}
function EventRow({
  mon,
  day,
  name,
  where,
  when
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '8px 0',
      borderBottom: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      flexShrink: 0,
      textAlign: 'center',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--color-signal-bg)',
      padding: '4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-3xs)',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--color-signal-strong)'
    }
  }, mon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1rem',
      fontWeight: 700,
      lineHeight: 1.1,
      color: 'var(--color-signal-strong)'
    }
  }, day)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.86rem',
      fontWeight: 700,
      color: 'var(--color-text)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, where)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)',
      flexShrink: 0
    }
  }, when));
}
function Signature() {
  // Four Pillars, plotted as a diamond. A derived identity visual, not a chart.
  const P = [{
    k: 'Mind',
    v: 0.9
  }, {
    k: 'Body',
    v: 0.62
  }, {
    k: 'Spirit',
    v: 0.78
  }, {
    k: 'Expression',
    v: 0.45
  }];
  const c = 64,
    r = 52;
  const pt = (i, f) => {
    const a = (-90 + i * 90) * Math.PI / 180;
    return [c + r * f * Math.cos(a), c + r * f * Math.sin(a)];
  };
  const poly = P.map((p, i) => pt(i, p.v).join(',')).join(' ');
  const ring = P.map((_, i) => pt(i, 1).join(',')).join(' ');
  return /*#__PURE__*/React.createElement(Module, {
    title: "Frequency Signature"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 128 128",
    width: "112",
    height: "112",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: ring,
    fill: "none",
    stroke: "var(--color-border-strong)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: P.map((_, i) => pt(i, 0.5).join(',')).join(' '),
    fill: "none",
    stroke: "var(--color-border)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: poly,
    fill: "color-mix(in srgb, var(--color-signal) 30%, transparent)",
    stroke: "var(--color-signal)",
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, P.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 'var(--text-meta)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 66,
      color: 'var(--color-text-muted)'
    }
  }, p.k), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 5,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface-elevated)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: `${p.v * 100}%`,
      height: '100%',
      background: 'var(--color-signal)'
    }
  })))))), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)',
      lineHeight: 1.5
    }
  }, "Heaviest on Mind. Expression is the thin one, and the Expression Challenge is how it fills in."));
}
function RightRail({
  onCollapse
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: '100%',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 26,
      padding: '1.25rem 1.25rem 2.5rem 0'
    }
  }, /*#__PURE__*/React.createElement(UtilityRow, {
    icon: "bug",
    label: "Report a bug"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '0.8rem 0.9rem',
      marginTop: -14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "gift",
    style: {
      width: 17,
      height: 17
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '0.95rem',
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, "Invite a friend"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)'
    }
  }, "Earn Zaps when they join"))), /*#__PURE__*/React.createElement(Module, {
    title: "Your Quest"
  }, /*#__PURE__*/React.createElement(SeasonStanding, null)), /*#__PURE__*/React.createElement(Activity, null), /*#__PURE__*/React.createElement(Module, {
    title: "Upcoming events",
    action: "See all"
  }, /*#__PURE__*/React.createElement(EventRow, {
    mon: "Aug",
    day: "6",
    name: "Breathe Connect Expand",
    where: "Encinitas Viewpoint Park",
    when: "6:30p"
  }), /*#__PURE__*/React.createElement(EventRow, {
    mon: "Aug",
    day: "8",
    name: "Sunrise cold plunge",
    where: "The Lab",
    when: "6:30a"
  }), /*#__PURE__*/React.createElement(EventRow, {
    mon: "Aug",
    day: "9",
    name: "Neighborhood supper",
    where: "Leucadia",
    when: "6:00p"
  })), /*#__PURE__*/React.createElement(Signature, null), onCollapse ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: 'auto',
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onCollapse,
    title: "Hide the rail",
    "aria-label": "Hide the rail",
    onMouseEnter: e => {
      e.currentTarget.style.color = 'var(--color-text-muted)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.color = 'var(--color-text-subtle)';
    },
    style: {
      width: 26,
      height: 26,
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
      border: 'none',
      background: 'transparent',
      borderRadius: 'var(--radius-control)',
      color: 'var(--color-text-subtle)',
      transition: 'color var(--motion-fast) ease'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "panel-right-close",
    style: {
      width: 14,
      height: 14
    }
  }))) : null);
}
window.RightRail = RightRail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/right-rail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/topbar.jsx
try { (() => {
// The global top bar — the product's outermost chrome. Engraved wordmark, the
// six public nav areas (three with mega-menu chevrons), a search pill with its
// keyboard hint, then Mindless, friends, notifications, and the SYSTEM menu.
// Law of place: the top right is the system — which world, who am I, and the
// settings that outlive a page. Personal and community management live in the
// account dock at the foot of the rail; score lives in the Vault dock.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
const NST = window.DAWNFrequencyDesignSystem_c868e3;
// Stand-in used only until the compiled bundle carries Counter.
const BarCounter = NST.Counter || (({
  value
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '0.2rem 0.5rem',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--color-primary-bg)',
    color: 'var(--color-primary-strong)'
  }
}, /*#__PURE__*/React.createElement(window.Ico, {
  n: "flame",
  style: {
    width: 13,
    height: 13
  }
}), /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    fontSize: '0.9rem',
    color: 'var(--color-text)'
  }
}, value)));
function NavItem({
  label,
  menu,
  active
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '0.4rem 0.6rem',
      border: 'none',
      cursor: 'pointer',
      background: 'transparent',
      borderRadius: 'var(--radius-control)',
      fontFamily: 'inherit',
      fontSize: '0.92rem',
      fontWeight: active ? 800 : 600,
      color: active || hover ? 'var(--color-primary-strong)' : 'var(--color-text-muted)',
      transition: 'color var(--motion-fast) ease'
    }
  }, label, menu && /*#__PURE__*/React.createElement(window.Ico, {
    n: "chevron-down",
    style: {
      width: 14,
      height: 14,
      opacity: 0.7
    }
  }));
}
function IconSlot({
  icon,
  badge,
  label
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    "aria-label": label,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      width: 34,
      height: 34,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      cursor: 'pointer',
      borderRadius: 'var(--radius-control)',
      background: hover ? 'var(--color-surface-elevated)' : 'transparent',
      color: 'var(--color-text-muted)',
      transition: 'background var(--motion-fast) ease'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: icon,
    style: {
      width: 18,
      height: 18
    }
  }), badge && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 5,
      right: 5,
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--color-primary)',
      border: '1.5px solid var(--color-surface)'
    }
  }));
}
function TopBar({
  onToggleNav
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "app-topbar",
    style: {
      height: 62,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      padding: '0 1.1rem',
      background: 'var(--color-chrome)',
      borderBottom: '1px solid var(--color-chrome-border)',
      minWidth: 0,
      overflow: 'hidden'
    }
  }, onToggleNav ? /*#__PURE__*/React.createElement("button", {
    onClick: onToggleNav,
    "aria-label": "Toggle the menu",
    title: "Toggle the menu",
    style: {
      width: 30,
      height: 30,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      cursor: 'pointer',
      borderRadius: 'var(--radius-control)',
      background: 'transparent',
      color: 'var(--color-text-muted)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "panel-left",
    style: {
      width: 17,
      height: 17
    }
  })) : null, /*#__PURE__*/React.createElement("a", {
    className: "brandmark-link",
    href: "#",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "brandmark",
    style: {
      '--brand-logo': `url("${LOGO}")`,
      width: 156,
      height: 32
    }
  })), /*#__PURE__*/React.createElement("nav", {
    className: "tb-nav",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      minWidth: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(NavItem, {
    label: "Home",
    active: true
  }), /*#__PURE__*/React.createElement(NavItem, {
    label: "Community",
    menu: true
  }), /*#__PURE__*/React.createElement(NavItem, {
    label: "The Quest",
    menu: true
  }), /*#__PURE__*/React.createElement(NavItem, {
    label: "The Lab"
  }), /*#__PURE__*/React.createElement(NavItem, {
    label: "Spaces",
    menu: true
  }), /*#__PURE__*/React.createElement(NavItem, {
    label: "About",
    menu: true
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 8
    }
  }), /*#__PURE__*/React.createElement("label", {
    className: "tb-search",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width: 208,
      minWidth: 96,
      flexShrink: 1,
      padding: '0.42rem 0.7rem',
      border: '1px solid var(--color-chrome-border)',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-surface)',
      color: 'var(--color-text-subtle)',
      cursor: 'text'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "search",
    style: {
      width: 15,
      height: 15
    }
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search",
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'inherit',
      fontSize: '0.88rem',
      color: 'var(--color-text)'
    }
  }), /*#__PURE__*/React.createElement("kbd", {
    className: "tb-kbd",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-3xs)',
      padding: '1px 5px',
      borderRadius: 4,
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-chrome-border)'
    }
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    className: "tb-mindless",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      flexShrink: 0,
      padding: '0.4rem 0.7rem',
      border: 'none',
      cursor: 'pointer',
      borderRadius: 'var(--radius-control)',
      background: 'transparent',
      fontFamily: 'inherit',
      fontSize: '0.82rem',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--color-signal-strong)'
    }
  }, /*#__PURE__*/React.createElement(window.Ico, {
    n: "leaf",
    style: {
      width: 17,
      height: 17
    }
  }), " ", /*#__PURE__*/React.createElement("span", {
    className: "tb-mindless-label"
  }, "Mindless")), /*#__PURE__*/React.createElement("div", {
    className: "tb-icons",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(IconSlot, {
    icon: "users",
    label: "Friends"
  }), /*#__PURE__*/React.createElement(IconSlot, {
    icon: "bell",
    label: "Notifications",
    badge: true
  })), /*#__PURE__*/React.createElement(window.SystemMenu, null));
}
window.TopBar = TopBar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/beta.jsx
try { (() => {
// The beta induction "Oath" — the cinematic <90s sequence that turns a signup
// into a Founder. A dark, glowing screen; three checkboxes gate the CTA. On
// taking the oath, it confirms with a warm Founder welcome (Vera's "hot" voice).
const NSB = window.DAWNFrequencyDesignSystem_c868e3;
function BetaOath({
  onNav
}) {
  const {
    Checkbox,
    Button
  } = NSB;
  const [oath, setOath] = React.useState([false, false, false]);
  const [done, setDone] = React.useState(false);
  const lines = ['I agree to break things on this website.', 'I agree to submit bug reports.', 'I agree to be a Frequency Web Founder.'];
  const all = oath.every(Boolean);
  const set = i => v => setOath(o => o.map((x, j) => j === i ? v : x));
  return /*#__PURE__*/React.createElement("section", {
    className: "bg-slat mk-band mk-ink",
    style: {
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: '4rem 1.5rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "amber-glow",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => onNav && onNav('home'),
    style: {
      position: 'absolute',
      top: 22,
      left: 24,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--color-on-ink-muted)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: '0.85rem',
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement(window.MkIco, {
    n: "arrow-left",
    style: {
      width: 16,
      height: 16
    }
  }), " Back"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 540,
      width: '100%',
      textAlign: 'center'
    }
  }, !done ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      color: 'var(--color-primary)',
      margin: '0 0 1.25rem'
    }
  }, "The founding cohort"), /*#__PURE__*/React.createElement("h1", {
    className: "font-display",
    style: {
      margin: 0,
      color: 'var(--color-on-ink)',
      fontSize: 'clamp(2.5rem, 6vw, 4rem)',
      lineHeight: 0.96
    }
  }, "This isn't a product yet. ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-primary)'
    }
  }, "It's a promise.")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '1.25rem auto 2.25rem',
      maxWidth: 420,
      color: 'var(--color-on-ink-muted)',
      fontSize: '1.1rem',
      lineHeight: 1.65
    }
  }, "You're early to the thing that replaces the feed. Take the oath and you're in."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-ink-elevated)',
      border: '1px solid var(--color-ink-border)',
      borderRadius: 'var(--radius-2xl)',
      padding: '1.5rem 1.5rem',
      textAlign: 'left',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      boxShadow: 'var(--shadow-pop)'
    }
  }, lines.map((l, i) => /*#__PURE__*/React.createElement(Checkbox, {
    key: i,
    checked: oath[i],
    onChange: set(i),
    label: /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--color-on-ink)'
      }
    }, l)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '1.75rem'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    disabled: !all,
    onClick: () => setDone(true),
    iconRight: /*#__PURE__*/React.createElement(window.MkIco, {
      n: "arrow-right",
      style: {
        width: 18,
        height: 18
      }
    })
  }, "Take the oath"))) : /*#__PURE__*/React.createElement("div", {
    className: "animate-cue-pop"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      margin: '0 auto 1.5rem',
      borderRadius: 'var(--radius-full)',
      background: 'var(--color-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: 'var(--shadow-pop)'
    }
  }, /*#__PURE__*/React.createElement(window.MkIco, {
    n: "check",
    style: {
      width: 32,
      height: 32,
      color: 'var(--color-text-on-primary)'
    }
  })), /*#__PURE__*/React.createElement("h1", {
    className: "font-display",
    style: {
      margin: 0,
      color: 'var(--color-on-ink)',
      fontSize: 'clamp(2.5rem, 6vw, 4rem)',
      lineHeight: 0.96
    }
  }, "Welcome, ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-primary)'
    }
  }, "Founder.")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '1.25rem auto 2rem',
      maxWidth: 420,
      color: 'var(--color-on-ink-muted)',
      fontSize: '1.1rem',
      lineHeight: 1.65
    }
  }, "The feed that ate everyone's attention, we're building the thing that takes it back, and you're early. Let's go."), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    onClick: () => onNav && onNav('home'),
    iconRight: /*#__PURE__*/React.createElement(window.MkIco, {
      n: "arrow-right",
      style: {
        width: 18,
        height: 18
      }
    })
  }, "Enter the community"))));
}
window.BetaOath = BetaOath;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/beta.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/footer.jsx
try { (() => {
// Marketing footer — quiet, warm. Wordmark + tagline, flat nav, contact + org
// line. Sits on the marketing canvas.
const LOGO = new URL('../../assets/frequency-logo.png', document.baseURI).href;
function MarketingFooter() {
  const cols = [{
    h: 'Explore',
    links: ['The Lab', 'The Community', 'The Quest', 'Discover']
  }, {
    h: 'About',
    links: ['Our mission', 'How it works', 'Pricing', 'Help center']
  }, {
    h: 'Join',
    links: ['Join the Beta', 'Start a Circle', 'Become a host', 'hello@frequencylocal.com']
  }];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--color-marketing-canvas)',
      borderTop: '1px solid var(--color-border)',
      padding: '3.5rem 1.75rem 2.5rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-wide)',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
      gap: 36
    },
    className: "mk-foot"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("a", {
    className: "brandmark-link"
  }, /*#__PURE__*/React.createElement("span", {
    className: "brandmark",
    style: {
      '--brand-logo': `url("${LOGO}")`,
      width: 170,
      height: 34
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '1rem 0 0',
      fontSize: '0.9rem',
      color: 'var(--color-text-muted)',
      maxWidth: 260,
      lineHeight: 1.6
    }
  }, "Community Collective. Real-world community, taking root in North County San Diego.")), cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.h
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 0.85rem',
      fontSize: '0.75rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'var(--color-text-subtle)'
    }
  }, c.h), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, c.links.map(l => /*#__PURE__*/React.createElement("li", {
    key: l
  }, /*#__PURE__*/React.createElement("a", {
    style: {
      fontSize: '0.9rem',
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
      textDecoration: 'none'
    }
  }, l))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-wide)',
      margin: '2.5rem auto 0',
      paddingTop: '1.5rem',
      borderTop: '1px solid var(--color-border)',
      display: 'flex',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      fontSize: '0.8rem',
      color: 'var(--color-text-subtle)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Frequency Labs Holdings"), /*#__PURE__*/React.createElement("span", null, "Circulation, not exclusion.")));
}
window.MarketingFooter = MarketingFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/footer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/header.jsx
try { (() => {
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
function MarketingHeader({
  onNav,
  variant
}) {
  const {
    Button
  } = NS;
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
      const first = [...document.querySelectorAll('section')].find(s => !hdr || !s.contains(hdr) && !hdr.contains(s));
      if (!first) return;
      const cls = first.className || '';
      if (/\bmk-ink\b/.test(cls)) return setSensed('dark');
      if (/\bmk-cream\b/.test(cls)) return setSensed('light');
      // No tone class: fall back to how light the thing actually is.
      const bg = getComputedStyle(first).backgroundColor;
      const m = bg && bg.match(/[\d.]+/g);
      if (m && m.length >= 3 && +m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114 < 128) return setSensed('dark');
      // A hero carrying a full-bleed photograph is dark by construction.
      setSensed(first.querySelector(':scope > img') ? 'dark' : 'light');
    };
    read();
    // The page mounts around us, so look again once React has settled — and keep
    // looking until a section exists, since a hero may arrive several frames late in
    // a streaming or lazily-imported mount.
    let n = 0;
    const id = setInterval(() => {
      read();
      if (++n > 12) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [variant]);
  const dark = (variant || sensed) === 'dark';
  const tabs = ['The Lab', 'The Community', 'The Quest', 'About'];
  // Over photography the muted cream was too quiet to read. On dark the nav sits at
  // full cream with a soft shadow, so it stays legible over whatever the picture is
  // doing underneath it.
  const tab = {
    padding: '0.4rem 0.75rem',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.875rem',
    fontWeight: 700,
    cursor: 'pointer',
    color: dark ? 'var(--color-on-ink)' : 'var(--color-text-muted)',
    textShadow: dark ? '0 1px 12px rgb(20 16 10 / 0.55)' : 'none',
    transition: 'color 140ms ease, background 140ms ease',
    whiteSpace: 'nowrap'
  };
  return /*#__PURE__*/React.createElement("header", {
    ref: hdrRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1.1rem 1.75rem'
    }
  }, dark ? /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: 'absolute',
      inset: '0 0 auto',
      height: '9rem',
      pointerEvents: 'none',
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-ink) 55%, transparent), transparent)'
    }
  }) : null, /*#__PURE__*/React.createElement("a", {
    className: "brandmark-link",
    onClick: () => onNav && onNav('home'),
    style: {
      position: 'relative',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "brandmark",
    style: {
      '--brand-logo': `url("${LOGO}")`,
      width: 168,
      height: 34,
      ...(dark ? {
        '--brand-mark': '#FFFFFF',
        filter: 'drop-shadow(0 1px 10px rgb(20 16 10 / 0.45))',
        opacity: 1
      } : {})
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem'
    },
    className: "mk-nav"
  }, tabs.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: tab,
    onMouseEnter: e => {
      e.currentTarget.style.color = dark ? '#FFFFFF' : 'var(--color-text)';
      e.currentTarget.style.background = dark ? 'color-mix(in srgb, var(--color-on-ink) 14%, transparent)' : 'var(--color-surface-elevated)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.color = dark ? 'var(--color-on-ink)' : 'var(--color-text-muted)';
      e.currentTarget.style.background = 'transparent';
    }
  }, t)), /*#__PURE__*/React.createElement("span", {
    style: {
      ...tab,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3
    }
  }, "Discover ", /*#__PURE__*/React.createElement(window.MkIco, {
    n: "chevron-down",
    style: {
      width: 14,
      height: 14
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: '0.6rem'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    iconRight: /*#__PURE__*/React.createElement(window.MkIco, {
      n: "arrow-right",
      style: {
        width: 15,
        height: 15
      }
    }),
    onClick: () => onNav && onNav('beta')
  }, "Join the Beta"))));
}
window.MarketingHeader = MarketingHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/hero.jsx
try { (() => {
// PhotoHero — the one full-bleed splash hero.
//
// The photograph has to survive being a background. Three layers do that, in
// order: a warm ink gradient that is DARK at the edges and lighter across the
// middle third (so the picture is still a picture where no type sits), a vignette
// that pulls the corners down so centred type holds, and grain so the whole thing
// reads as one printed image rather than a photo with a scrim on it.
const NSH = window.DAWNFrequencyDesignSystem_c868e3;
function PhotoHero({
  onNav
}) {
  const {
    Button
  } = NSH;
  return /*#__PURE__*/React.createElement("section", {
    className: "vignette grain mk-hero mk-ink",
    style: {
      position: 'relative',
      minHeight: '94vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/images/hero.jpg",
    alt: "A gathering at golden hour",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,' + ' color-mix(in srgb, var(--color-ink) 92%, transparent) 0%,' + ' color-mix(in srgb, var(--color-ink) 66%, transparent) 24%,' + ' color-mix(in srgb, var(--color-ink) 58%, transparent) 48%,' + ' color-mix(in srgb, var(--color-ink) 82%, transparent) 78%,' + ' var(--color-ink) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      mixBlendMode: 'screen',
      background: 'radial-gradient(ellipse 62% 46% at 50% 62%, color-mix(in srgb, var(--color-primary) 26%, transparent) 0%, transparent 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "amber-glow",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "stagger",
    style: {
      position: 'relative',
      zIndex: 2,
      maxWidth: 900,
      padding: '5rem 1.5rem 4.5rem'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "eyebrow reveal is-revealed",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      margin: '0 0 1.35rem',
      padding: '0.3rem 0.85rem 0.3rem 0.6rem',
      borderRadius: 'var(--radius-pill)',
      color: 'var(--color-primary)',
      background: 'color-mix(in srgb, var(--color-ink) 55%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-primary) 34%, transparent)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "halo",
    style: {
      position: 'relative',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--color-primary)'
    }
  }), "Now in open beta"), /*#__PURE__*/React.createElement("h1", {
    className: "font-display reveal is-revealed",
    style: {
      margin: 0,
      color: 'var(--color-on-ink)',
      fontSize: 'clamp(3rem, 7.4vw, 5.6rem)',
      lineHeight: 0.92,
      letterSpacing: '-0.028em',
      textWrap: 'balance',
      textShadow: '0 2px 30px rgb(20 16 10 / 0.45)'
    }
  }, "Get people together"), /*#__PURE__*/React.createElement("p", {
    className: "reveal is-revealed",
    style: {
      margin: '0.1rem 0 0',
      fontFamily: 'var(--font-editorial)',
      fontStyle: 'italic',
      fontSize: 'clamp(1.7rem, 3.4vw, 2.9rem)',
      lineHeight: 1.08,
      color: 'var(--color-primary)',
      textShadow: '0 2px 24px rgb(20 16 10 / 0.5)'
    }
  }, "do things on purpose"), /*#__PURE__*/React.createElement("p", {
    className: "reveal is-revealed text-shadow-soft",
    style: {
      margin: '1.6rem auto 0',
      maxWidth: 550,
      color: 'var(--color-on-ink)',
      fontSize: '1.15rem',
      lineHeight: 1.65
    }
  }, "A hundred contacts and no real friends is a normal way to live now. Join a Circle near you, show up Thursday, and it stops being normal."), /*#__PURE__*/React.createElement("div", {
    className: "reveal is-revealed",
    style: {
      marginTop: '2.1rem',
      display: 'flex',
      gap: '0.85rem',
      justifyContent: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(window.MkIco, {
      n: "arrow-right",
      style: {
        width: 18,
        height: 18
      }
    }),
    onClick: () => onNav && onNav('beta')
  }, "Join the Beta"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "ghost",
    onClick: () => onNav && onNav('lab'),
    style: {
      color: 'var(--color-on-ink)',
      borderRadius: 'var(--radius-control)',
      background: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
      backdropFilter: 'saturate(1.3) blur(16px)',
      WebkitBackdropFilter: 'saturate(1.3) blur(16px)',
      borderColor: 'color-mix(in srgb, var(--color-on-ink) 26%, transparent)'
    }
  }, "See the space")), /*#__PURE__*/React.createElement("p", {
    className: "reveal is-revealed text-shadow-soft",
    style: {
      marginTop: '1.6rem',
      color: 'var(--color-on-ink-muted)',
      fontSize: '0.85rem',
      fontWeight: 700
    }
  }, "Free during the beta. No card today, leave anytime. Taking root in North County San Diego.")), /*#__PURE__*/React.createElement("div", {
    className: "animate-cue",
    style: {
      position: 'absolute',
      bottom: 26,
      zIndex: 3,
      color: 'var(--color-on-ink-muted)'
    }
  }, /*#__PURE__*/React.createElement(window.MkIco, {
    n: "chevron-down",
    style: {
      width: 24,
      height: 24
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 4
    }
  }));
}
window.PhotoHero = PhotoHero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/icon.jsx
try { (() => {
// MkIco — React-owned lucide icons for the marketing pages.
// lucide.createIcons() REPLACES an <i data-lucide> node with a fresh <svg>. When
// React created that <i>, the next re-render tries to remove a node that is gone
// and the page unmounts. So we read lucide's icon DATA and render our own SVG.
function MkIco({
  n,
  style,
  className
}) {
  const inner = React.useMemo(() => {
    const L = window.lucide;
    if (!L || !L.icons || !n) return '';
    const key = String(n).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const parts = node => {
      if (!node) return [];
      if (Array.isArray(node)) return typeof node[0] === 'string' ? Array.isArray(node[2]) ? node[2] : [] : node;
      return Array.isArray(node.children) ? node.children : [];
    };
    const ser = p => {
      if (!p) return '';
      const tag = Array.isArray(p) ? p[0] : p.tag;
      if (typeof tag !== 'string') return '';
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {};
      const kids = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : p.children || [];
      const a = Object.keys(attrs).filter(k => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object').map(k => k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"').join(' ');
      const open = '<' + tag + (a ? ' ' + a : '');
      return kids.length ? open + '>' + kids.map(ser).join('') + '</' + tag + '>' : open + '/>';
    };
    return parts(L.icons[key]).map(ser).join('');
  }, [n]);
  const w = style && style.width || 18;
  const h = style && style.height || w;
  return /*#__PURE__*/React.createElement("svg", {
    className: className,
    width: w,
    height: h,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      ...style,
      width: w,
      height: h
    },
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
}
window.MkIco = MkIco;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/icon.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/reveal.js
try { (() => {
// Scroll reveal for `.reveal` (delay comes from `.stagger` on the parent).
//
// The rule is "reveal once it has been reached OR passed" — not "once it is
// visible". An observer that only fires on isIntersecting leaves anything the
// viewport skipped (fast wheel, PageDown, End, an anchor jump, a reload with a
// restored scroll position) stuck at opacity 0 forever. So every code path here
// ends in the same one-way latch, and a sweep catches whatever the observer
// missed.
(() => {
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = el => el.classList.add('is-revealed');

  // Anything at or above the fold line counts as reached. Generous on purpose:
  // arriving late is worse than arriving early.
  const reached = el => el.getBoundingClientRect().top < window.innerHeight * 0.92;
  let io = null;
  const observe = el => {
    if (!io) return;
    io.observe(el);
  };
  const sweep = () => {
    const els = document.querySelectorAll('.reveal:not(.is-revealed)');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || reduce()) {
      els.forEach(show);
      return;
    }
    if (!io) {
      io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          // isIntersecting OR already scrolled past the top edge.
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            show(e.target);
            io.unobserve(e.target);
          }
        });
      }, {
        rootMargin: '0px 0px -8% 0px',
        threshold: 0
      });
    }
    els.forEach(el => reached(el) ? show(el) : observe(el));
  };
  const kick = () => {
    sweep();
    requestAnimationFrame(sweep);
  };
  document.addEventListener('DOMContentLoaded', kick);
  addEventListener('load', kick);
  addEventListener('scroll', sweep, {
    passive: true
  });
  addEventListener('resize', sweep);
  // React mounts after this file runs, so watch for the tree arriving too.
  new MutationObserver(kick).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  kick();
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/reveal.js", error: String((e && e.message) || e) }); }

// ui_kits/marketing/sections.jsx
try { (() => {
// The marketing content sections, composed from DAWN primitives + the editorial
// layout patterns (Section rhythm, ZigZag, the dark "beat", stat strip, FAQ).
const NSS = window.DAWNFrequencyDesignSystem_c868e3;

// The editorial header: Anton line, then the Playfair italic that the brand owns.
// One per section, and the italic line is the one that carries the feeling.
function EdHead({
  eyebrow,
  title,
  script,
  blurb,
  align = 'center',
  tone = 'light'
}) {
  const ink = tone === 'ink';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: align,
      maxWidth: align === 'center' ? 'var(--width-hero)' : 'none',
      margin: align === 'center' ? '0 auto' : 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: 0,
      color: ink ? 'var(--color-primary)' : 'var(--color-primary-strong)'
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h2", {
    className: "font-display",
    style: {
      margin: '0.7rem 0 0',
      fontSize: 'var(--text-display-h2)',
      color: ink ? 'var(--color-on-ink)' : 'var(--color-text)'
    }
  }, title), script ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.1rem 0 0',
      fontFamily: 'var(--font-editorial)',
      fontStyle: 'italic',
      fontSize: 'clamp(1.5rem, 3vw, 2.3rem)',
      lineHeight: 1.15,
      color: 'var(--color-primary)'
    }
  }, script) : null, blurb ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '1.1rem auto 0',
      maxWidth: 'var(--width-read)',
      fontSize: '1.15rem',
      lineHeight: 1.65,
      color: ink ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)'
    }
  }, blurb) : null);
}
window.MkEdHead = EdHead;

// A full-bleed section with the shared vertical rhythm + tone background.
function Section({
  tone = 'surface',
  width = 'var(--width-read)',
  children,
  style
}) {
  const bg = tone === 'canvas' ? 'var(--color-marketing-canvas)' : tone === 'ink' ? '' : 'var(--color-surface)';
  return /*#__PURE__*/React.createElement("section", {
    className: (tone === 'ink' ? 'bg-slat mk-ink' : 'mk-cream') + ' mk-beat',
    style: {
      background: bg,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: width,
      margin: '0 auto'
    }
  }, children));
}
window.MkSection = Section;

// The three brand pillars, the "orient" grid right under the hero.
function PillarGrid() {
  const {
    SectionHeading,
    Card
  } = NSS;
  const pillars = [{
    icon: 'flame',
    n: '1',
    t: 'The Lab',
    d: 'The body of community: heat then cold, steam, cedar, low amber light. A third place with a sauna, cold plunge, and rooms to gather.'
  }, {
    icon: 'users',
    n: '2',
    t: 'The Community',
    d: 'Find your people by what you love. Join a Circle, a small standing local group, and be missed when you are gone.'
  }, {
    icon: 'compass',
    n: '3',
    t: 'The Quest',
    d: 'A light, honest game that rewards showing up in person, inviting strangers, and backing local life. Not screen time.'
  }];
  const shots = ['../../assets/images/lab-thermal.jpg', '../../assets/images/community-1.jpg', '../../assets/images/gathering-1.jpg'];
  return /*#__PURE__*/React.createElement(Section, {
    tone: "surface",
    width: "var(--width-wide)"
  }, /*#__PURE__*/React.createElement(EdHead, {
    eyebrow: "Place \xB7 People \xB7 Path",
    title: "One community",
    script: "two engines",
    blurb: "A worldwide framework anybody can start from, and brick-and-mortar rooms where it lands."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 26,
      marginTop: 'var(--space-10)'
    }
  }, pillars.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.t
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: shots[i],
    alt: "",
    style: {
      width: '100%',
      height: 200,
      objectFit: 'cover',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      left: 12,
      width: 30,
      height: 30,
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.85rem',
      fontWeight: 600
    }
  }, p.n)), /*#__PURE__*/React.createElement("h3", {
    className: "font-display",
    style: {
      margin: '1.1rem 0 0',
      fontSize: '1.7rem',
      color: 'var(--color-text)'
    }
  }, p.t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.55rem 0 0',
      fontSize: '1rem',
      lineHeight: 1.65,
      color: 'var(--color-text-muted)'
    }
  }, p.d)))));
}
window.PillarGrid = PillarGrid;

// Alternating image / text editorial row.
function ZigZag({
  img,
  alt,
  eyebrow,
  title,
  body,
  reverse,
  tone = 'surface',
  cta
}) {
  const {
    SectionHeading
  } = NSS;
  const isInk = tone === 'ink';
  return /*#__PURE__*/React.createElement(Section, {
    tone: tone,
    width: "var(--width-wide)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 56,
      alignItems: 'center'
    },
    className: "mk-zig"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      order: reverse ? 2 : 1,
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden',
      border: isInk ? '1px solid var(--color-ink-border)' : '1px solid var(--color-border)',
      boxShadow: isInk ? 'var(--shadow-pop)' : 'var(--shadow-md)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: img,
    alt: alt,
    style: {
      display: 'block',
      width: '100%',
      aspectRatio: '4/3',
      objectFit: 'cover'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      order: reverse ? 1 : 2
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    tone: isInk ? 'ink' : 'light',
    eyebrow: eyebrow,
    title: title
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '1.05rem',
      lineHeight: 1.7,
      color: isInk ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)'
    }
  }, body), cta && /*#__PURE__*/React.createElement("a", {
    style: {
      marginTop: '1.25rem',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: '0.85rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: isInk ? 'var(--color-primary)' : 'var(--color-primary-strong)',
      cursor: 'pointer'
    }
  }, cta, " ", /*#__PURE__*/React.createElement(window.MkIco, {
    n: "arrow-right",
    style: {
      width: 16,
      height: 16
    }
  })))));
}
window.ZigZag = ZigZag;

// The cinematic dark interstitial — a typographic statement on the ink band,
// seamed top + bottom with the light-strip.
function Statement({
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "light-strip"
  }), /*#__PURE__*/React.createElement("section", {
    className: "bg-slat mk-band mk-ink",
    style: {
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "amber-glow",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "font-display",
    style: {
      position: 'relative',
      maxWidth: 'var(--width-hero)',
      margin: '0 auto',
      textAlign: 'center',
      color: 'var(--color-on-ink)',
      fontSize: 'clamp(2.25rem, 5vw, 3.75rem)',
      lineHeight: 1.1
    }
  }, children)), /*#__PURE__*/React.createElement("div", {
    className: "light-strip"
  }));
}
window.MkStatement = Statement;

// Proof — a three-up stat strip (gated behind the social-proof floor in prod).
function StatStrip() {
  const {
    Stat,
    SectionHeading
  } = NSS;
  return /*#__PURE__*/React.createElement(Section, {
    tone: "surface",
    width: "var(--width-wide)"
  }, /*#__PURE__*/React.createElement(EdHead, {
    eyebrow: "Proof, not adjectives",
    title: "We count",
    script: "who showed up"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 24,
      textAlign: 'center',
      maxWidth: 680,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    value: "212",
    label: "Circles met last week"
  }), /*#__PURE__*/React.createElement(Stat, {
    value: "64%",
    label: "came back the next week"
  }), /*#__PURE__*/React.createElement(Stat, {
    value: "0",
    label: "minutes of screen time measured"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '1.75rem auto 0',
      maxWidth: 'var(--width-read)',
      textAlign: 'center',
      fontSize: '0.95rem',
      color: 'var(--color-text-muted)'
    }
  }, "Every number here is a count of something that happened in a room. We do not measure time on site, and we never will."));
}
window.StatStrip = StatStrip;

// FAQ — native <details> disclosures at the shared rhythm.
function FaqList({
  items = DEFAULT_FAQ,
  tone = 'canvas'
}) {
  return /*#__PURE__*/React.createElement(Section, {
    tone: tone
  }, /*#__PURE__*/React.createElement(EdHead, {
    eyebrow: "Plainly",
    title: "Questions",
    script: "answered plainly"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, items.map(f => /*#__PURE__*/React.createElement("details", {
    key: f.q,
    style: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-sm)',
      padding: '1rem 1.25rem'
    }
  }, /*#__PURE__*/React.createElement("summary", {
    style: {
      cursor: 'pointer',
      listStyle: 'none',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      fontSize: '1.05rem',
      fontWeight: 700,
      color: 'var(--color-text)'
    }
  }, f.q, /*#__PURE__*/React.createElement(window.MkIco, {
    n: "chevron-down",
    style: {
      width: 18,
      height: 18,
      color: 'var(--color-text-subtle)',
      flexShrink: 0
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.75rem 0 0',
      fontSize: '0.95rem',
      lineHeight: 1.65,
      color: 'var(--color-text-muted)'
    }
  }, f.a)))));
}
window.FaqList = FaqList;
const DEFAULT_FAQ = [{
  q: 'Is it really free?',
  a: 'Free during the beta, no card today, and you can leave anytime. Founding pricing is locked for the life of the subscription.'
}, {
  q: 'Where is Frequency?',
  a: 'The first Lab is taking root in North County San Diego. A Circle can start anywhere on Earth, and plenty already have.'
}, {
  q: 'What is a Circle?',
  a: 'A small standing local group around one interest that meets weekly. It is the atomic unit of the whole thing.'
}, {
  q: 'Is this a meditation app?',
  a: 'Yes, partly. We made it a game so you would actually do it, and the game only pays out for things you do with other people in real life.'
}];

// The closing CTA — dark beat with the amber glow + seam.
function BetaCTA({
  onNav
}) {
  const {
    Button
  } = NSS;
  return /*#__PURE__*/React.createElement("section", {
    className: "bg-slat mk-band mk-ink",
    style: {
      position: 'relative',
      textAlign: 'center',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "light-strip",
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "amber-glow",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 'var(--width-narrow)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-display",
    style: {
      margin: 0,
      color: 'var(--color-on-ink)',
      fontSize: 'clamp(2.25rem, 5vw, 3.5rem)'
    }
  }, "You're not a user here. ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-primary)'
    }
  }, "You're a founder.")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '1.25rem auto 2rem',
      maxWidth: 460,
      color: 'var(--color-on-ink-muted)',
      fontSize: '1.15rem',
      lineHeight: 1.6
    }
  }, "The feed that ate everyone's attention, we're building the thing that takes it back. Come build it."), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(window.MkIco, {
      n: "arrow-right",
      style: {
        width: 18,
        height: 18
      }
    }),
    onClick: () => onNav && onNav('beta')
  }, "Join the Beta")));
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
function PageHero({
  image,
  alt = '',
  eyebrow,
  title,
  script,
  lead,
  primary,
  secondary,
  facts,
  align = 'center',
  aside,
  onNav,
  height = '86vh'
}) {
  const {
    Button
  } = NSS;
  const centered = align === 'center';
  // A fact dock overhangs the hero, so the hero tells the next section to clear it.
  return /*#__PURE__*/React.createElement("section", {
    className: 'vignette grain mk-hero mk-ink' + (facts ? ' mk-hero-dock' : ''),
    style: {
      position: 'relative',
      minHeight: height,
      display: 'grid',
      placeItems: centered ? 'center' : 'center start',
      overflow: 'hidden',
      padding: '6rem 1.5rem ' + (facts ? '9.5rem' : '5rem')
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: alt,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,' + ' color-mix(in srgb, var(--color-ink) 90%, transparent) 0%,' + ' color-mix(in srgb, var(--color-ink) 64%, transparent) 26%,' + ' color-mix(in srgb, var(--color-ink) 56%, transparent) 48%,' + ' color-mix(in srgb, var(--color-ink) 84%, transparent) 80%,' + ' var(--color-ink) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      mixBlendMode: 'screen',
      background: 'radial-gradient(ellipse 60% 44% at 50% 60%, color-mix(in srgb, var(--color-primary) 22%, transparent) 0%, transparent 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "amber-glow",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 3,
      width: '100%',
      maxWidth: aside ? 'var(--width-wide)' : 'var(--width-hero)',
      margin: '0 auto',
      display: aside ? 'grid' : 'block',
      gridTemplateColumns: aside ? 'minmax(0, 1.15fr) 20rem' : undefined,
      gap: 40,
      alignItems: 'center',
      textAlign: centered ? 'center' : 'left'
    },
    className: "mk-hero-grid"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      margin: '0 0 1.3rem',
      padding: '0.3rem 0.85rem 0.3rem 0.6rem',
      borderRadius: 'var(--radius-pill)',
      color: 'var(--color-primary)',
      background: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-primary) 32%, transparent)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "halo",
    style: {
      position: 'relative',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--color-primary)'
    }
  }), eyebrow) : null, /*#__PURE__*/React.createElement("h1", {
    className: "font-display",
    style: {
      margin: 0,
      color: 'var(--color-on-ink)',
      fontSize: 'clamp(2.9rem, 6.8vw, 5.2rem)',
      lineHeight: 0.92,
      letterSpacing: '-0.028em',
      textWrap: 'balance',
      textShadow: '0 2px 30px rgb(20 16 10 / 0.45)'
    }
  }, title), script ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.1rem 0 0',
      fontFamily: 'var(--font-editorial)',
      fontStyle: 'italic',
      fontSize: 'clamp(1.6rem, 3.3vw, 2.8rem)',
      lineHeight: 1.08,
      color: 'var(--color-primary)',
      textShadow: '0 2px 24px rgb(20 16 10 / 0.5)'
    }
  }, script) : null, lead ? /*#__PURE__*/React.createElement("p", {
    className: "text-shadow-soft",
    style: {
      margin: centered ? '1.5rem auto 0' : '1.5rem 0 0',
      maxWidth: '35rem',
      color: 'var(--color-on-ink)',
      fontSize: '1.15rem',
      lineHeight: 1.65
    }
  }, lead) : null, primary || secondary ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: '2rem',
      flexWrap: 'wrap',
      justifyContent: centered ? 'center' : 'flex-start'
    }
  }, primary ? /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    iconRight: /*#__PURE__*/React.createElement(window.MkIco, {
      n: "arrow-right",
      style: {
        width: 18,
        height: 18
      }
    }),
    onClick: () => onNav && onNav('beta')
  }, primary) : null, secondary ? /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    variant: "ghost",
    style: {
      color: 'var(--color-on-ink)',
      borderRadius: 'var(--radius-control)',
      background: 'color-mix(in srgb, var(--color-ink) 52%, transparent)',
      backdropFilter: 'saturate(1.3) blur(16px)',
      WebkitBackdropFilter: 'saturate(1.3) blur(16px)',
      borderColor: 'color-mix(in srgb, var(--color-on-ink) 26%, transparent)'
    }
  }, secondary) : null) : null), aside), facts ? /*#__PURE__*/React.createElement("div", {
    className: "glass-ink lift-3",
    style: {
      position: 'absolute',
      zIndex: 4,
      bottom: -32,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 34,
      padding: '1.1rem 2rem',
      borderRadius: 'var(--radius-2xl)',
      whiteSpace: 'nowrap'
    }
  }, facts.map(([v, l]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-display",
    style: {
      fontSize: '1.9rem',
      lineHeight: 1,
      color: 'var(--color-primary)'
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    className: "eyebrow",
    style: {
      marginTop: 5,
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-on-ink-muted)'
    }
  }, l)))) : null, /*#__PURE__*/React.createElement("div", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5
    }
  }));
}
window.PageHero = PageHero;

// ── PhotoBeat ───────────────────────────────────────────────────────────────
// A full-bleed photograph carrying one sentence. The rhythm alternative to the
// slat band: same job, but the picture is the argument.
function PhotoBeat({
  image,
  alt = '',
  eyebrow,
  line,
  script,
  note,
  height = '58vh'
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "vignette mk-band mk-ink",
    style: {
      position: 'relative',
      minHeight: height,
      display: 'grid',
      placeItems: 'center',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: alt,
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(180deg,' + ' color-mix(in srgb, var(--color-ink) 82%, transparent),' + ' color-mix(in srgb, var(--color-ink) 58%, transparent) 45%,' + ' color-mix(in srgb, var(--color-ink) 86%, transparent))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 3,
      maxWidth: 'var(--width-hero)',
      textAlign: 'center'
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("p", {
    className: "eyebrow",
    style: {
      margin: 0,
      color: 'var(--color-primary)'
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("p", {
    className: "font-display",
    style: {
      margin: '1rem 0 0',
      fontSize: 'clamp(2rem, 4.6vw, 3.5rem)',
      lineHeight: 1.02,
      color: 'var(--color-on-ink)',
      textShadow: '0 2px 26px rgb(20 16 10 / 0.5)'
    }
  }, line), script ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.15rem 0 0',
      fontFamily: 'var(--font-editorial)',
      fontStyle: 'italic',
      fontSize: 'clamp(1.4rem, 3vw, 2.3rem)',
      color: 'var(--color-primary)'
    }
  }, script) : null, note ? /*#__PURE__*/React.createElement("p", {
    className: "text-shadow-soft",
    style: {
      margin: '1.3rem auto 0',
      maxWidth: 'var(--width-read)',
      fontSize: '1.02rem',
      lineHeight: 1.7,
      color: 'var(--color-on-ink-muted)'
    }
  }, note) : null), /*#__PURE__*/React.createElement("div", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      zIndex: 4
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 4
    }
  }));
}
window.PhotoBeat = PhotoBeat;

// ── PhotoTrio ───────────────────────────────────────────────────────────────
// Three framed photographs with a caption each. The figure row: lift-1, because
// a figure rests on the page rather than floating off it.
function PhotoTrio({
  items,
  tone = 'surface'
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mk-trio stagger",
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 18,
      marginTop: 'var(--space-10)'
    }
  }, items.map(([img, t, d]) => /*#__PURE__*/React.createElement("figure", {
    key: t,
    className: "reveal lift-1",
    style: {
      margin: 0,
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden',
      background: tone === 'ink' ? 'color-mix(in srgb, var(--color-on-ink) 6%, transparent)' : 'var(--color-canvas)',
      border: tone === 'ink' ? '1px solid color-mix(in srgb, var(--color-on-ink) 12%, transparent)' : '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: img,
    alt: "",
    style: {
      display: 'block',
      width: '100%',
      aspectRatio: '4/3',
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("figcaption", {
    style: {
      padding: '1.2rem 1.3rem 1.4rem'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '1.05rem',
      letterSpacing: 'var(--tracking-tight)',
      color: tone === 'ink' ? 'var(--color-on-ink)' : 'var(--color-text)'
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.35rem 0 0',
      fontSize: '0.93rem',
      lineHeight: 1.65,
      color: tone === 'ink' ? 'var(--color-on-ink-muted)' : 'var(--color-text-muted)'
    }
  }, d)))));
}
window.PhotoTrio = PhotoTrio;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/screens/frame.jsx
try { (() => {
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

function Seg({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      width: '4.6rem',
      flexShrink: 0,
      fontSize: 'var(--text-3xs)',
      color: 'var(--color-text-muted)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 3,
      padding: 3,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-canvas)',
      border: '1px solid var(--color-border)'
    }
  }, options.map(([id, text]) => {
    const on = value === id;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      onClick: () => onChange(id),
      style: {
        padding: '0.22rem 0.6rem',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-2xs)',
        fontWeight: on ? 700 : 500,
        whiteSpace: 'nowrap',
        background: on ? 'var(--color-surface)' : 'transparent',
        color: on ? 'var(--color-text)' : 'var(--color-text-muted)',
        boxShadow: on ? 'var(--shadow-2xs)' : 'none'
      }
    }, text);
  })));
}

// The tweaks panel. Collapsed to a button by default so it never covers the design.
// Each rail control has three positions: Auto follows the room, the other two are a
// standing instruction until the window is too narrow to obey it.
function Tweaks({
  state,
  set,
  room,
  leftState,
  rightState,
  hasRail
}) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', state.mode === 'dark');
    const shell = document.querySelector('.shell');
    if (shell) {
      if (state.skin === 'midnight') shell.setAttribute('data-skin', 'midnight');else shell.removeAttribute('data-skin');
    }
  }, [state.mode, state.skin]);
  if (!open) {
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(true),
      title: "Tweaks",
      style: {
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '0.45rem 0.8rem',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 'var(--text-2xs)',
        fontWeight: 700,
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--color-text)'
      }
    }, /*#__PURE__*/React.createElement(Ico, {
      n: "sliders-horizontal",
      style: {
        width: 14,
        height: 14
      }
    }), " Tweaks");
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 60,
      width: '19rem',
      padding: '0.9rem 1rem',
      borderRadius: 'var(--radius-card)',
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "sliders-horizontal",
    style: {
      width: 15,
      height: 15,
      color: 'var(--color-primary-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: '0.95rem',
      fontWeight: 700,
      letterSpacing: 'var(--tracking-tight)'
    }
  }, "Tweaks"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(false),
    "aria-label": "Close tweaks",
    style: {
      width: 24,
      height: 24,
      display: 'grid',
      placeItems: 'center',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: "x",
    style: {
      width: 14,
      height: 14
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(Seg, {
    label: "Skin",
    value: state.skin,
    onChange: v => set({
      skin: v
    }),
    options: [['dawn', 'DAWN'], ['midnight', 'Midnight']]
  }), /*#__PURE__*/React.createElement(Seg, {
    label: "Mode",
    value: state.mode,
    onChange: v => set({
      mode: v
    }),
    options: [['light', 'Light'], ['dark', 'Dark']]
  }), room.overlayMenu ? /*#__PURE__*/React.createElement(Seg, {
    label: "Menu",
    value: state.drawer ? 'over' : 'icons',
    onChange: v => set({
      drawer: v === 'over'
    }),
    options: [['icons', 'Strip'], ['over', 'Over content']]
  }) : /*#__PURE__*/React.createElement(Seg, {
    label: "Menu",
    value: state.left || 'auto',
    onChange: v => set({
      left: v === 'auto' ? null : v
    }),
    options: [['auto', 'Auto'], ['open', 'Open'], ['icons', 'Icons']]
  }), hasRail ? /*#__PURE__*/React.createElement(Seg, {
    label: "Rail",
    value: room.forceRightStrip ? 'closed' : state.right || 'auto',
    onChange: v => set({
      right: v === 'auto' ? null : v
    }),
    options: [['auto', 'Auto'], ['open', 'Open'], ['closed', 'Strip']]
  }) : null, /*#__PURE__*/React.createElement(Seg, {
    label: "Canvas",
    value: state.width,
    onChange: v => set({
      width: v
    }),
    options: [['comfort', 'Comfort'], ['wide', 'Wide'], ['full', 'Full']]
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '11px 0 0',
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-subtle)',
      lineHeight: 1.5
    }
  }, room.overlayMenu ? `${room.w}px: the menu is an icon strip and opens over the content.` : room.forceRightStrip ? `${room.w}px: too narrow for an open rail, so it is holding the strip.` : `${room.w}px · menu ${leftState}, rail ${hasRail ? rightState : 'none'}. Auto follows the room; anything else is your standing instruction.`));
}

// ── The rail affordance ─────────────────────────────────────────────────────
// Every open/close control in the app is this one thing: a quiet glyph at the FOOT
// of the rail it belongs to. At the top it competed with the first real row for
// attention, and folding a rail is not something anyone does often — so it sits
// under the content, borderless, at subtle weight, warming only on hover.
function RailToggle({
  icon,
  label,
  onClick,
  align = 'flex-end'
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: align,
      marginTop: 'auto',
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    title: label,
    "aria-label": label,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      width: 26,
      height: 26,
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
      border: 'none',
      background: 'transparent',
      borderRadius: 'var(--radius-control)',
      color: h ? 'var(--color-text-muted)' : 'var(--color-text-subtle)',
      transition: 'color var(--motion-fast) ease'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: icon,
    style: {
      width: 14,
      height: 14
    }
  })));
}

// The folded right rail. It never disappears: the strip stays, carrying the glyphs
// of what is behind it, so a member can always see there is a rail to open.
function RailTab({
  onOpen,
  hints = ['compass', 'trophy', 'calendar-days']
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
      padding: '1.75rem 0',
      minHeight: '13rem',
      position: 'sticky',
      top: 0
    }
  }, hints.map(h => /*#__PURE__*/React.createElement("span", {
    key: h,
    onClick: onOpen,
    title: "Show the rail",
    style: {
      width: 30,
      height: 30,
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
      color: 'var(--color-text-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: h,
    style: {
      width: 15,
      height: 15
    }
  }))), /*#__PURE__*/React.createElement(RailToggle, {
    icon: "panel-right-open",
    label: "Show the rail",
    onClick: onOpen,
    align: "center"
  }));
}

// ── The geometry ─────────────────────────────────────────────────────────────
// Both rails are tracks of the same grid, so they are ATTACHED to the inner column
// and folding one only ever moves its own edge. Four numbers, and nothing else
// decides the layout.
const TRACK = {
  nav: '12rem',
  navIcons: '3.25rem',
  rail: '17rem',
  railStrip: '2.375rem'
};

// The ladder. Each rail has an automatic state for the space available, and a user
// state that overrides it until the window can no longer honour it. `null` means
// "follow the room", which is the default and what makes the layout dynamic.
function useRoom() {
  const [w, setW] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(window.innerWidth));
    };
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return {
    w,
    // Under 1000px the menu leaves the layout entirely and arrives over the content.
    overlayMenu: w < 1000,
    autoLeft: w < 1180 ? 'icons' : 'open',
    autoRight: w < 1400 ? 'closed' : 'open',
    // Below this there is no room for an open right rail at any user's request.
    forceRightStrip: w < 1100
  };
}
function Screen({
  active,
  children,
  rail,
  wide,
  canvas,
  collapseLeft = false,
  collapseRight = false,
  dock
}) {
  const room = useRoom();
  const [t, setT] = React.useState({
    skin: 'dawn',
    mode: 'light',
    // null = follow the room. A page may ask to arrive folded (editors do) and that
    // reads as a user intent, not a new rule.
    left: collapseLeft ? 'icons' : null,
    right: collapseRight ? 'closed' : null,
    width: canvas ? 'full' : wide ? 'wide' : 'comfort'
  });
  const set = patch => setT(prev => ({
    ...prev,
    ...patch
  }));
  const drawer = !!t.drawer;
  const setDrawer = v => set({
    drawer: typeof v === 'function' ? v(drawer) : v
  });
  const leftState = room.overlayMenu ? 'icons' : t.left || room.autoLeft;
  const rightState = !rail ? 'none' : room.forceRightStrip ? 'closed' : t.right || room.autoRight;
  const center = t.width === 'full' ? 'none' : t.width === 'wide' ? '1180px' : '820px';
  const vars = {
    '--center': center,
    '--nav-w': leftState === 'open' ? TRACK.nav : TRACK.navIcons,
    '--rail-w': rightState === 'none' ? '0px' : rightState === 'open' ? TRACK.rail : TRACK.railStrip,
    '--rail-gap': room.w < 1100 ? 'var(--space-6)' : room.w < 1300 ? 'var(--space-7)' : 'var(--space-10)'
  };
  const toggleLeft = () => {
    if (room.overlayMenu) setDrawer(d => !d);else set({
      left: leftState === 'open' ? 'icons' : 'open'
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement(window.TopBar, {
    onToggleNav: toggleLeft
  }), /*#__PURE__*/React.createElement("main", {
    className: "scroll app-main",
    style: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '0 1.5rem'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "app-grid",
    style: vars
  }, /*#__PURE__*/React.createElement(window.NavRail, {
    active: active,
    onNav: () => {},
    collapsed: leftState === 'icons',
    onToggle: toggleLeft
  }), /*#__PURE__*/React.createElement("div", {
    className: "app-main-col",
    style: {
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: '1.75rem 0 3.5rem'
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    className: "app-rail"
  }, rightState === 'open' ? React.cloneElement(rail, {
    onCollapse: () => set({
      right: 'closed'
    })
  }) : rightState === 'closed' ? /*#__PURE__*/React.createElement(RailTab, {
    onOpen: () => set({
      right: 'open'
    })
  }) : null))), room.overlayMenu && drawer ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "app-scrim",
    "aria-label": "Close the menu",
    onClick: () => setDrawer(false)
  }), /*#__PURE__*/React.createElement("div", {
    className: "app-drawer",
    style: {
      width: '13.5rem'
    }
  }, /*#__PURE__*/React.createElement(window.NavRail, {
    active: active,
    onNav: () => setDrawer(false),
    overlay: true,
    onToggle: () => setDrawer(false)
  }))) : null, /*#__PURE__*/React.createElement(Tweaks, {
    state: t,
    set: set,
    room: room,
    leftState: leftState,
    rightState: rightState,
    hasRail: !!rail
  }), dock === null ? null : dock || /*#__PURE__*/React.createElement(window.VaultDock, null));
}

// The rail wrapper every screen's right rail uses, so padding and the collapse
// affordance stay consistent. It fills its track; the track owns the width.
function Rail({
  children,
  onCollapse
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: '100%',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
      padding: '1.75rem 0 3.5rem'
    }
  }, children, onCollapse ? /*#__PURE__*/React.createElement(RailToggle, {
    icon: "panel-right-close",
    label: "Hide the rail",
    onClick: onCollapse
  }) : null);
}

// ── Icons that React owns ────────────────────────────────────────────────────
// lucide.createIcons() REPLACES an <i data-lucide> element with a fresh <svg>. If
// React created that <i>, its next re-render tries to remove a node that is no
// longer in the tree and the whole app unmounts. So icons render as React-owned
// SVG built from lucide's own icon data instead of being swapped in afterwards.
function Ico({
  n,
  style,
  className
}) {
  const inner = React.useMemo(() => {
    const L = window.lucide;
    if (!L || !L.icons || !n) return '';
    const key = String(n).split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    // A lucide icon node is either [tag, attrs, children] or a bare list of parts,
    // and each part nests the same way. Walk it rather than assuming one shape.
    const parts = node => {
      if (!node) return [];
      if (Array.isArray(node)) return typeof node[0] === 'string' ? Array.isArray(node[2]) ? node[2] : [] : node;
      return Array.isArray(node.children) ? node.children : [];
    };
    const ser = p => {
      if (!p) return '';
      const tag = Array.isArray(p) ? p[0] : p.tag;
      if (typeof tag !== 'string') return '';
      const attrs = (Array.isArray(p) ? p[1] : p.attrs) || {};
      const kids = Array.isArray(p) && Array.isArray(p[2]) ? p[2] : p.children || [];
      const a = Object.keys(attrs).filter(k => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(k) && attrs[k] != null && typeof attrs[k] !== 'object').map(k => k + '="' + String(attrs[k]).replace(/"/g, '&quot;') + '"').join(' ');
      const open = '<' + tag + (a ? ' ' + a : '');
      return kids.length ? open + '>' + kids.map(ser).join('') + '</' + tag + '>' : open + '/>';
    };
    return parts(L.icons[key]).map(ser).join('');
  }, [n]);
  const w = style && style.width || 16;
  const h = style && style.height || w;
  return /*#__PURE__*/React.createElement("svg", {
    className: className,
    width: w,
    height: h,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      ...style,
      width: w,
      height: h
    },
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
}
window.Ico = Ico;

// ── The detail-page grammar, lifted from the live Events page ────────────────
// Every entity page opens the same way: a breadcrumb, poster art, ONE title with a
// status chip and icon-only operator actions, then icon meta rows. Facts are stated
// once, as chips. This is what stops each page inventing its own header.

function Breadcrumb({
  trail = []
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-muted)',
      marginBottom: 14
    }
  }, trail.map((t, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 ? /*#__PURE__*/React.createElement(Ico, {
    n: "chevron-right",
    style: {
      width: 13,
      height: 13,
      color: 'var(--color-text-subtle)'
    }
  }) : null, i < trail.length - 1 ? /*#__PURE__*/React.createElement("a", {
    href: "#"
  }, t) : /*#__PURE__*/React.createElement("span", null, t))));
}

// Poster art. The frame is art only: the title never lives inside it, so it is
// never said twice.
function Cover({
  src,
  height = 240,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      position: 'relative',
      border: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: '100%',
      height,
      objectFit: 'cover',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0
    }
  }), children);
}
function MetaRow({
  icon,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: '0.95rem',
      color: 'var(--color-text-muted)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: icon,
    style: {
      width: 15,
      height: 15,
      flexShrink: 0,
      color: 'var(--color-text-subtle)'
    }
  }), /*#__PURE__*/React.createElement("span", null, children));
}

// One title, one status chip, and operator actions reduced to glyphs so the
// member's primary action is never out-shouted.
function TitleRow({
  title,
  status,
  meta = [],
  actions = []
}) {
  const {
    IconButton
  } = window.DAWNFrequencyDesignSystem_c868e3;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: '1.9rem',
      letterSpacing: 'var(--tracking-tight-display)',
      lineHeight: 1.15
    }
  }, title), status), meta.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      marginTop: 10
    }
  }, meta.map((m, i) => /*#__PURE__*/React.createElement(MetaRow, {
    key: i,
    icon: m.icon
  }, m.text))) : null), actions.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flexShrink: 0
    }
  }, actions.map(a => /*#__PURE__*/React.createElement(IconButton, {
    key: a.label,
    label: a.label,
    size: 34
  }, /*#__PURE__*/React.createElement(Ico, {
    n: a.icon,
    style: {
      width: 15,
      height: 15
    }
  })))) : null);
}

// A chip row: variants to pick (dates, tiers) or facts to know. Never prose that
// repeats what a chip already says.
function ChipRow({
  label,
  items = [],
  value,
  onChange,
  tone = 'primary'
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
      flexWrap: 'wrap'
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      fontSize: 'var(--text-2xs)',
      color: 'var(--color-text-muted)',
      marginRight: 4
    }
  }, label) : null, items.map((it, i) => {
    const on = onChange ? value === i : false;
    const Tag = onChange ? 'button' : 'span';
    return /*#__PURE__*/React.createElement(Tag, {
      key: it,
      onClick: onChange ? () => onChange(i) : undefined,
      style: {
        padding: '0.32rem 0.78rem',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'inherit',
        fontSize: 'var(--text-meta)',
        fontWeight: on ? 700 : 500,
        cursor: onChange ? 'pointer' : 'default',
        background: on ? `var(--color-${tone}-bg)` : onChange ? 'var(--color-surface)' : `var(--color-${tone}-bg)`,
        color: on ? `var(--color-${tone}-strong)` : onChange ? 'var(--color-text-muted)' : `var(--color-${tone}-strong)`,
        border: onChange ? `1px solid ${on ? `color-mix(in srgb, var(--color-${tone}) 34%, transparent)` : 'var(--color-border)'}` : 'none'
      }
    }, it);
  }));
}

// A titled beat: a tinted glyph chip, a title, an optional count and action. This
// is what breaks a long page into readable sections instead of one grey column.
function Beat({
  icon,
  tone = 'primary',
  title,
  count,
  action,
  children,
  first
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      marginTop: first ? 0 : 26
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 'var(--radius-control)',
      background: `var(--color-${tone}-bg)`,
      color: `var(--color-${tone}-strong)`
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    n: icon,
    style: {
      width: 15,
      height: 15
    }
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      flex: 1,
      minWidth: 0,
      fontSize: '1.08rem',
      letterSpacing: 'var(--tracking-tight)'
    }
  }, title), count != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-meta)',
      color: 'var(--color-text-subtle)'
    }
  }, count) : null, action ? /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      fontSize: 'var(--text-meta)',
      fontWeight: 700,
      color: 'var(--color-primary-strong)',
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    }
  }, action) : null), children);
}

// The featured header: poster art carrying the title in the display face, with an
// editorial italic second line. The hero IS the title treatment, so the page never
// says the name twice.
function FeatureHero({
  src,
  kicker,
  title,
  script,
  blurb,
  height = 300
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden',
      border: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: '100%',
      height,
      objectFit: 'cover',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(105deg, color-mix(in srgb, var(--color-ink) 82%, transparent) 0%, color-mix(in srgb, var(--color-ink) 52%, transparent) 52%, color-mix(in srgb, var(--color-ink) 20%, transparent) 100%)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "amber-glow",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      opacity: 0.7
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 2.2rem'
    }
  }, kicker ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      padding: '0.28rem 0.7rem',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--color-primary)',
      color: 'var(--color-text-on-primary)',
      fontFamily: 'var(--font-grotesk)',
      fontSize: 'var(--text-2xs)',
      fontWeight: 700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap'
    }
  }, kicker) : null, /*#__PURE__*/React.createElement("h1", {
    className: "font-display",
    style: {
      margin: '0.7rem 0 0',
      fontSize: 'clamp(2.4rem, 5vw, 3.9rem)',
      lineHeight: 0.92,
      color: 'var(--color-on-ink)',
      letterSpacing: '0.012em'
    }
  }, title), script ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0.15rem 0 0',
      fontFamily: 'var(--font-editorial)',
      fontStyle: 'italic',
      fontSize: 'clamp(1.4rem, 2.5vw, 2rem)',
      lineHeight: 1.1,
      color: 'var(--color-primary)'
    }
  }, script) : null, blurb ? /*#__PURE__*/React.createElement("p", {
    className: "text-shadow-soft",
    style: {
      margin: '0.85rem 0 0',
      maxWidth: '26rem',
      fontSize: '1rem',
      lineHeight: 1.55,
      color: 'var(--color-on-ink)'
    }
  }, blurb) : null), /*#__PURE__*/React.createElement("span", {
    className: "light-strip",
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0
    }
  }));
}

// The two-column body every detail page uses: content, then a sticky action column.
function DetailBody({
  children,
  aside,
  asideWidth = '19rem'
}) {
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
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      display: 'grid',
      gridTemplateColumns: narrow ? '1fr' : `minmax(0, 1fr) ${asideWidth}`,
      gap: 22,
      marginTop: 24,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    style: {
      position: narrow ? 'static' : 'sticky',
      top: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, aside));
}
Object.assign(window, {
  Screen,
  Rail,
  Tweaks,
  RailTab,
  Breadcrumb,
  Cover,
  MetaRow,
  TitleRow,
  ChipRow,
  DetailBody,
  Ico,
  Beat,
  FeatureHero
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/screens/frame.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.BrandMark = __ds_scope.BrandMark;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Glyph = __ds_scope.Glyph;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.RankBadge = __ds_scope.RankBadge;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Counter = __ds_scope.Counter;

__ds_ns.CounterRow = __ds_scope.CounterRow;

__ds_ns.EntityCard = __ds_scope.EntityCard;

__ds_ns.GateNotice = __ds_scope.GateNotice;

__ds_ns.Meter = __ds_scope.Meter;

__ds_ns.PageHeading = __ds_scope.PageHeading;

__ds_ns.PersonCard = __ds_scope.PersonCard;

__ds_ns.ProgressTrack = __ds_scope.ProgressTrack;

__ds_ns.RowCard = __ds_scope.RowCard;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.StreakMeter = __ds_scope.StreakMeter;

__ds_ns.UnderlineTabs = __ds_scope.UnderlineTabs;

__ds_ns.SectionHeading = __ds_scope.SectionHeading;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
