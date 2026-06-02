#!/usr/bin/env python3
import math, cairosvg, os

W, H = 1600, 1980
C = (800, 968)
R = 335

# palette (DAWN tokens)
SAND="#F7F3EA"; INK="#1E1A13"; MUT="#6B6253"; SUB="#8F8675"
BORD="#E9E1D4"; BORDS="#D8CDBB"; SURF="#FFFFFF"; ELEV="#FCFAF5"
AMBER="#E2912F"; AMBERS="#9A5E12"; AMBERBG="#FBEFD9"
TEAL="#1E9E89"; TEALS="#0F6657"; TEALBG="#DDF1ED"

S=[]
def add(x): S.append(x)
def esc(t): return t.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def text(x,y,t,size,fam,color,anchor="middle",ls=None,op=1):
    a=f' letter-spacing="{ls}"' if ls else ''
    o=f' opacity="{op}"' if op!=1 else ''
    return f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" fill="{color}" text-anchor="{anchor}"{a}{o}>{esc(t)}</text>'

ICON={
 "users":'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 "pin":'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 "zap":'<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
 "trend":'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
 "book":'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
 "userplus":'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
 "pencil":'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
 "branch":'<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
 "bell":'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
 "target":'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
 "heart":'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3 5.5 5.5 0 0 0 12 5.5 5.5 5.5 0 0 0 7.5 3 5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>',
 "spark":'<path d="M12 3l1.7 5.1a3 3 0 0 0 1.9 1.9L21 12l-5.4 1.7a3 3 0 0 0-1.9 1.9L12 21l-1.7-5.4a3 3 0 0 0-1.9-1.9L3 12l5.4-1.7a3 3 0 0 0 1.9-1.9Z"/>',
}
def icon(name,cx,cy,size,color,sw=2.0,fill="none",op=1):
    s=size/24.0; o=f' opacity="{op}"' if op!=1 else ''
    return (f'<g transform="translate({cx-size/2:.2f},{cy-size/2:.2f}) scale({s:.4f})" '
            f'fill="{fill}" stroke="{color}" stroke-width="{sw/s:.2f}" '
            f'stroke-linecap="round" stroke-linejoin="round"{o}>{ICON[name]}</g>')

def pos(a,r):
    rad=math.radians(a); return (C[0]+r*math.cos(rad), C[1]+r*math.sin(rad))

# ---------- defs ----------
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add(f'''<defs>
 <radialGradient id="bgA" cx="50%" cy="16%" r="60%">
   <stop offset="0%" stop-color="{AMBER}" stop-opacity="0.06"/><stop offset="100%" stop-color="{AMBER}" stop-opacity="0"/></radialGradient>
 <radialGradient id="bgT" cx="50%" cy="50%" r="40%">
   <stop offset="0%" stop-color="{TEAL}" stop-opacity="0.05"/><stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/></radialGradient>
 <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
   <stop offset="0%" stop-color="{AMBER}" stop-opacity="0.12"/>
   <stop offset="60%" stop-color="{TEAL}" stop-opacity="0.05"/>
   <stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/></radialGradient>
 <linearGradient id="thread" x1="0%" y1="0%" x2="100%" y2="100%">
   <stop offset="0%" stop-color="{AMBER}"/><stop offset="100%" stop-color="{TEAL}"/></linearGradient>
 <radialGradient id="aiNode" cx="50%" cy="50%" r="50%">
   <stop offset="0%" stop-color="{TEAL}" stop-opacity="0.30"/><stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/></radialGradient>
</defs>''')

# background
add(f'<rect width="{W}" height="{H}" fill="{SAND}"/>')
add(f'<rect width="{W}" height="{H}" fill="url(#bgA)"/>')
add(f'<rect width="{W}" height="{H}" fill="url(#bgT)"/>')

# ---------- header ----------
ew=400; ex=W/2-ew/2; ey=66
add(f'<rect x="{ex}" y="{ey}" width="{ew}" height="46" rx="23" fill="{AMBERBG}" fill-opacity="0.55" stroke="{AMBER}" stroke-opacity="0.22"/>')
add(f'<circle cx="{ex+34}" cy="{ey+23}" r="5.5" fill="{AMBER}" opacity="0.7"/>')
add(text(W/2+12, ey+31, "THE AI LAYER, WOVEN IN", 21, "NunitoW700", AMBERS, ls="2", op=0.75))
add(text(W/2, 236, "WOVEN THROUGH", 98, "Anton", INK, op=0.55))
add(text(W/2, 342, "EVERYTHING YOU DO", 98, "Anton", INK, op=0.55))
add(text(W/2, 416, "AI runs the busy work underneath every part of Frequency — so momentum keeps", 27, "NunitoW600", MUT, op=0.7))
add(text(W/2, 452, "building and you spend your time with people, not paperwork.", 27, "NunitoW600", MUT, op=0.7))

