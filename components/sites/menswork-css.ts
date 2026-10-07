import { MENSWORK_TOKENS_CSS } from '@/lib/theme/menswork'

// THE MENSWORK WEBSITE SKIN (lib/theme/menswork.ts). Layered AFTER HOUSE_CSS on a website whose Space picked
// the Menswork page theme, and scoped under [data-house-theme="menswork"], so every house section keeps its
// markup and content and only its look changes. Reads `--mw-*` and DAWN tokens only (the hex lives in the
// theme's token data). Inline styles in house-sections.tsx that would break the theme's rules (centred
// headings, italics, serif sizes) are overridden with !important, scoped here, so the shared sections stay
// untouched for every other site.
//
// The rules, from the design system: one 60 degree chamfer, top-right (8px buttons and tags, 12px cards
// and inputs, 20px frames and bands); hairlines, never shadows or glows; no gradients, no blur; condensed
// caps headlines, Barlow body, mono labels and numerals; left-aligned; one seasonal accent marking "now";
// circles only for people; linear 150ms transitions.

const M = '[data-house-theme="menswork"]'

const CLIP = {
  sm: 'polygon(0 0,calc(100% - 8px) 0,100% 13.86px,100% 100%,0 100%)',
  md: 'polygon(0 0,calc(100% - 12px) 0,100% 20.78px,100% 100%,0 100%)',
  lg: 'polygon(0 0,calc(100% - 20px) 0,100% 34.64px,100% 100%,0 100%)',
} as const

/** The diagonal border a clip-path cuts off: a bar laid along the 60 degree cut, half of it clipped away. */
const diag = (cut: number) =>
  `content:"";position:absolute;top:-2px;right:${-1 - cut}px;width:${cut * 2}px;height:2px;background:var(--mw-edge);transform-origin:0 50%;transform:rotate(60deg);pointer-events:none`

const LABEL = 'font-family:var(--mw-mono);font-weight:500;font-size:12px;line-height:1.2;letter-spacing:.12em;text-transform:uppercase'
const DISPLAY = 'font-family:var(--mw-display);font-weight:800;text-transform:uppercase;letter-spacing:.005em;font-style:normal'
const CHEVRON = 'repeating-linear-gradient(-60deg,var(--mw-hairline) 0 2px,transparent 2px 12px)'

