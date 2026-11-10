/* eslint-disable @typescript-eslint/no-unused-vars -- skins: a straight port of the Theme Kits design file (design_handoff_theme_kits/Theme Kits.dc.html), whose per-kit data is loosely shaped on purpose. */
// Per-kit skin (SKIN) and background decoration (DECO) of the Theme Kits page, one function per kit that turns the picked accent
// into the section's colours, faces, panels, buttons and backdrop shapes. The kit sections are drawn in each kit's own design
// system, which is why these hold their own colours: they are kit data, not page chrome. Frequency's own chrome stays on tokens.
import type { Any } from './data'

export const lum=(h:string)=>{const n=parseInt(h.slice(1),16),f=(c:number)=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};return .2126*f(n>>16&255)+.7152*f(n>>8&255)+.0722*f(n&255)};
// The label colour for text on accent `h`: whichever of the kit's dark and light has the higher contrast ratio, so a mid-tone
// accent (Bold's Fall, #D4703E: 5.4:1 with charcoal, 3.4:1 with white) gets the readable one instead of a fixed luminance cut.
export const onA=(h:string,dark:string,light:string)=>{const a=lum(h)+.05,d=lum(dark)+.05,l=lum(light)+.05;return Math.max(a,d)/Math.min(a,d)>=Math.max(a,l)/Math.min(a,l)?dark:light};
export const RIV=(c:string)=>`radial-gradient(circle,${c} 1.6px,transparent 2.2px) 0 0/7px 7px no-repeat,radial-gradient(circle,${c} 1.6px,transparent 2.2px) 100% 0/7px 7px no-repeat,radial-gradient(circle,${c} 1.6px,transparent 2.2px) 0 100%/7px 7px no-repeat,radial-gradient(circle,${c} 1.6px,transparent 2.2px) 100% 100%/7px 7px no-repeat`;
export const BASE: Record<string, Any>={fstretch:'100%',grain:.1,blend:'overlay',rivets:'none',eyeBg:'transparent',eyePad:'0',eyeRot:'0deg',eyeClip:'none',markText:'',markW:'0',markH:'0',markBg:'transparent',markR:'0',markClip:'none',markGlow:'none',titleShadow:'none',numShadow:'none',tlh:'1',fvw:'400',tagSize:'21px',bodySize:'15px',numSize:'28px',emW:'400',emCase:'none',emGlow:'none',btnRot:'0deg',btnFilter:'none',btnShadow:'none',btnPadR:'30px',swR:'999px',chipR:'999px',panelShadow:'0 0 0 0 transparent',bdL:'0',bdT:'0',bdW:'0',bdH:'0',bdBg:'none',bdR:'0',bdClip:'none',bdShadow:'none',bdOp:'1',bdFilter:'none',b2L:'0',b2T:'0',b2W:'0',b2H:'0',b2Bg:'none',b2R:'0',b2Shadow:'none',photoFilter:'none',linkTrack:'0',linkCase:'none',labelCase:'uppercase'};
export const SKIN: Record<string,(A:string,T:string,a:Any)=>Record<string,Any>>={
 'new-world':(A:string,T:string)=>({bg:`radial-gradient(55% 65% at 72% 42%,${A}30,transparent 70%),radial-gradient(35% 45% at 6% 96%,rgba(139,92,255,.16),transparent 70%),linear-gradient(180deg,#0A0E16,#0B1322)`,text:'#F2F5FA',body:'#C9D2E0',muted:'#98A6BC',hair:'#262F44',panel:'rgba(17,24,38,.86)',panelR:'20px',panelClip:'none',
  fd:"'Unbounded',sans-serif",fdw:'600',fcase:'none',ftrack:'-0.045em',tsize:'clamp(40px,4.2vw,58px)',fv:"'Instrument Serif',serif",fvStyle:'italic',tagSize:'24px',fb:"'Hanken Grotesk',sans-serif",numSize:'26px',
  emF:"'Instrument Serif',serif",emStyle:'italic',eyeF:"600 11px/1 'Unbounded',sans-serif",eyeTrack:'.14em',eyeColor:T,markW:'22px',markH:'1.5px',markBg:T,markGlow:`0 0 10px ${A}`,
  labelF:"600 10.5px/1.2 'Unbounded',sans-serif",labelTrack:'.12em',btnBg:A,btnColor:onA(A,'#0A0E16','#FFFFFF'),btnR:'999px',btnClip:'none',btnF:"600 13px/1 'Unbounded',sans-serif",btnTrack:'.1em',btnCase:'uppercase',btnShadow:`0 0 0 1px ${A},0 14px 40px -12px ${A}`,
  linkF:"600 15px/1 'Hanken Grotesk',sans-serif",dev:'rgba(0,0,0,.85)',
  bdL:'80%',bdT:'-2%',bdW:'13%',bdH:'19%',bdBg:'radial-gradient(circle at 35% 30%,#fff 0,#E6CDF4 26%,#B3C6FF 58%,#8FE9FF 100%)',bdR:'999px',bdShadow:'0 0 60px rgba(143,233,255,.45),0 0 120px rgba(196,184,255,.3)',
  b2L:'-6%',b2T:'70%',b2W:'5%',b2H:'7.4%',b2Bg:'radial-gradient(circle at 35% 30%,#fff 0,#E6CDF4 30%,#8FE9FF 100%)',b2R:'999px',b2Shadow:'0 0 30px rgba(143,233,255,.5)'}),
 bold:(A:string,T:string)=>({bg:`repeating-linear-gradient(135deg,rgba(233,236,241,.028) 0 1px,transparent 1px 16px),radial-gradient(50% 60% at 72% 45%,${A}22,transparent 70%),linear-gradient(180deg,#111418,#0C0F12)`,text:'#E9ECF1',body:'#B5BDC9',muted:'#8B95A5',hair:'#2E3642',panel:'#181C22',panelR:'0',panelClip:'polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,0 100%)',
  fd:"'Sofia Sans Extra Condensed','Arial Narrow',sans-serif",fdw:'800',fcase:'uppercase',ftrack:'.005em',tsize:'clamp(64px,7vw,104px)',tlh:'.86',fv:"'Barlow',sans-serif",fvStyle:'normal',fvw:'500',tagSize:'20px',fb:"'Barlow',sans-serif",numSize:'40px',
  emF:"'Sofia Sans Extra Condensed',sans-serif",emStyle:'normal',emW:'800',emCase:'uppercase',eyeF:"500 11.5px/1 'IBM Plex Mono',monospace",eyeTrack:'.12em',eyeColor:'#A9B2C0',markW:'18px',markH:'12px',markBg:A,markClip:'polygon(0 0,70% 0,100% 50%,70% 100%,0 100%,25% 50%)',
  labelF:"500 10.5px/1.2 'IBM Plex Mono',monospace",labelTrack:'.12em',btnBg:A,btnColor:'#111418',btnR:'0',btnClip:'polygon(0 0,calc(100% - 16px) 0,100% 50%,calc(100% - 16px) 100%,0 100%)',btnPadR:'44px',btnF:"600 17px/1 'Barlow',sans-serif",btnTrack:'.06em',btnCase:'uppercase',
  linkF:"500 13px/1 'IBM Plex Mono',monospace",linkTrack:'.12em',linkCase:'uppercase',swR:'0',chipR:'0',btnFam:"'Barlow',sans-serif",nowBg:'#0A0C0F',nowColor:'#A9B2C0',nowMark:A,nowF:"500 10px/1 'IBM Plex Mono',monospace",numFam:"'IBM Plex Mono',monospace",mailH:'13cqw',spotH:'16cqw',mockR:'0',mockClip:'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%)',dev:'rgba(0,0,0,.9)',mockNavF:"500 1.2cqw/1 'IBM Plex Mono',monospace",mockEyeF:"500 1.2cqw/1 'IBM Plex Mono',monospace",mockEyeColor:'#A9B2C0',mockH:'7.6cqw',
  bdL:'4%',bdT:'6%',bdW:'92%',bdH:'88%',bdBg:`linear-gradient(135deg,${A}2E,${A}06 60%)`,bdClip:'polygon(0 0,calc(100% - 70px) 0,100% 70px,100% 100%,0 100%)',
  b2L:'4%',b2T:'94%',b2W:'38%',b2H:'6px',b2Bg:A,b2Shadow:'none'}),
 wildheart:(A:string,T:string)=>({bg:`radial-gradient(50% 60% at 76% 30%,${A}1C,transparent 70%),radial-gradient(45% 55% at 0% 100%,rgba(235,211,200,.75),transparent 70%),linear-gradient(180deg,#F5EEE2,#EEE3D1)`,text:'#3A2E29',body:'#55463E',muted:'#6E5F55',hair:'#E2D6C3',panel:'linear-gradient(160deg,#FBF7EF,#F7F0E4)',panelR:'24px 24px 6px 24px',panelClip:'none',panelShadow:'0 18px 40px -28px rgba(58,46,41,.35)',
  fd:"'IM Fell English',Georgia,serif",fdw:'400',fcase:'none',ftrack:'-0.005em',tsize:'clamp(50px,5.4vw,76px)',fv:"'IM Fell English',Georgia,serif",fvStyle:'italic',tagSize:'23px',fb:"'EB Garamond',Georgia,serif",bodySize:'17px',numSize:'34px',
  emF:"'IM Fell English',Georgia,serif",emStyle:'italic',eyeF:"600 11px/1 'Hanken Grotesk',sans-serif",eyeTrack:'.18em',eyeColor:T,markText:'✦︎',markW:'auto',markH:'auto',
  labelF:"600 10.5px/1.2 'Hanken Grotesk',sans-serif",labelTrack:'.16em',btnBg:`linear-gradient(160deg,color-mix(in oklab,${A} 70%,#fff),${A} 60%,color-mix(in oklab,${A} 80%,#2E2138))`,btnColor:'#FBF7EF',btnR:'999px',btnClip:'none',btnF:"500 19px/1 'EB Garamond',Georgia,serif",btnTrack:'.01em',btnCase:'none',btnShadow:`0 14px 30px -14px ${A}`,
  linkF:"500 17px/1 'EB Garamond',Georgia,serif",btnFam:"'EB Garamond',Georgia,serif",nowBg:'linear-gradient(90deg,#2E2138,#3A2A48)',nowColor:'#EBD3C8',nowMark:'#C7ADE8',nowF:"600 10px/1 'Hanken Grotesk',sans-serif",numFam:"'IM Fell English',Georgia,serif",mailH:'10cqw',spotH:'13cqw',mockR:'10px 10px 3px 10px',mockClip:'none',grain:.22,blend:'multiply',dev:'rgba(58,46,41,.45)',mockNavF:"500 1.4cqw/1 'EB Garamond',serif",mockEyeF:"600 1.1cqw/1 'Hanken Grotesk',sans-serif",mockEyeColor:T,mockH:'6.6cqw',photoFilter:'sepia(.18) saturate(.9)',
  bdL:'8%',bdT:'3%',bdW:'84%',bdH:'94%',bdBg:'radial-gradient(60% 60% at 50% 40%,rgba(251,247,239,.95),rgba(235,211,200,.5) 70%,transparent)',bdR:'42% 42% 8% 42%',
  b2L:'86%',b2T:'4%',b2W:'auto',b2H:'auto',b2Bg:'none'}),
 network:(A:string,T:string)=>({bg:`repeating-radial-gradient(ellipse 160% 70% at 20% 130%,transparent 0 54px,rgba(34,48,58,.05) 54px 55px),#FCF9EE`,text:'#22303A',body:'#3E4A52',muted:'#5A6066',hair:'#E7E1C8',panel:'#FFFEF8',panelR:'28px',panelClip:'none',panelShadow:'0 20px 40px -30px rgba(34,48,58,.35)',
  fd:"'Bricolage Grotesque',sans-serif",fdw:'700',fcase:'none',ftrack:'-0.045em',tsize:'clamp(46px,4.8vw,68px)',fv:"'Instrument Serif',serif",fvStyle:'italic',tagSize:'25px',fb:"'Outfit',sans-serif",numSize:'32px',
  emF:"'Instrument Serif',serif",emStyle:'italic',eyeF:"500 13px/1 'Outfit',sans-serif",eyeTrack:'0',eyeColor:'#5A6066',markW:'8px',markH:'8px',markBg:A,markR:'999px',
  labelF:"500 12.5px/1.2 'Outfit',sans-serif",labelTrack:'0',labelCase:'none',btnBg:A,btnColor:onA(A,'#1F3440','#FFFFFF'),btnR:'999px',btnClip:'none',btnF:"500 18px/1 'Outfit',sans-serif",btnTrack:'0',btnCase:'none',btnShadow:'0 14px 28px -16px rgba(34,48,58,.5)',
  linkF:"500 16px/1 'Outfit',sans-serif",grain:.06,blend:'multiply',dev:'rgba(34,48,58,.4)',
  bdL:'7%',bdT:'5%',bdW:'86%',bdH:'90%',bdBg:A,bdR:'40px'}),
 temple:(A:string,T:string)=>({bg:`radial-gradient(40% 50% at 12% 18%,rgba(255,255,255,.6),transparent 70%),radial-gradient(50% 60% at 88% 84%,${A}14,transparent 70%),linear-gradient(180deg,#F8F0E2,#F1E4CF)`,text:'#35251A',body:'#5A4636',muted:'#7A604B',hair:'rgba(35,23,16,.12)',panel:'#FFFCF4',panelR:'16px',panelClip:'none',panelShadow:'0 18px 40px -30px rgba(53,37,26,.4)',
  fd:"'Marcellus',serif",fdw:'400',fcase:'none',ftrack:'-0.015em',tsize:'clamp(50px,5.4vw,76px)',fv:"'Cormorant Garamond',serif",fvStyle:'italic',fvw:'500',tagSize:'26px',fb:"'Jost',sans-serif",numSize:'32px',
  emF:"'Cormorant Garamond',serif",emStyle:'italic',emW:'500',eyeF:"500 11px/1 'Jost',sans-serif",eyeTrack:'.22em',eyeColor:T,
  labelF:"500 10.5px/1.2 'Jost',sans-serif",labelTrack:'.18em',btnBg:A,btnColor:onA(A,'#231710','#FFFFFF'),btnR:'999px',btnClip:'none',btnF:"600 14px/1 'Jost',sans-serif",btnTrack:'.16em',btnCase:'uppercase',btnShadow:`0 14px 28px -16px ${A}`,
  linkF:"500 13px/1 'Jost',sans-serif",linkTrack:'.16em',linkCase:'uppercase',grain:.16,blend:'multiply',dev:'rgba(53,37,26,.45)',
  bdL:'13%',bdT:'-2%',bdW:'74%',bdH:'104%',bdBg:'linear-gradient(180deg,#FDFAF3,#F0E2CB)',bdR:'50% 50% 16px 16px / 34% 34% 16px 16px',bdShadow:'inset 0 0 0 1px rgba(35,23,16,.08)'}),
 cyberwitch:(A:string,T:string,a:Any)=>({bg:`radial-gradient(40% 55% at 78% 30%,color-mix(in oklab,${A} 22%,transparent),transparent 70%),radial-gradient(30% 40% at 12% 88%,color-mix(in oklab,${a.clash} 12%,transparent),transparent 70%),repeating-linear-gradient(45deg,rgba(236,232,223,.045) 0 1px,transparent 1px 26px),repeating-linear-gradient(-45deg,rgba(236,232,223,.045) 0 1px,transparent 1px 26px),linear-gradient(172deg,rgba(236,232,223,.04),transparent 38%),linear-gradient(8deg,rgba(5,7,8,.55),transparent 45%),#0D1112`,
  text:'#ECE8DF',body:'#BDB8AD',muted:'#9A9F9B',hair:'rgba(236,232,223,.14)',panel:'linear-gradient(180deg,rgba(236,232,223,.03),transparent 40%),#141A1B',panelR:'0',panelClip:'none',panelShadow:'inset 0 -24px 40px -28px rgba(0,0,0,.7),0 2px 0 rgba(0,0,0,.55),0 18px 32px -18px rgba(0,0,0,.8)',rivets:RIV('rgba(236,232,223,.26)'),
  fd:"'UnifrakturCook','Old English Text MT',serif",fdw:'700',fcase:'none',ftrack:'0',tsize:'clamp(58px,6.2vw,92px)',tlh:'.95',titleShadow:'0 2px 0 rgba(0,0,0,.6),0 8px 24px rgba(0,0,0,.7)',numShadow:'0 2px 0 rgba(0,0,0,.6)',
  fv:"'Spectral',Georgia,serif",fvStyle:'italic',tagSize:'21px',fb:"'Spectral',Georgia,serif",bodySize:'16px',numSize:'36px',
  emF:"'Permanent Marker',cursive",emStyle:'normal',emCase:'uppercase',emGlow:`0 0 1px #fff,0 0 6px ${A},0 0 20px color-mix(in oklab,${A} 40%,transparent)`,
  eyeF:"600 11px/1 'Spectral',Georgia,serif",eyeTrack:'.16em',eyeColor:'#0D1112',eyeBg:'#ECE8DF',eyePad:'7px 13px 6px',eyeRot:'-1.5deg',eyeClip:'polygon(0 6%,2% 0,98% 4%,100% 0,99% 100%,1% 94%)',
  markW:'7px',markH:'7px',markBg:A,markR:'999px',
  labelF:"600 10.5px/1.2 'Spectral',Georgia,serif",labelTrack:'.16em',btnBg:A,btnColor:'#0D1112',btnR:'0',btnClip:'polygon(1.5% 9%,98.5% 0,100% 88%,2.5% 100%)',btnRot:'-1.2deg',btnF:"400 21px/1 'Permanent Marker',cursive",btnTrack:'.02em',btnCase:'uppercase',
  btnFilter:`drop-shadow(0 0 10px color-mix(in oklab,${A} 30%,transparent)) drop-shadow(2px 3px 0 rgba(0,0,0,.7))`,
  linkF:"600 13px/1 'Spectral',Georgia,serif",linkTrack:'.16em',linkCase:'uppercase',swR:'2px',chipR:'0',grain:.11,dev:'#000',
  bdL:'-6%',bdT:'60%',bdW:'112%',bdH:'3px',bdBg:'#FFFFFF',bdR:'3px',bdShadow:`0 0 4px #fff,0 0 10px ${A},0 0 28px ${A},0 0 70px color-mix(in oklab,${A} 55%,transparent)`,
  b2L:'94%',b2T:'-4%',b2W:'3px',b2H:'70%',b2Bg:'#FFFFFF',b2R:'3px',b2Shadow:`0 0 4px #fff,0 0 10px ${A},0 0 28px ${A},0 0 70px color-mix(in oklab,${A} 55%,transparent)`}),
 services:(A:string,T:string,a:Any)=>({bg:`radial-gradient(50% 60% at 74% 36%,${A}30,transparent 70%),radial-gradient(40% 50% at 8% 92%,${a.g3}22,transparent 70%),radial-gradient(30% 40% at 92% 96%,${a.g2}1A,transparent 70%),linear-gradient(180deg,#0B0F13,#0E141A)`,text:'#F5F6F7',body:'#D3D9DE',muted:'#9AA3AC',hair:'#222B34',panel:'linear-gradient(150deg,rgba(255,255,255,.045),transparent 50%),#10161B',panelR:'20px',panelClip:'none',panelShadow:'0 24px 44px -28px rgba(0,0,0,.7)',
  fd:"'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif",fstretch:'80%',fdw:'800',fcase:'uppercase',ftrack:'-0.02em',tsize:'clamp(58px,6.4vw,92px)',tlh:'.88',fv:"'Lora',Georgia,serif",fvStyle:'italic',tagSize:'22px',fb:"'Bricolage Grotesque',sans-serif",bodySize:'16px',numSize:'38px',
  emF:"'Lora',Georgia,serif",emStyle:'italic',eyeF:"400 11px/1 'DM Mono',monospace",eyeTrack:'.14em',eyeColor:T,markW:'7px',markH:'7px',markBg:A,markR:'999px',markGlow:`0 0 10px ${A},0 0 24px ${A}`,
  labelF:"400 10.5px/1.2 'DM Mono',monospace",labelTrack:'.14em',btnBg:`linear-gradient(180deg,color-mix(in oklab,${A} 88%,#fff),${A})`,btnColor:'#FFFFFF',btnR:'999px',btnClip:'none',btnF:"700 15px/1 'Bricolage Grotesque',sans-serif",btnTrack:'.04em',btnCase:'uppercase',btnShadow:`0 16px 36px -14px ${A},inset 0 1px 0 rgba(255,255,255,.3)`,
  linkF:"600 15px/1 'Bricolage Grotesque',sans-serif",grain:.1,dev:'#000',
  bdL:'74%',bdT:'-6%',bdW:'24%',bdH:'35%',bdBg:`radial-gradient(circle at 34% 30%,${a.deep} 0,${A} 42%,${a.g2} 72%,transparent 73%)`,bdR:'999px',bdOp:'.5',bdShadow:`0 0 120px ${A}66`,
  b2L:'-4%',b2T:'72%',b2W:'9%',b2H:'13%',b2Bg:`radial-gradient(circle at 34% 30%,#fff 0,${a.g3} 55%,transparent 56%)`,b2R:'999px',b2Shadow:`0 0 40px ${a.g3}88`}),
 nocturne:(A:string,T:string)=>({bg:`radial-gradient(38% 55% at 68% -4%,${A}38,transparent 70%),radial-gradient(60% 50% at 50% 110%,rgba(237,232,223,.04),transparent 70%),#050505`,text:'#EDE8DF',body:'#C4BFB6',muted:'#9A958C',hair:'#262626',panel:'#0B0B0B',panelR:'0',panelClip:'none',
  fd:"'Bodoni Moda',serif",fdw:'400',fcase:'none',ftrack:'-0.01em',tsize:'clamp(52px,5.6vw,80px)',fv:"'Bodoni Moda',serif",fvStyle:'italic',tagSize:'23px',fb:"'Geist',sans-serif",numSize:'34px',
  emF:"'Bodoni Moda',serif",emStyle:'italic',eyeF:"500 11px/1 'Geist',sans-serif",eyeTrack:'.22em',eyeColor:'#EDE8DF',markText:'✧',markW:'auto',markH:'auto',
  labelF:"500 10.5px/1.2 'Geist',sans-serif",labelTrack:'.18em',btnBg:'#EDE8DF',btnColor:'#050505',btnR:'0',btnClip:'none',btnF:"500 13px/1 'Geist',sans-serif",btnTrack:'.18em',btnCase:'uppercase',btnShadow:`0 0 40px -8px ${A}66`,
  linkF:"500 12.5px/1 'Geist',sans-serif",linkTrack:'.18em',linkCase:'uppercase',swR:'0',chipR:'0',grain:.14,dev:'#000',
  bdL:'10%',bdT:'-3%',bdW:'80%',bdH:'106%',bdBg:'linear-gradient(180deg,#0E0E0E,#050505 70%)',bdR:'50% 50% 0 0 / 28% 28% 0 0',bdShadow:'inset 0 0 0 1px #1F1F1F'}),
 designer:(A:string,T:string)=>({bg:`radial-gradient(45% 55% at 82% 28%,rgba(255,255,255,.65),transparent 70%),radial-gradient(40% 50% at 8% 90%,${A}14,transparent 70%),linear-gradient(180deg,#F7F3EC,#EEE6D8)`,text:'#343736',body:'#4A4D4B',muted:'#5F625F',hair:'#DAD0BF',panel:'#FBF8F2',panelR:'4px',panelClip:'none',panelShadow:'0 18px 40px -30px rgba(52,55,54,.4)',
  fd:"'Cormorant',serif",fdw:'500',fcase:'none',ftrack:'-0.01em',tsize:'clamp(54px,5.8vw,84px)',tlh:'.95',fv:"'Cormorant',serif",fvStyle:'italic',fvw:'500',tagSize:'26px',fb:"'Jost',sans-serif",numSize:'36px',
  emF:"'Cormorant',serif",emStyle:'italic',emW:'500',eyeF:"500 11px/1 'Jost',sans-serif",eyeTrack:'.22em',eyeColor:'#343736',markW:'28px',markH:'1px',markBg:'#5F625F',
  labelF:"500 10.5px/1.2 'Jost',sans-serif",labelTrack:'.18em',btnBg:'#2F302E',btnColor:'#F7F3EC',btnR:'6px',btnClip:'none',btnF:"500 14px/1 'Jost',sans-serif",btnTrack:'.18em',btnCase:'uppercase',btnShadow:'0 14px 28px -16px rgba(47,48,46,.6)',
  linkF:"500 13px/1 'Jost',sans-serif",linkTrack:'.18em',linkCase:'uppercase',swR:'999px',chipR:'4px',grain:.12,blend:'multiply',dev:'rgba(52,55,54,.45)',
  bdL:'9%',bdT:'4%',bdW:'82%',bdH:'92%',bdBg:'#EFE8DC',bdR:'4px',bdShadow:'inset 0 0 0 1px #DAD0BF,inset 0 0 0 10px #F4EEE4,inset 0 0 0 11px #E3DACB'})
};