# ---------- verticals ----------
verts=[
 (-90, "COMMUNITY", ["Circles gather around","shared Interests"], "users", TEAL, TEALBG),
 (-30, "GATHERINGS", ["Real-world events,","verified by showing up"], "pin", AMBER, AMBERBG),
 ( 30, "THE GAME", ["Zaps, ranks & streaks","build momentum"], "zap", "#B5566F", "#F6E3E8"),
 ( 90, "STUDIO", ["See who's thriving —","and who's drifting"], "trend", "#4E7BA6", "#E3EDF6"),
 (150, "PROGRAMS", ["Frameworks to start,","run & grow circles"], "book", "#5A6BB0", "#E6E8F5"),
 (210, "GROWTH", ["Beta funnel & partners","bring new people in"], "userplus", "#5E9E5A", "#E8F1E4"),
]

# faint center -> branch threads (AI core feeding outward)
for (a,*_r) in verts:
    x1,y1=pos(a,150); x2,y2=pos(a,255)
    add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="url(#thread)" stroke-width="2" stroke-linecap="round" opacity="0.22"/>')

# ---------- dynamic branch -> branch arrows with AI connector nodes ----------
def arrowhead(px,py,ang,col,op):
    return (f'<g transform="translate({px:.1f},{py:.1f}) rotate({ang:.1f})">'
            f'<path d="M -9 -8 L 7 0 L -9 8" fill="none" stroke="{col}" stroke-width="3" '
            f'stroke-linecap="round" stroke-linejoin="round" opacity="{op}"/></g>')
for (a,*_r) in verts:
    sa=a+19; ea=a+41; ap=a+30
    P1=pos(sa,R+40); P2=pos(ea,R+40); AP=pos(ap,R+108)
    add(f'<path d="M {P1[0]:.1f} {P1[1]:.1f} Q {AP[0]:.1f} {AP[1]:.1f} {P2[0]:.1f} {P2[1]:.1f}" '
        f'fill="none" stroke="url(#thread)" stroke-width="3" stroke-linecap="round" opacity="0.5"/>')
    head_ang=math.degrees(math.atan2(P2[1]-AP[1], P2[0]-AP[0]))
    add(arrowhead(P2[0],P2[1],head_ang,AMBER,0.6))
    # AI connector node at the apex
    add(f'<circle cx="{AP[0]:.1f}" cy="{AP[1]:.1f}" r="22" fill="url(#aiNode)"/>')
    add(f'<circle cx="{AP[0]:.1f}" cy="{AP[1]:.1f}" r="12" fill="{SURF}" fill-opacity="0.7" stroke="{TEAL}" stroke-opacity="0.5"/>')
    add(icon("spark", AP[0], AP[1], 13, TEAL, 1.8, op=0.8))

# ---------- vertical cards (light / faded) ----------
cw,ch=284,138
for (a,title,desc,ic,acc,accbg) in verts:
    cx,cy=pos(a,R); L=cx-cw/2; T=cy-ch/2
    add(f'<rect x="{L}" y="{T}" width="{cw}" height="{ch}" rx="26" fill="{SURF}" fill-opacity="0.5" stroke="{BORDS}" stroke-opacity="0.7" stroke-width="1.2"/>')
    add(f'<rect x="{L}" y="{T}" width="{cw}" height="5" rx="2.5" fill="{acc}" opacity="0.45"/>')
    add(f'<circle cx="{L+52}" cy="{T+54}" r="26" fill="{accbg}" fill-opacity="0.6"/>')
    add(icon(ic, L+52, T+54, 28, acc, 1.9, op=0.8))
    add(text(L+92, T+62, title, 27, "NunitoW800", INK, anchor="start", ls="0.3", op=0.72))
    add(text(L+28, T+98, desc[0], 17.5, "NunitoW600", MUT, anchor="start", op=0.72))
    add(text(L+28, T+121, desc[1], 17.5, "NunitoW600", MUT, anchor="start", op=0.72))