export const MENSWORK_CSS = `${MENSWORK_TOKENS_CSS}
${M}{--hs-serif:var(--mw-display);--hs-sans:var(--mw-body);--mw-edge:var(--color-border);font-family:var(--mw-body);font-size:17px;line-height:1.55;color:var(--color-text);background-color:var(--mw-charcoal);background-image:var(--mw-grain)}
html:has(${M}),body:has(${M}){background:var(--mw-charcoal)}
${M} ::selection{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} :focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
${M} main [class*="rounded"]:not([class*="rounded-f"]){border-radius:2px}
${M} main [class*="shadow"]{box-shadow:none}

${M} .hs-serif,${M} .hs-h1,${M} .hs-h2,${M} .hs-brand{${DISPLAY}}
${M} .hs-h1{font-size:clamp(3.6rem,10vw,7.5rem);line-height:.88;letter-spacing:.005em;text-shadow:none}
${M} .hs-h2{font-size:clamp(2.4rem,5.4vw,3.75rem);line-height:.92;letter-spacing:.005em}
${M} .hs-accent{font-style:normal;color:var(--mw-accent)}
${M} .hs-eyebrow{${LABEL};gap:10px;color:var(--color-text-muted)}
${M} .hs-lead{font-size:1.125rem;line-height:1.55;color:var(--color-text-muted);max-width:68ch}
${M} .hs-muted{color:var(--color-text-muted)}
${M} .hs-center{align-items:flex-start;text-align:left}
${M} .hs-section{max-width:1200px;padding-bottom:clamp(80px,10vw,128px)}
${M} .hs-section-first{padding-top:clamp(80px,10vw,128px)}
${M} .hs-wide{max-width:1248px;padding-bottom:clamp(80px,10vw,128px)}
${M} .hs-split{gap:clamp(32px,6vw,96px)}

${M} .hs-btn{position:relative;border-radius:0;clip-path:${CLIP.sm};font-family:var(--mw-body);font-weight:600;font-size:16px;line-height:1;box-shadow:none;transition:background 150ms linear,color 150ms linear,border-color 150ms linear}
${M} .hs-btn-primary{padding:16px 26px 16px 22px;background:var(--color-primary);color:var(--color-text-on-primary);box-shadow:none}
${M} .hs-btn-primary:hover{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .hs-btn-primary:active{background:var(--mw-pressed)}
${M} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft){padding:15px 24px 15px 21px;background:transparent;border:1px solid var(--mw-edge);--mw-edge:var(--color-border-strong);color:var(--color-text);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none}
${M} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft)::after{${diag(8)}}
${M} :is(.hs-btn-glass,.hs-btn-light,.hs-btn-soft):hover{background:var(--mw-raised);--mw-edge:var(--mw-secondary);color:var(--color-text)}
${M} .hs-btn-dark{padding:12px clamp(12px,3vw,20px) 12px clamp(10px,2.6vw,16px);font-size:clamp(13px,3.5vw,15px);background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .hs-btn-dark:hover{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .hs-btn-dark:active{background:var(--mw-pressed)}
${M} .hs-btn svg{transition:transform 150ms linear}
${M} .hs-btn:hover svg{transform:translateX(3px)}
${M} .hs-dot{width:10px;height:8.66px;border-radius:0;background:var(--mw-accent);clip-path:polygon(50% 0,100% 100%,0 100%);animation:none}

${M} .hs-header{padding:0;background:var(--mw-charcoal);border-bottom:1px solid var(--mw-hairline)}
${M} .hs-pill{max-width:1248px;min-height:64px;padding:0 clamp(16px,3vw,24px);border-radius:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;animation:none}
${M} .hs-brand{font-size:clamp(20px,5.6vw,28px);line-height:1;color:var(--color-text)}
${M} .hs-nav{gap:24px;align-self:stretch}
${M} .hs-nav a{${LABEL};display:flex;align-items:center;padding:0;border-radius:0;border-bottom:2px solid transparent;color:var(--color-text-muted);transition:color 150ms linear,border-color 150ms linear}
${M} .hs-nav a:hover{background:transparent;color:var(--color-text);border-bottom-color:var(--color-primary)}
${M} .hs-menu-button{position:relative;width:44px;height:44px;border-radius:0;clip-path:${CLIP.sm};background:transparent;border:1px solid var(--mw-edge);--mw-edge:var(--color-border-strong);color:var(--color-text)}
${M} .hs-menu-button::after{${diag(8)}}
${M} .hs-menu-panel{top:64px;left:0;right:0;max-width:none;padding:8px clamp(16px,3vw,24px) 16px;border-radius:0;background:var(--mw-charcoal);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;border-bottom:1px solid var(--mw-hairline)}
${M} .hs-menu-panel a{${LABEL};font-size:13px;padding:16px 4px;border-radius:0;border-bottom:1px solid var(--mw-hairline);color:var(--color-text)}
${M} .hs-menu-panel a:last-child{border-bottom:0}
${M} .hs-menu-panel a:hover{color:var(--color-primary-strong)}

${M} .hs-hero{margin-top:0;min-height:max(88svh,640px);background:var(--mw-charcoal);color:var(--color-on-ink)}
${M} .hs-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:12px;background:${CHEVRON};pointer-events:none}
${M} .hs-hero-photo{filter:saturate(.75) contrast(1.05)}
${M} .hs-hero-wash{background:color-mix(in srgb,var(--mw-charcoal) 64%,transparent)}
${M} .hs-hero-side{display:none}
${M} .hs-hero-grid{max-width:1248px;padding:96px clamp(20px,4vw,48px) clamp(56px,7vw,96px)}
${M} .hs-hero-copy{gap:28px;max-width:760px}
${M} .hs-hero-pill{${LABEL};position:relative;gap:10px;padding:10px 16px 10px 12px;border-radius:0;clip-path:${CLIP.sm};background:transparent;border:1px solid var(--mw-edge);--mw-edge:var(--color-border-strong);-webkit-backdrop-filter:none;backdrop-filter:none;color:var(--color-on-ink)}
${M} .hs-hero-pill::after{${diag(8)}}
${M} .hs-hero-pill:hover{background:var(--mw-raised);color:var(--color-on-ink)}
${M} .hs-hero-lede{max-width:36em;font-size:clamp(1.1rem,1.5vw,1.25rem);line-height:1.5;color:var(--color-on-ink-muted)}
${M} .hs-start{position:relative;padding:24px;border-radius:0;clip-path:${CLIP.md};background:var(--mw-surface);border:1px solid var(--mw-edge);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none}
${M} .hs-start::after{${diag(12)}}
${M} .hs-start-who img{border-radius:50%}
${M} .hs-start .hs-serif{font-size:1.75rem!important;line-height:1}
${M} .hs-start-row{position:relative;border-radius:0;clip-path:${CLIP.sm};background:var(--color-primary);color:var(--color-text-on-primary);font-family:var(--mw-body)}
${M} .hs-start-row:hover{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} .hs-start-row:active{background:var(--mw-pressed)}

${M} .hs-sign{position:relative;padding:16px 20px;border-radius:0;clip-path:${CLIP.sm};background:var(--mw-surface);border:1px solid var(--mw-edge);border-left:2px solid var(--color-primary);box-shadow:none;font-size:1.06rem}
${M} .hs-sign::before{display:none}
${M} .hs-sign::after{${diag(8)}}
${M} .hs-pull{margin-top:20px;padding-left:16px;border-left:2px solid var(--mw-accent);font-family:var(--mw-body);font-style:normal;font-weight:600;font-size:1.3rem;line-height:1.45;color:var(--color-text)}

${M} .hs-panel{position:relative;border-radius:0;clip-path:${CLIP.lg};background:var(--mw-surface);border:1px solid var(--mw-edge);padding:clamp(40px,6vw,88px) clamp(24px,5vw,72px)}
${M} .hs-panel::after{${diag(20)}}
${M} .hs-panel .hs-lead{text-align:left!important;margin:-24px 0 48px!important;max-width:68ch!important}
${M} .hs-step{position:relative;padding-top:28px}
${M} .hs-step::before{content:"";position:absolute;top:0;left:0;right:12px;height:8px;background:var(--mw-raised);clip-path:polygon(0 0,calc(100% - 4.62px) 0,100% 50%,calc(100% - 4.62px) 100%,0 100%,4.62px 50%)}
${M} .hs-step:first-child::before{background:var(--color-primary)}
${M} .hs-step-n{font-family:var(--mw-mono);font-style:normal;font-weight:500;font-size:3.5rem;line-height:1;color:var(--color-primary-strong)}
${M} .hs-step h3{margin-top:16px;${DISPLAY};font-weight:700;font-size:1.65rem;line-height:1;letter-spacing:.03em}
${M} .hs-step p{margin-top:12px;font-size:1rem;line-height:1.55;color:var(--color-text-muted)}

${M} .hs-photo{position:relative;border-radius:0;clip-path:${CLIP.lg};box-shadow:none;background:var(--mw-raised)}
${M} .hs-photo img{filter:saturate(.75) contrast(1.05)}
${M} .hs-photo::after{content:"";position:absolute;right:0;bottom:0;width:40px;height:34.64px;background:var(--color-primary);clip-path:polygon(0 100%,100% 100%,50% 0);pointer-events:none}
${M} .hs-quote{padding-left:16px;border-left:2px solid var(--color-primary);font-family:var(--mw-body);font-style:normal;font-weight:500;font-size:1.3rem;line-height:1.45}
${M} .hs-facts{gap:24px 20px;padding-top:20px;border-top:1px solid var(--mw-hairline)}
${M} .hs-fact-v{font-family:var(--mw-mono);font-weight:500;font-size:clamp(1.4rem,2.2vw,1.9rem);line-height:1.1;text-transform:uppercase;color:var(--color-text)}
${M} .hs-fact-l{${LABEL};font-size:11px;line-height:1.5;color:var(--color-text-muted)}
${M} .hs-photo-col .hs-pull{padding:0 0 0 16px}
${M} .hs-stat{padding-top:20px;border-top:2px solid var(--mw-hairline)}
${M} .hs-stat:first-child{border-top-color:var(--color-primary)}
${M} .hs-stat-v{font-family:var(--mw-mono);font-weight:500;font-size:clamp(2rem,4vw,3.5rem);line-height:1;letter-spacing:0;color:var(--color-primary-strong)}
${M} .hs-stat-l{font-size:15px;line-height:1.5;color:var(--color-text-muted)}
${M} .hs-hero-form .hs-hero-pill{${LABEL};padding:10px 16px}
${M} .hs-hero-form .hs-h1{font-size:clamp(3.2rem,8vw,6.5rem)}
${M} .hs-hero-card{filter:none}

${M} .hs-cards{gap:clamp(16px,2vw,24px)}
${M} .hs-card{position:relative;gap:14px;padding:clamp(24px,3vw,36px);border-radius:0;clip-path:${CLIP.md};background:var(--mw-surface);border:1px solid var(--mw-edge);box-shadow:none;transition:background 150ms linear}
${M} .hs-card::after{${diag(12)}}
${M} .hs-cards .hs-card:hover{background:var(--mw-raised)}
${M} .hs-card h3{${DISPLAY};font-weight:700;font-size:clamp(1.8rem,2.6vw,2.4rem);line-height:.95;letter-spacing:.03em}
${M} .hs-card p{font-size:1rem;line-height:1.55;color:var(--color-text-muted)}
${M} .hs-card>div:first-child>span:first-child{${LABEL};font-size:12px!important;color:var(--color-text-muted)!important}
${M} .hs-card .hs-serif{font-family:var(--mw-mono)!important;font-weight:500;font-size:1.5rem!important;text-transform:uppercase;letter-spacing:0;color:var(--color-primary-strong)}
${M} .hs-card label{${LABEL};font-size:11px;color:var(--color-text-muted)}
${M} .hs-card :is(input,textarea,select){border-radius:0;border-color:var(--color-border-strong);background:var(--mw-charcoal);color:var(--color-text)}
${M} .hs-card :is(input,textarea,select):focus{border-color:var(--color-primary-strong)}
${M} .hs-card input[type="checkbox"]{border-radius:0;accent-color:var(--color-primary)}
${M} .hs-card [role="alert"]{font-weight:600;padding:10px 12px;border:2px solid var(--color-text)}
${M} .hs-card .hs-btn{margin-top:4px}

${M} .hs-tier{position:relative;padding:20px 24px;border-radius:0;clip-path:${CLIP.md};background:var(--mw-surface);border:1px solid var(--mw-edge);box-shadow:none;transition:background 150ms linear,border-color 150ms linear}
${M} .hs-tier::after{${diag(12)}}
${M} .hs-tier:hover{background:var(--mw-raised);--mw-edge:var(--color-border-strong)}
${M} .hs-tier .hs-serif{font-size:1.6rem!important;font-weight:700;letter-spacing:.03em;line-height:1}
${M} .hs-tier svg{transition:transform 150ms linear}
${M} .hs-tier:hover svg{transform:translateX(3px)}
${M} .hs-chip{${LABEL};display:inline-block;font-size:11px;padding:5px 12px 5px 8px;border-radius:0;clip-path:${CLIP.sm};background:var(--color-primary-bg);color:var(--color-primary-strong)}
${M} p.hs-serif{font-family:var(--mw-body)!important;font-style:normal!important;font-weight:500;text-transform:none;letter-spacing:0;font-size:1.25rem!important;padding-left:16px;border-left:2px solid var(--color-primary)}

${M} .hs-faq{position:relative;border-radius:0;clip-path:${CLIP.sm};background:transparent;border:1px solid var(--mw-edge);box-shadow:none;transition:background 150ms linear}
${M} .hs-faq::after{${diag(8)}}
${M} .hs-faq[open]{background:var(--mw-surface);--mw-edge:var(--color-border-strong);box-shadow:none}
${M} .hs-faq summary{padding:18px 20px;font-size:1.06rem;font-weight:600}
${M} .hs-faq summary::after{width:32px;height:32px;border-radius:0;background:transparent;border:1px solid var(--color-border-strong);font-family:var(--mw-mono);font-size:1rem;color:var(--color-primary-strong)}
${M} .hs-faq-a{padding:0 64px 20px 20px;font-size:1rem;line-height:1.55;color:var(--color-text-muted)}

${M} .hs-band{border-radius:0;clip-path:${CLIP.lg};background-color:var(--mw-surface);background-image:var(--mw-lattice);border:1px solid var(--mw-edge)}
${M} .hs-band::after{${diag(20)}}
${M} .hs-band-photo{opacity:.22;filter:saturate(.6)}
${M} .hs-band-wash{background:color-mix(in srgb,var(--mw-surface) 72%,transparent)}
${M} .hs-band-grid{padding:clamp(48px,7vw,104px) clamp(24px,5vw,80px)}
${M} .hs-band h2{${DISPLAY};font-size:clamp(3rem,7vw,5.5rem);line-height:.9;letter-spacing:.005em}
${M} .hs-band-body{font-size:1.125rem;line-height:1.55;color:var(--color-on-ink-muted)}
${M} .hs-band .hs-eyebrow{color:var(--color-primary-strong)!important}
${M} .hs-contact{position:relative;padding:clamp(24px,3vw,32px);border-radius:0;clip-path:${CLIP.md};background:var(--mw-charcoal);border:1px solid var(--mw-edge);-webkit-backdrop-filter:none;backdrop-filter:none}
${M} .hs-contact::after{${diag(12)}}
${M} .hs-contact .hs-serif{font-size:1.6rem!important;letter-spacing:.03em}
${M} .hs-contact a,${M} .hs-contact span{font-size:1rem;color:var(--color-on-ink)}
${M} .hs-contact a:hover{color:var(--color-primary-strong)}
${M} .hs-contact .hs-contact-muted{${LABEL};font-size:11px;line-height:1.6;color:var(--color-on-ink-muted)}
${M} .hs-contact .hs-socials a{${LABEL};font-size:11px;position:relative;padding:9px 14px 9px 11px;border-radius:0;clip-path:${CLIP.sm};background:transparent;border:1px solid var(--color-border-strong)}
${M} .hs-contact .hs-socials a:hover{background:var(--mw-raised);color:var(--color-on-ink)}

${M} .hs-plain{max-width:1200px}
${M} .hs-footer{max-width:1248px;padding:24px clamp(20px,4vw,48px) 40px;border-top:1px solid var(--mw-hairline);${LABEL};font-size:11px;color:var(--color-text-muted)}
${M} .hs-footer a{color:var(--color-text-muted);font-weight:500}
${M} .hs-footer a:hover{color:var(--color-primary-strong)}
`
