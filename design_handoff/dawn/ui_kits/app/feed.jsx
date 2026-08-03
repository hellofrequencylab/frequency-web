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