export const DOTS=(c:string,pts:number[][])=>pts.map(([x,y,r])=>`radial-gradient(circle at ${x}% ${y}%,${c} 0 ${r}px,transparent ${r+.6}px)`).join(',');
export const CORNERS=(c:string)=>[['0 0','14px 1px'],['0 0','1px 14px'],['100% 0','14px 1px'],['100% 0','1px 14px'],['0 100%','14px 1px'],['0 100%','1px 14px'],['100% 100%','14px 1px'],['100% 100%','1px 14px']].map(([p,s]: string[])=>`linear-gradient(${c},${c}) ${p}/${s} no-repeat`).join(',');
export const DECO: Record<string,(A:string,a:Any)=>Any>={
 'new-world':(A:string)=>({num:{c:'transparent',st:'1px rgba(242,245,250,.07)'},layers:[
  {s:'text',x:'68%',y:'50%',w:'min(980px,70vw)',ar:'1',bd:'1px dashed rgba(242,245,250,.10)',rad:'999px',cen:1},
  {s:'text',x:'68%',y:'50%',w:'min(640px,46vw)',ar:'1',bd:'1px dashed rgba(242,245,250,.08)',rad:'999px',cen:1},
  {s:'full',x:'0',y:'calc(100% - 1px)',w:'100%',h:'1px',bg:`linear-gradient(90deg,transparent,${A},transparent)`,op:'.55'}]}),
 bold:(A:string)=>({num:{c:'transparent',st:'1px rgba(233,236,241,.08)'},layers:[
  {s:'cloud',x:'18%',y:'-30%',w:'11%',h:'170%',bg:`${A}12`,tf:'rotate(24deg)'},
  {s:'full',x:'1.5%',y:'4%',w:'97%',h:'92%',bg:CORNERS('rgba(139,149,165,.6)')},
  {s:'full',x:'0',y:'calc(100% - 8px)',w:'100%',h:'8px',bg:`repeating-linear-gradient(135deg,${A} 0 10px,transparent 10px 22px)`,op:'.4'}]}),
 wildheart:(A:string)=>({num:{c:'rgba(101,69,144,.06)',st:'0'},layers:[
  {s:'text',x:'68%',y:'50%',w:'min(820px,60vw)',ar:'1',rad:'999px',bd:'1.5px solid rgba(101,69,144,.16)',bg:'repeating-conic-gradient(from 0deg,rgba(101,69,144,.32) 0 .5deg,transparent .5deg 30deg)',mask:'radial-gradient(closest-side,transparent 91%,#000 91.5%)',cen:1},
  {s:'text',x:'68%',y:'50%',w:'min(600px,44vw)',ar:'1',rad:'999px',bd:'1px dashed rgba(101,69,144,.16)',cen:1},
  {s:'cloud',x:'5%',y:'8%',w:'54px',ar:'1',rad:'999px',sh:'inset 14px -8px 0 0 rgba(101,69,144,.34)',tf:'rotate(-20deg)'},
  {s:'full',x:'0',y:'0',w:'100%',h:'100%',bg:DOTS('rgba(101,69,144,.4)',[[8,14,1.4],[22,82,1],[36,8,1.2],[47,92,1.6],[58,6,1],[71,88,1.2],[83,12,1.6],[92,70,1],[15,48,1],[96,30,1.3],[64,96,1],[3,90,1.2]])}]}),
 network:(A:string)=>({num:{c:'rgba(34,48,58,.05)',st:'0'},layers:[
  {s:'full',x:'0',y:'84%',w:'100%',h:'16%',bg:'#F3EFDA',op:'.7'},
  {s:'text',x:'-8%',y:'72%',w:'48%',h:'26%',rad:'999px',bd:`1.5px solid ${A}66`},
  {s:'cloud',x:'3%',y:'6%',w:'72px',ar:'1',rad:'999px',bg:A,sh:`0 0 0 10px ${A}22,0 0 0 22px ${A}12`}]}),
 temple:(A:string)=>({num:{c:'rgba(156,74,44,.06)',st:'0'},layers:[
  {s:'cloud',x:'4%',y:'-16%',w:'380px',ar:'1',rad:'999px',bg:'radial-gradient(closest-side,rgba(255,255,255,.75),transparent)'},
  {s:'text',x:'-3%',y:'52%',w:'20%',h:'60%',bd:'1px solid rgba(35,23,16,.12)',rad:'50% 50% 0 0 / 30% 30% 0 0'},
  {s:'text',x:'19%',y:'60%',w:'16%',h:'50%',bd:'1px solid rgba(35,23,16,.09)',rad:'50% 50% 0 0 / 30% 30% 0 0'},
  {s:'full',x:'0',y:'calc(100% - 1px)',w:'100%',h:'1px',bg:'rgba(35,23,16,.12)'}]}),
 cyberwitch:(A:string,a:Any)=>({num:{c:'transparent',st:`1px color-mix(in oklab,${A} 22%,transparent)`},layers:[
  {s:'full',x:'0',y:'0',w:'100%',h:'100%',bg:'radial-gradient(120% 90% at 50% 40%,transparent 45%,rgba(5,7,8,.85) 100%)'},
  {s:'full',x:'0',y:'84%',w:'100%',h:'16%',bg:'repeating-linear-gradient(90deg,rgba(236,232,223,.10) 0 2px,transparent 2px 42px),linear-gradient(180deg,transparent,rgba(0,0,0,.55))'},
  {s:'text',x:'-1%',y:'5%',w:'230px',h:'30px',bg:'rgba(236,232,223,.14)',tf:'rotate(-7deg)',mask:'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)'},
  {s:'cloud',x:'6%',y:'84%',w:'120px',ar:'1',rad:'999px',bg:`radial-gradient(closest-side,color-mix(in oklab,${a.clash} 30%,transparent),transparent)`}]}),
 services:(A:string,a:Any)=>({num:{c:'transparent',st:'1px rgba(245,246,247,.07)'},layers:[
  {s:'text',x:'-12%',y:'56%',w:'52%',h:'70%',rad:'999px',bg:`radial-gradient(closest-side,${a.g3}24,transparent)`},
  {s:'full',x:'0',y:'0',w:'100%',h:'100%',bg:DOTS(A,[[58,14,1.4],[66,82,1],[88,22,1.6],[94,64,1],[50,92,1.2],[78,8,1]]),op:'.8'},
  {s:'full',x:'0',y:'calc(100% - 1px)',w:'100%',h:'1px',bg:`linear-gradient(90deg,transparent,${A},transparent)`,op:'.6'}]}),
 nocturne:(A:string)=>({num:{c:'transparent',st:'1px rgba(237,232,223,.07)'},layers:[
  {s:'full',x:'2%',y:'4%',w:'96%',h:'92%',bd:'1px solid #191919'},
  {s:'cloud',x:'6%',y:'9%',w:'44px',ar:'1',rad:'999px',sh:`inset 10px -6px 0 0 #EDE8DF,0 0 40px -6px ${A}`,op:'.75',tf:'rotate(-18deg)'},
  {s:'full',x:'0',y:'0',w:'100%',h:'100%',bg:DOTS('rgba(237,232,223,.55)',[[6,12,1],[18,30,.8],[29,6,1.2],[44,18,.8],[55,9,1],[66,24,.8],[78,5,1.2],[88,16,.9],[95,40,1],[12,88,.8],[40,94,1],[72,90,.8]]),op:'.7'}]}),
 designer:(A:string)=>({num:{c:'rgba(52,55,54,.045)',st:'0'},layers:[
  {s:'cloud',x:'6%',y:'-12%',w:'46%',h:'124%',bg:'repeating-linear-gradient(115deg,rgba(255,255,255,.4) 0 60px,transparent 60px 150px)',mask:'linear-gradient(180deg,#000,transparent 85%)',op:'.7'},
  {s:'full',x:'1.5%',y:'3%',w:'97%',h:'94%',bd:'1px solid #DAD0BF',sh:'inset 0 0 0 6px transparent,inset 0 0 0 7px #E6DDCD'},
  {s:'cloud',x:'4%',y:'82%',w:'88px',ar:'1',rad:'999px',bd:`1px solid ${A}66`,sh:`inset 0 0 0 6px #F3EDE3,inset 0 0 0 7px ${A}33`}]})
};
export const resolveDeco=(id:string,A:string,a:Any,flip:boolean)=>{const D=DECO[id](A,a);const lay=D.layers.map((L: Any)=>{const fromLeft=L.s==='full'||(L.s==='text'&&!flip)||(L.s==='cloud'&&flip);const tf0=L.cen?(fromLeft?'translate(-50%,-50%)':'translate(50%,-50%)'):'';
  return {l:fromLeft?L.x:'auto',r:fromLeft?'auto':L.x,t:L.y,w:L.w,h:L.h||'auto',ar:L.ar||'auto',bg:L.bg||'none',bd:L.bd||'0 solid transparent',rad:L.rad||'0',sh:L.sh||'none',op:L.op||'1',tf:(tf0+' '+(L.tf||'')).trim()||'none',mask:L.mask||'none'}});
  return {num:{c:D.num.c,st:D.num.st,t:'-3%',l:flip?'auto':'-1%',r:flip?'-1%':'auto'},layers:lay}};