# ---------- center core (coach + members) ----------
add(f'<circle cx="{C[0]}" cy="{C[1]}" r="215" fill="url(#coreGlow)"/>')
add(f'<circle cx="{C[0]}" cy="{C[1]}" r="134" fill="{SURF}" fill-opacity="0.55" stroke="{AMBER}" stroke-opacity="0.4" stroke-width="2"/>')
add(f'<circle cx="{C[0]}" cy="{C[1]+4}" r="134" fill="none" stroke="{TEAL}" stroke-opacity="0.16" stroke-width="2"/>')
add(icon("users", C[0], C[1]-46, 58, AMBER, 2.2, op=0.65))
add(icon("heart", C[0]+44, C[1]-66, 25, TEAL, 2.0, fill=TEALBG, op=0.7))
add(text(C[0], C[1]+28, "TIME", 38, "Anton", INK, op=0.6))
add(text(C[0], C[1]+62, "TOGETHER", 38, "Anton", INK, op=0.6))
add(text(C[0], C[1]+90, "more time, face to face", 15, "NunitoW600", MUT, op=0.62))

# ---------- AI foundation band (light) ----------
bx,by,bw,bh=150,1456,1300,336
add(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="40" fill="{ELEV}" fill-opacity="0.7" stroke="{BORDS}" stroke-opacity="0.65" stroke-width="1.2"/>')
add(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="40" fill="url(#bgA)" opacity="0.6"/>')
add(f'<circle cx="{bx+56}" cy="{by+56}" r="25" fill="{TEALBG}" fill-opacity="0.6"/>')
add(icon("spark", bx+56, by+56, 28, TEAL, 1.9, op=0.8))
add(text(bx+92, by+68, "THE OPERATOR", 42, "Anton", INK, anchor="start", op=0.58))
add(text(bx+372, by+66, "AI woven underneath every vertical", 23, "NunitoW700", AMBERS, anchor="start", op=0.72))
add(text(bx+40, by+114, "Watches every signal across your verticals   ·   proposes the next move   ·   you approve.   It never sends on its own.", 21, "NunitoW600", MUT, anchor="start", op=0.78))

chips=[
 ("PROMPTS","pencil",AMBER,AMBERBG,["Drafts the message","in your voice"]),
 ("WORKFLOWS","branch",TEAL,TEALBG,["Fires the right play","at the right step"]),
 ("REMINDERS","bell",AMBER,AMBERBG,["Nudges members at","just the right moment"]),
 ("AUDIENCE","target",TEAL,TEALBG,["Finds who's lapsing,","segments who to reach"]),
]
cw2=298; gap=20; startx=bx+40; cy0=by+150; ch2=150
for i,(t,ic,acc,accbg,desc) in enumerate(chips):
    L=startx+i*(cw2+gap)
    add(f'<rect x="{L}" y="{cy0}" width="{cw2}" height="{ch2}" rx="22" fill="{SURF}" fill-opacity="0.45" stroke="{BORDS}" stroke-opacity="0.6"/>')
    add(f'<circle cx="{L+44}" cy="{cy0+44}" r="21" fill="{accbg}" fill-opacity="0.65"/>')
    add(icon(ic, L+44, cy0+44, 23, acc, 1.9, op=0.8))
    add(text(L+76, cy0+52, t, 21, "NunitoW800", INK, anchor="start", ls="0.5", op=0.7))
    add(text(L+26, cy0+90, desc[0], 16, "NunitoW600", MUT, anchor="start", op=0.72))
    add(text(L+26, cy0+114, desc[1], 16, "NunitoW600", MUT, anchor="start", op=0.72))

# upward connectors band -> bottom cards
for a in (90,150,30):
    cx,cy=pos(a,R); bottom=cy+ch/2
    add(f'<line x1="{cx:.1f}" y1="{by-4}" x2="{cx:.1f}" y2="{bottom+8:.1f}" stroke="{TEAL}" stroke-width="2" stroke-dasharray="2 11" stroke-linecap="round" opacity="0.3"/>')

# ---------- footer ----------
add(text(W/2, 1884, "LESS ADMIN.  MORE PRESENCE.", 56, "Anton", INK, op=0.55))
add(f'<path d="M 575 1903 Q 800 1921 1025 1903" fill="none" stroke="{AMBER}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>')
add(text(W/2, 1948, "frequency  ·  a place to be human", 20, "NunitoW700", SUB, op=0.8))

add('</svg>')
svg="\n".join(S)
os.makedirs("/tmp/infographic",exist_ok=True)
open("/tmp/infographic/hook-ai.svg","w").write(svg)
cairosvg.svg2png(bytestring=svg.encode(), write_to="/tmp/infographic/hook-ai.png",
                 output_width=W*2, output_height=H*2, background_color=SAND)
print("OK", len(svg), os.path.getsize("/tmp/infographic/hook-ai.png"))
