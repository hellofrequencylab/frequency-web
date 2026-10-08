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
// circles only for people; linear 150ms transitions, none under reduced motion. Photography (HANDOFF
// 2026-10-07): type sits ABOVE the image, never over the men, so the hero stacks its copy over a full-width
// photo instead of washing one behind it, and photos keep their own light (no filters).

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

/** A 60 degree chevron at height h (n = h x 0.289): notched start, pointed end. `flat` drops the notch. */
const chev = (h: number, flat = false) => {
  const n = +(h * 0.289).toFixed(2)
  return `polygon(0 0,calc(100% - ${n}px) 0,100% 50%,calc(100% - ${n}px) 100%,0 100%${flat ? '' : `,${n}px 50%`})`
}

export const MENSWORK_CSS = `${MENSWORK_TOKENS_CSS}
${M}{--hs-serif:var(--mw-display);--hs-sans:var(--mw-body);--mw-edge:var(--color-border);font-family:var(--mw-body);font-size:17px;line-height:1.55;color:var(--color-text);background-color:var(--mw-charcoal);background-image:var(--mw-grain)}
html:has(${M}),body:has(${M}){background:var(--mw-charcoal)}
${M} ::selection{background:var(--color-primary);color:var(--color-text-on-primary)}
${M} :focus-visible{outline:2px solid var(--color-focus-ring);outline-offset:2px}
${M} main [class*="rounded"]:not([class*="ded-full"]){border-radius:2px}
${M} main [class*="shadow"]{box-shadow:none}

${M} .hs-serif,${M} .hs-h1,${M} .hs-h2,${M} .hs-brand{${DISPLAY}}
${M} .hs-h1{font-size:clamp(3.6rem,10vw,7.5rem);line-height:.88;letter-spacing:.005em;text-shadow:none}
${M} .hs-h2{font-size:clamp(2.4rem,5.4vw,3.75rem);line-height:.92;letter-spacing:.005em}
${M} .hs-accent{font-style:normal;color:var(--color-primary-strong)}
${M} .hs-eyebrow{${LABEL};gap:10px;color:var(--color-text-muted)}
${M} .hs-eyebrow::before{content:"";flex:none;width:14px;height:10px;background:var(--color-primary);clip-path:${chev(10)}}
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
${M} .hs-brand{display:inline-flex;align-items:center;gap:10px;font-size:clamp(20px,5.6vw,28px);line-height:1;color:var(--color-text)}
${M} .hs-logo{height:clamp(28px,6vw,36px);width:auto;filter:brightness(0) invert(.93)}
${M} .hs-nav{gap:24px;align-self:stretch}
${M} .hs-nav a{${LABEL};display:flex;align-items:center;padding:0;border-radius:0;border-bottom:2px solid transparent;color:var(--color-text-muted);transition:color 150ms linear,border-color 150ms linear}
${M} .hs-nav a:hover{background:transparent;color:var(--color-text);border-bottom-color:var(--color-primary)}
${M} .hs-menu-button{position:relative;width:44px;height:44px;border-radius:0;clip-path:${CLIP.sm};background:transparent;border:1px solid var(--mw-edge);--mw-edge:var(--color-border-strong);color:var(--color-text)}
${M} .hs-menu-button::after{${diag(8)}}
${M} .hs-menu-panel{top:64px;left:0;right:0;max-width:none;padding:8px clamp(16px,3vw,24px) 16px;border-radius:0;background:var(--mw-charcoal);-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;border-bottom:1px solid var(--mw-hairline)}
${M} .hs-menu-panel a{${LABEL};font-size:13px;padding:16px 4px;border-radius:0;border-bottom:1px solid var(--mw-hairline);color:var(--color-text)}
${M} .hs-menu-panel a:last-child{border-bottom:0}
${M} .hs-menu-panel a:hover{color:var(--color-primary-strong)}

${M} .hs-hero{margin-top:0;min-height:0;flex-direction:column;align-items:stretch;background:var(--mw-charcoal);color:var(--color-on-ink)}
${M} .hs-hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:12px;background:${CHEVRON};pointer-events:none}
${M} .hs-hero-photo{position:relative;inset:auto;order:2;width:calc(100% - 2 * clamp(20px,4vw,48px));max-width:1248px;margin:0 auto;height:clamp(280px,40vw,480px);filter:none}
${M} .hs-hero-wash,${M} .hs-hero-side{display:none}
${M} .hs-hero-grid{order:1;max-width:1248px;padding:clamp(48px,6vw,72px) clamp(20px,4vw,48px) 48px}
${M} .hs-hero-copy{gap:24px;max-width:900px}
${M} .hs-hero .hs-h1{font-size:clamp(3.6rem,8vw,7.5rem)}
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

${M} .hs-split>div:has(>.hs-sign){display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:1px!important;background:var(--mw-hairline);border:1px solid var(--mw-hairline)}
${M} .hs-sign{padding:20px;border-radius:0;background:var(--mw-surface);box-shadow:none;font-size:1rem;font-weight:600;line-height:1.45}
${M} .hs-sign::before{display:none}
${M} .hs-split>div>.hs-pull{grid-column:1/-1;margin:0;padding:20px;border-left:0;background:var(--mw-charcoal)}
${M} .hs-pull{margin-top:20px;padding-left:16px;border-left:2px solid var(--mw-accent);font-family:var(--mw-body);font-style:normal;font-weight:600;font-size:1.3rem;line-height:1.45;color:var(--color-text)}

${M} .hs-panel{position:relative;border-radius:0;clip-path:${CLIP.lg};background:var(--mw-surface);border:1px solid var(--mw-edge);padding:clamp(40px,6vw,88px) clamp(24px,5vw,72px)}
${M} .hs-panel::after{${diag(20)}}
${M} .hs-panel .hs-lead{text-align:left!important;margin:-24px 0 48px!important;max-width:68ch!important}
${M} .hs-panel:has(.hs-steps){clip-path:none;background:transparent;border:0;padding:0}
${M} .hs-panel:has(.hs-steps)::after{display:none}
${M} .hs-wide:has(.hs-steps)::after{content:"";display:block;height:12px;margin-top:clamp(64px,8vw,96px);background:${CHEVRON}}
${M} .hs-steps{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:24px 4px}
${M} .hs-step{position:relative;padding-top:60px}
${M} .hs-step::before{content:"";position:absolute;top:0;left:0;right:-8px;height:40px;background:var(--mw-raised);clip-path:${chev(40)}}
${M} .hs-step:first-child::before{clip-path:${chev(40, true)}}
${M} .hs-step:first-child::before{background:var(--color-primary)}
${M} .hs-step-n{position:absolute;top:0;left:20px;height:40px;display:flex;align-items:center;${LABEL};font-style:normal;color:var(--color-text-muted)}
${M} .hs-step:first-child .hs-step-n{left:14px;color:var(--color-text-on-primary)}
${M} .hs-step h3{margin:0;${DISPLAY};font-weight:700;font-size:1.65rem;line-height:1;letter-spacing:.03em}
${M} .hs-step p{margin-top:10px;padding-right:12px;font-size:.95rem;line-height:1.5;color:var(--color-text-muted)}

${M} .hs-photo{position:relative;border-radius:0;clip-path:${CLIP.lg};box-shadow:none;background:var(--mw-raised)}
${M} .hs-photo img{filter:none}
${M} .hs-photo::after{content:"";position:absolute;right:0;bottom:0;width:40px;height:34.64px;background:var(--color-primary);clip-path:polygon(0 100%,100% 100%,50% 0);pointer-events:none}
${M} .hs-quote{padding-left:16px;border-left:2px solid var(--color-primary);font-family:var(--mw-body);font-style:normal;font-weight:500;font-size:1.3rem;line-height:1.45}
${M} .hs-facts{display:flex;flex-wrap:wrap;gap:4px;padding-top:20px}
${M} .hs-facts>div{flex:1 1 110px;min-height:88px;justify-content:space-between;padding:14px 22px 12px 30px;background:var(--mw-raised);clip-path:${chev(88)}}
${M} .hs-facts>div:first-child{padding-left:18px;clip-path:${chev(88, true)}}
${M} .hs-fact-v{${DISPLAY};font-size:clamp(1.6rem,2.4vw,2rem);line-height:1;color:var(--color-primary-strong)}
${M} .hs-fact-l{${LABEL};font-size:11px;line-height:1.4;color:var(--color-text)}
${M} .hs-photo-col .hs-pull{padding:0 0 0 16px}
${M} .hs-stat{padding-top:20px;border-top:2px solid var(--mw-hairline)}
${M} .hs-stat:first-child{border-top-color:var(--color-primary)}
${M} .hs-stat-v{font-family:var(--mw-mono);font-weight:500;font-size:clamp(2rem,4vw,3.5rem);line-height:1;letter-spacing:0;color:var(--color-primary-strong)}
${M} .hs-stat-l{font-size:15px;line-height:1.5;color:var(--color-text-muted)}
${M} .hs-hero-form .hs-hero-pill{${LABEL};padding:10px 16px}
${M} .hs-hero-form .hs-h1{font-size:clamp(3.2rem,8vw,6.5rem)}
${M} .hs-hero-card{filter:none}
${M} .hs-hero-form .hs-hero-grid{padding-top:clamp(64px,8vw,96px)}

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
${M} .hs-band-photo,${M} .hs-band-wash{display:none}
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

${M} .hs-season{max-width:none;margin:0;border-bottom:1px solid var(--mw-hairline);padding-left:max(clamp(16px,4vw,48px),calc((100% - 1248px) / 2 + clamp(16px,4vw,48px)));padding-right:max(clamp(16px,4vw,48px),calc((100% - 1248px) / 2 + clamp(16px,4vw,48px)));min-height:52px;padding-top:10px;padding-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px 32px;flex-wrap:wrap}
${M} .hs-season-now{margin:0;display:flex;align-items:center;gap:10px;${LABEL};font-size:11px;color:var(--color-text-muted)}
${M} .hs-season-now::before{content:"";flex:none;width:16px;height:10px;background:var(--mw-accent);clip-path:${chev(10)}}
${M} .hs-season-now span{color:var(--mw-accent)}
${M} .hs-season-track{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;flex:1 1 320px;max-width:560px}
${M} .hs-season-track li{position:relative;padding-top:12px;${LABEL};font-size:10px;color:var(--color-text-subtle)}
${M} .hs-season-track li::before{content:"";position:absolute;top:0;left:0;right:0;height:6px;background:var(--color-border-strong);clip-path:${chev(6)}}
${M} .hs-season-track li[aria-current]{color:var(--mw-accent)}
${M} .hs-season-track li[aria-current]::before{background:var(--mw-accent)}

${M} .hs-footer-top{width:100%;box-sizing:border-box;max-width:1248px;margin:clamp(48px,6vw,80px) auto 0;padding:clamp(40px,5vw,56px) clamp(20px,4vw,48px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:32px clamp(32px,6vw,96px);border-top:1px solid var(--mw-hairline)}
${M} .hs-footer-brand{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
${M} .hs-footer-brand p{margin:0;max-width:42ch;font-size:.95rem;line-height:1.55;color:var(--color-text-muted)}
${M} .hs-footer-links{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px 24px;align-content:start}
${M} .hs-footer-links a{${LABEL};font-size:11px;color:var(--color-text-muted)}
${M} .hs-footer-links a:hover{color:var(--color-primary-strong)}
${M} .hs-footer{max-width:1248px;padding:24px clamp(20px,4vw,48px) 40px;border-top:1px solid var(--mw-hairline);${LABEL};font-size:11px;color:var(--color-text-muted)}
${M} .hs-footer a{color:var(--color-text-muted);font-weight:500}
${M} .hs-footer a:hover{color:var(--color-primary-strong)}
${M} .hs-footer-end{gap:24px}
${M} .hs-footer-admin{opacity:.7}

${M} .hs-admin{background:var(--color-signal);color:var(--color-text-on-signal)}
${M} .hs-admin-in{max-width:1248px;height:40px;margin:0 auto;padding:0 clamp(16px,3vw,24px);display:flex;align-items:center;gap:24px;overflow-x:auto;scrollbar-width:none;white-space:nowrap}
${M} .hs-admin-tag{${LABEL};font-size:11px;padding:5px 12px 5px 8px;background:var(--mw-charcoal);color:var(--color-signal-strong);clip-path:${CLIP.sm}}
${M} .hs-admin-nav{display:flex;gap:20px;align-self:stretch}
${M} .hs-admin-nav a{${LABEL};display:flex;align-items:center;border-bottom:2px solid transparent;color:var(--color-text-on-signal);text-decoration:none;transition:border-color 150ms linear}
${M} .hs-admin-nav a:hover,${M} .hs-admin-nav a[aria-current="page"]{border-bottom-color:var(--color-text-on-signal)}
${M} .hs-admin-note{margin-left:auto;font-family:var(--mw-body);font-size:13px}
@media (max-width:759px){${M} .hs-admin-note{display:none}}
@media (prefers-reduced-motion:reduce){${M} *{transition:none!important;animation:none!important}}
`
