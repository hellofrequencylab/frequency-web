#!/usr/bin/env python3
import math, os

W, H = 1600, 1500
C = (800, 800)
R = 330; NR = 60; COR = 90
TAN="#D8C29A"; TAN2="#C9B084"
SAND="#F7F3EA"; INK="#1E1A13"; MUT="#6B6253"; SUB="#8F8675"
BORD="#E9E1D4"; BORDS="#D8CDBB"; SURF="#FFFFFF"; ELEV="#FCFAF5"
AMBER="#E2912F"; AMBERS="#9A5E12"; AMBERBG="#FBEFD9"
TEAL="#1E9E89"; TEALS="#0F6657"; TEALBG="#DDF1ED"
ROSE="#B5566F"; ROSEBG="#F6E3E8"
CONV=TEAL; ACT=AMBER; ENER=ROSE; STREAMS=[CONV,ACT,ENER]

S=[]; D=S.append
def esc(t): return t.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
def text(x,y,t,size,fam,color,anchor="middle",ls=None,op=1,weight=None):
    a=f' letter-spacing="{ls}"' if ls else ''
    o=f' opacity="{op}"' if op!=1 else ''
    w=f' font-weight="{weight}"' if weight else ''
    return f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" fill="{color}" text-anchor="{anchor}"{w}{a}{o}>{esc(t)}</text>'
ICON={
 "users":'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
 "pin":'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 "zap":'<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
 "trend":'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
 "book":'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
 "userplus":'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
 "msg":'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
 "act":'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
 "spark":'<path d="M12 3l1.7 5.1a3 3 0 0 0 1.9 1.9L21 12l-5.4 1.7a3 3 0 0 0-1.9 1.9L12 21l-1.7-5.4a3 3 0 0 0-1.9-1.9L3 12l5.4-1.7a3 3 0 0 0 1.9-1.9Z"/>',
}
def icon(name,cx,cy,size,color,sw=2.0,fill="none",op=1):
    s=size/24.0; o=f' opacity="{op}"' if op!=1 else ''
    return (f'<g transform="translate({cx-size/2:.2f},{cy-size/2:.2f}) scale({s:.4f})" '
            f'fill="{fill}" stroke="{color}" stroke-width="{sw/s:.2f}" stroke-linecap="round" stroke-linejoin="round"{o}>{ICON[name]}</g>')
def pos(a,r):
    rad=math.radians(a); return (C[0]+r*math.cos(rad), C[1]+r*math.sin(rad))

D(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="How AI keeps the network in motion">')
D(f'''<defs>
 <radialGradient id="bgA" cx="50%" cy="14%" r="62%"><stop offset="0%" stop-color="{AMBER}" stop-opacity="0.06"/><stop offset="100%" stop-color="{AMBER}" stop-opacity="0"/></radialGradient>
 <radialGradient id="bgT" cx="50%" cy="50%" r="42%"><stop offset="0%" stop-color="{TEAL}" stop-opacity="0.05"/><stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/></radialGradient>
 <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="{TAN}" stop-opacity="0.55"/><stop offset="50%" stop-color="{TAN}" stop-opacity="0.22"/><stop offset="100%" stop-color="{TAN}" stop-opacity="0"/></radialGradient>
</defs>''')
D(f'<rect width="{W}" height="{H}" fill="{SAND}"/><rect width="{W}" height="{H}" fill="url(#bgA)"/><rect width="{W}" height="{H}" fill="url(#bgT)"/>')

# header
ew=470; ex=W/2-ew/2; ey=60
D(f'<rect x="{ex}" y="{ey}" width="{ew}" height="46" rx="23" fill="{SURF}" fill-opacity="0.5" stroke="{BORDS}" stroke-opacity="0.6"/>')
D(text(W/2, ey+30, "CONVERSATION   ·   ACTIVITY   ·   ENERGY", 19, "Nunito", MUT, ls="1.5", op=0.8, weight=700))
D(text(W/2, 188, "THE NETWORK,", 90, "Anton", INK, op=0.55))
D(text(W/2, 282, "ALWAYS IN MOTION", 90, "Anton", INK, op=0.55))
D(text(W/2, 350, "AI keeps conversation, activity and energy moving between every part of Frequency —", 26, "Nunito", MUT, op=0.72, weight=600))
D(text(W/2, 384, "so the whole network holds its momentum, on its own.", 26, "Nunito", MUT, op=0.72, weight=600))

nodes=[
 (-60,"COMMUNITY","circles & feed","users",TEAL,TEALBG),
 (  0,"GATHERINGS","events & check-ins","pin",AMBER,AMBERBG),
 ( 60,"THE GAME","zaps & ranks","zap",ROSE,ROSEBG),
 (120,"STUDIO","insight & nudges","trend","#4E7BA6","#E3EDF6"),
 (180,"PROGRAMS","frameworks","book","#5A6BB0","#E6E8F5"),
 (240,"GROWTH","new members","userplus","#5E9E5A","#E8F1E4"),
]
P=[pos(a,R) for (a,*_) in nodes]

# ---- base edges (with ids for motion paths) ----
def line(x1,y1,x2,y2,op,dash=None,eid=None):
    d=f' stroke-dasharray="{dash}"' if dash else ''
    i=f' id="{eid}"' if eid else ''
    D(f'<path{i} d="M {x1:.1f} {y1:.1f} L {x2:.1f} {y2:.1f}" fill="none" stroke="{BORDS}" stroke-width="1.6" opacity="{op}"{d} stroke-linecap="round"/>')
spoke_paths=[]; ring_paths=[]
for i,p in enumerate(P):
    a=nodes[i][0]; s=pos(a,COR+8); e=pos(a,R-NR-4)
    eid=f"sp{i}"; line(s[0],s[1],e[0],e[1],0.16,eid=eid); spoke_paths.append(eid)
for i in range(6):
    a=nodes[i][0]; b=nodes[(i+1)%6][0]
    A=pos(a,R); B=pos(b,R)
    dx,dy=B[0]-A[0],B[1]-A[1]; L=math.hypot(dx,dy); ux,uy=dx/L,dy/L
    s=(A[0]+ux*NR,A[1]+uy*NR); e=(B[0]-ux*NR,B[1]-uy*NR)
    eid=f"rg{i}"; line(s[0],s[1],e[0],e[1],0.2,eid=eid); ring_paths.append((eid,math.hypot(e[0]-s[0],e[1]-s[1])))
for i in range(6):
    A=P[i]; B=P[(i+2)%6]; line(A[0],A[1],B[0],B[1],0.09,dash="2 12")

# ---- animated comets ----
def comet(eid,color,dur,begin):
    return (f'<g><path d="M 7 0 L -2 -4.5 L -2 4.5 Z" fill="{color}" opacity="0.95"/>'
            f'<circle cx="-3" r="4.4" fill="{color}"/>'
            f'<circle cx="-11" r="3.3" fill="{color}" opacity="0.55"/>'
            f'<circle cx="-19" r="2.3" fill="{color}" opacity="0.35"/>'
            f'<circle cx="-27" r="1.5" fill="{color}" opacity="0.2"/>'
            f'<animateMotion dur="{dur:.2f}s" begin="{begin:.2f}s" repeatCount="indefinite" rotate="auto" '
            f'keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath xlink:href="#{eid}"/></animateMotion></g>')
SPEED=130.0
# spokes: outward
for i,eid in enumerate(spoke_paths):
    p=P[i]; a=nodes[i][0]; ln=(R-NR-4)-(COR+8); dur=max(ln/SPEED,1.4)
    col=STREAMS[i%3]
    D(comet(eid,col,dur,-(0.13*i)*dur))
    D(comet(eid,col,dur,-(0.13*i+0.5)*dur))
# ring: clockwise
for i,(eid,ln) in enumerate(ring_paths):
    dur=max(ln/SPEED,1.6); col=STREAMS[(i+2)%3]
    D(comet(eid,col,dur,-(0.1*i)*dur))
    D(comet(eid,col,dur,-(0.1*i+0.5)*dur))

# ---- AI core ----
D(f'<g class="breath" style="transform-origin:{C[0]}px {C[1]}px"><circle cx="{C[0]}" cy="{C[1]}" r="200" fill="url(#coreGlow)"/></g>')
for rr,col,op in [(126,AMBER,0.14),(160,TAN2,0.16)]:
    D(f'<circle cx="{C[0]}" cy="{C[1]}" r="{rr}" fill="none" stroke="{col}" stroke-width="1.5" stroke-dasharray="2 12" opacity="{op}"/>')
D(f'<circle cx="{C[0]}" cy="{C[1]}" r="{COR}" fill="{SURF}" fill-opacity="0.6" stroke="{AMBER}" stroke-opacity="0.45" stroke-width="2"/>')
D(icon("spark", C[0], C[1]-22, 46, AMBER, 2.1, op=0.72))
D(text(C[0], C[1]+34, "AI", 40, "Anton", INK, op=0.62))
D(text(C[0], C[1]+58, "the operator", 14, "Nunito", MUT, op=0.6, weight=600))

# ---- nodes + labels ----
for (a,title,tag,ic,acc,accbg) in nodes:
    cx,cy=pos(a,R)
    D(f'<g class="node" style="transform-origin:{cx:.0f}px {cy:.0f}px">')
    D(f'<circle cx="{cx}" cy="{cy}" r="{NR}" fill="{SURF}" fill-opacity="0.62" stroke="{acc}" stroke-opacity="0.42" stroke-width="2" class="ring"/>')
    D(icon(ic, cx, cy, 34, acc, 2.0, op=0.82))
    D('</g>')
    ly=cy+NR+30
    bw=max(len(title),len(tag))*10+34
    D(f'<rect x="{cx-bw/2:.0f}" y="{ly-22:.0f}" width="{bw:.0f}" height="50" rx="12" fill="{SAND}" fill-opacity="0.78"/>')
    D(text(cx, ly, title, 23, "Nunito", INK, op=0.74, ls="0.3", weight=800))
    D(text(cx, ly+22, tag, 16, "Nunito", MUT, op=0.68, weight=600))

# ---- legend ----
leg=[("msg","Conversation","posts, replies & DMs",CONV),
     ("act","Activity","events, check-ins, practice",ACT),
     ("zap","Energy","zaps, streaks & momentum",ENER)]
lw=312; gap=22; total=3*lw+2*gap; lx=W/2-total/2; ly=1252
for i,(ic,t,d,col) in enumerate(leg):
    x=lx+i*(lw+gap)
    D(f'<rect x="{x}" y="{ly}" width="{lw}" height="74" rx="18" fill="{SURF}" fill-opacity="0.45" stroke="{BORDS}" stroke-opacity="0.6"/>')
    D(f'<circle cx="{x+40}" cy="{ly+37}" r="21" fill="{col}" fill-opacity="0.14"/>')
    D(icon(ic, x+40, ly+37, 23, col, 2.0, op=0.85))
    D(text(x+74, ly+32, t, 21, "Nunito", INK, anchor="start", op=0.75, weight=800))
    D(text(x+74, ly+55, d, 15, "Nunito", MUT, anchor="start", op=0.7, weight=600))

# ---- footer ----
D(text(W/2, 1410, "MOMENTUM THAT DOESN'T DROP.", 48, "Anton", INK, op=0.55))
D(f'<path d="M 610 1428 Q 800 1444 990 1428" fill="none" stroke="{AMBER}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>')
D(text(W/2, 1464, "frequency  ·  a place to be human", 19, "Nunito", SUB, op=0.78, weight=700))
D('</svg>')
svg="\n".join(S)

html=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Frequency — The network, always in motion</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {{ --sand:{SAND}; }}
  * {{ box-sizing:border-box; }}
  html,body {{ margin:0; background:var(--sand); }}
  body {{ display:flex; justify-content:center; padding:24px; font-family:'Nunito',system-ui,sans-serif; }}
  .wrap {{ width:100%; max-width:880px; }}
  svg {{ width:100%; height:auto; display:block; }}
  /* live AI core */
  .breath {{ animation: breath 4.5s ease-in-out infinite; }}
  @keyframes breath {{ 0%,100% {{ opacity:.85; transform:scale(1); }} 50% {{ opacity:1; transform:scale(1.06); }} }}
  /* node hover lift */
  .node {{ transition: transform .25s ease, filter .25s ease; cursor:pointer; }}
  .node:hover {{ transform: scale(1.09); filter: drop-shadow(0 6px 14px rgba(40,30,16,.14)); }}
  .node .ring {{ transition: stroke-opacity .25s ease, fill-opacity .25s ease; }}
  .node:hover .ring {{ stroke-opacity:.85; fill-opacity:.92; }}
  @media (prefers-reduced-motion: reduce) {{
    .breath {{ animation:none; }}
    svg animateMotion {{ display:none; }}
  }}
</style>
</head>
<body>
  <div class="wrap">
  {svg}
  </div>
</body>
</html>'''

os.makedirs("/tmp/infographic",exist_ok=True)
open("/tmp/infographic/hook-network-interactive.html","w").write(html)
print("OK html bytes:", len(html), "comets:", (len(spoke_paths)+len(ring_paths))*2)
