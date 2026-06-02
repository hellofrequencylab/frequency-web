#!/usr/bin/env python3
import math, cairosvg, os

W, H = 1600, 1500
C = (800, 800)
R = 330
NR = 60        # node radius
COR = 90       # core radius
TAN="#D8C29A"; TAN2="#C9B084"

SAND="#F7F3EA"; INK="#1E1A13"; MUT="#6B6253"; SUB="#8F8675"
BORD="#E9E1D4"; BORDS="#D8CDBB"; SURF="#FFFFFF"; ELEV="#FCFAF5"
AMBER="#E2912F"; AMBERS="#9A5E12"; AMBERBG="#FBEFD9"
TEAL="#1E9E89"; TEALS="#0F6657"; TEALBG="#DDF1ED"
ROSE="#B5566F"; ROSEBG="#F6E3E8"

# stream colors
CONV=TEAL; ACT=AMBER; ENER=ROSE
STREAMS=[CONV,ACT,ENER]

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
 "msg":'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
 "act":'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
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
 <radialGradient id="bgA" cx="50%" cy="14%" r="62%"><stop offset="0%" stop-color="{AMBER}" stop-opacity="0.06"/><stop offset="100%" stop-color="{AMBER}" stop-opacity="0"/></radialGradient>
 <radialGradient id="bgT" cx="50%" cy="50%" r="42%"><stop offset="0%" stop-color="{TEAL}" stop-opacity="0.05"/><stop offset="100%" stop-color="{TEAL}" stop-opacity="0"/></radialGradient>
 <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="{TAN}" stop-opacity="0.55"/><stop offset="50%" stop-color="{TAN}" stop-opacity="0.22"/><stop offset="100%" stop-color="{TAN}" stop-opacity="0"/></radialGradient>
</defs>''')
add(f'<rect width="{W}" height="{H}" fill="{SAND}"/>')
add(f'<rect width="{W}" height="{H}" fill="url(#bgA)"/>')
add(f'<rect width="{W}" height="{H}" fill="url(#bgT)"/>')

# ---------- header ----------
ew=470; ex=W/2-ew/2; ey=60
add(f'<rect x="{ex}" y="{ey}" width="{ew}" height="46" rx="23" fill="{SURF}" fill-opacity="0.5" stroke="{BORDS}" stroke-opacity="0.6"/>')
add(text(W/2, ey+30, "CONVERSATION   ·   ACTIVITY   ·   ENERGY", 19, "NunitoW700", MUT, ls="1.5", op=0.8))
add(text(W/2, 188, "THE NETWORK,", 90, "Anton", INK, op=0.55))
add(text(W/2, 282, "ALWAYS IN MOTION", 90, "Anton", INK, op=0.55))
add(text(W/2, 350, "AI keeps conversation, activity and energy moving between every part of Frequency —", 26, "NunitoW600", MUT, op=0.72))
add(text(W/2, 384, "so the whole network holds its momentum, on its own.", 26, "NunitoW600", MUT, op=0.72))

# ---------- nodes (wheel turned 30deg: flat top/bottom, 3 per side) ----------
nodes=[
 (-60,"COMMUNITY","circles & feed","users",TEAL,TEALBG),
 (  0,"GATHERINGS","events & check-ins","pin",AMBER,AMBERBG),
 ( 60,"THE GAME","zaps & ranks","zap",ROSE,ROSEBG),
 (120,"STUDIO","insight & nudges","trend","#4E7BA6","#E3EDF6"),
 (180,"PROGRAMS","frameworks","book","#5A6BB0","#E6E8F5"),
 (240,"GROWTH","new members","userplus","#5E9E5A","#E8F1E4"),
]
P=[pos(a,R) for (a,*_ ) in nodes]

# ---------- edges (faint structure) ----------
def edge(A,B,op=0.18,dash=None):
    d=f' stroke-dasharray="{dash}"' if dash else ''
    add(f'<line x1="{A[0]:.1f}" y1="{A[1]:.1f}" x2="{B[0]:.1f}" y2="{B[1]:.1f}" stroke="{BORDS}" stroke-width="1.6" opacity="{op}"{d} stroke-linecap="round"/>')
# spokes
for p in P: edge(C,p,0.16)
# ring
for i in range(6): edge(P[i],P[(i+1)%6],0.2)
# skip-one mesh (web feel)
for i in range(6): edge(P[i],P[(i+2)%6],0.09,dash="2 12")

# ---------- flowing pulses (comet head + trail + arrow) ----------
def flow(A,B,thead,color,inset_a=COR+10,inset_b=R-NR-6):
    # restrict travel to between core edge and node edge
    dx,dy=B[0]-A[0],B[1]-A[1]; L=math.hypot(dx,dy); ux,uy=dx/L,dy/L
    sA=(A[0]+ux*inset_a, A[1]+uy*inset_a); sB=(B[0]-ux*(L-inset_b), B[1]-uy*(L-inset_b))
    seg=[(0,4.8,0.95),(0.06,3.7,0.62),(0.12,2.7,0.4),(0.18,1.9,0.24),(0.24,1.3,0.14)]
    out=[]
    for dt,r,op in seg:
        t=thead-dt
        if t<0.04 or t>0.99: continue
        x=sA[0]+(sB[0]-sA[0])*t; y=sA[1]+(sB[1]-sA[1])*t
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{color}" opacity="{op}"/>')
    ang=math.degrees(math.atan2(sB[1]-sA[1], sB[0]-sA[0]))
    hx=sA[0]+(sB[0]-sA[0])*min(thead+0.03,0.99); hy=sA[1]+(sB[1]-sA[1])*min(thead+0.03,0.99)
    out.append(f'<g transform="translate({hx:.1f},{hy:.1f}) rotate({ang:.1f})"><path d="M -3 -4 L 5 0 L -3 4 Z" fill="{color}" opacity="0.92"/></g>')
    return "".join(out)

# spokes: AI emits outward (center -> node)
for i,p in enumerate(P):
    ph=0.40+0.07*i
    add(flow(C,p,ph,STREAMS[i%3]))
# ring: circulate clockwise (node i -> node i+1), bounded to node edges
def ring_flow(A,B,thead,color):
    dx,dy=B[0]-A[0],B[1]-A[1]; L=math.hypot(dx,dy); ux,uy=dx/L,dy/L
    sA=(A[0]+ux*NR, A[1]+uy*NR); sB=(B[0]-ux*NR, B[1]-uy*NR)
    seg=[(0,4.8,0.95),(0.07,3.6,0.6),(0.14,2.6,0.38),(0.21,1.8,0.22),(0.28,1.2,0.13)]
    out=[]
    for dt,r,op in seg:
        t=thead-dt
        if t<0.02 or t>0.99: continue
        x=sA[0]+(sB[0]-sA[0])*t; y=sA[1]+(sB[1]-sA[1])*t
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{color}" opacity="{op}"/>')
    ang=math.degrees(math.atan2(sB[1]-sA[1], sB[0]-sA[0]))
    hx=sA[0]+(sB[0]-sA[0])*min(thead+0.04,0.99); hy=sA[1]+(sB[1]-sA[1])*min(thead+0.04,0.99)
    out.append(f'<g transform="translate({hx:.1f},{hy:.1f}) rotate({ang:.1f})"><path d="M -3 -4 L 5 0 L -3 4 Z" fill="{color}" opacity="0.92"/></g>')
    return "".join(out)
for i in range(6):
    ph=0.30+0.1*i
    add(ring_flow(P[i],P[(i+1)%6],ph,STREAMS[(i+2)%3]))

# ---------- AI core ----------
add(f'<circle cx="{C[0]}" cy="{C[1]}" r="200" fill="url(#coreGlow)"/>')
for rr,col,op in [(126,AMBER,0.14),(160,TAN2,0.16)]:
    add(f'<circle cx="{C[0]}" cy="{C[1]}" r="{rr}" fill="none" stroke="{col}" stroke-width="1.5" stroke-dasharray="2 12" opacity="{op}"/>')
add(f'<circle cx="{C[0]}" cy="{C[1]}" r="{COR}" fill="{SURF}" fill-opacity="0.6" stroke="{AMBER}" stroke-opacity="0.45" stroke-width="2"/>')
add(icon("spark", C[0], C[1]-22, 46, AMBER, 2.1, op=0.72))
add(text(C[0], C[1]+34, "AI", 40, "Anton", INK, op=0.62))
add(text(C[0], C[1]+58, "the operator", 14, "NunitoW600", MUT, op=0.6))

# ---------- node bodies + labels ----------
for (a,title,tag,ic,acc,accbg) in nodes:
    cx,cy=pos(a,R)
    add(f'<circle cx="{cx}" cy="{cy}" r="{NR}" fill="{SURF}" fill-opacity="0.62" stroke="{acc}" stroke-opacity="0.42" stroke-width="2"/>')
    add(icon(ic, cx, cy, 34, acc, 2.0, op=0.82))
    ly=cy+NR+30
    bw=max(len(title),len(tag))*10+34
    add(f'<rect x="{cx-bw/2:.0f}" y="{ly-22:.0f}" width="{bw:.0f}" height="50" rx="12" fill="{SAND}" fill-opacity="0.78"/>')
    add(text(cx, ly, title, 23, "NunitoW800", INK, op=0.74, ls="0.3"))
    add(text(cx, ly+22, tag, 16, "NunitoW600", MUT, op=0.68))

# ---------- legend ----------
leg=[("msg","Conversation","posts, replies & DMs",CONV),
     ("act","Activity","events, check-ins, practice",ACT),
     ("zap","Energy","zaps, streaks & momentum",ENER)]
lw=312; gap=22; total=3*lw+2*gap; lx=W/2-total/2; ly=1252
for i,(ic,t,d,col) in enumerate(leg):
    x=lx+i*(lw+gap)
    add(f'<rect x="{x}" y="{ly}" width="{lw}" height="74" rx="18" fill="{SURF}" fill-opacity="0.45" stroke="{BORDS}" stroke-opacity="0.6"/>')
    add(f'<circle cx="{x+40}" cy="{ly+37}" r="21" fill="{col}" fill-opacity="0.14"/>')
    add(icon(ic, x+40, ly+37, 23, col, 2.0, op=0.85))
    add(text(x+74, ly+32, t, 21, "NunitoW800", INK, anchor="start", op=0.75))
    add(text(x+74, ly+55, d, 15, "NunitoW600", MUT, anchor="start", op=0.7))

# ---------- footer ----------
add(text(W/2, 1410, "MOMENTUM THAT DOESN'T DROP.", 48, "Anton", INK, op=0.55))
add(f'<path d="M 610 1428 Q 800 1444 990 1428" fill="none" stroke="{AMBER}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>')
add(text(W/2, 1464, "frequency  ·  a place to be human", 19, "NunitoW700", SUB, op=0.78))

add('</svg>')
svg="\n".join(S)
os.makedirs("/tmp/infographic",exist_ok=True)
open("/tmp/infographic/hook-network.svg","w").write(svg)
cairosvg.svg2png(bytestring=svg.encode(), write_to="/tmp/infographic/hook-network.png",
                 output_width=W*2, output_height=H*2, background_color=SAND)
print("OK", len(svg), os.path.getsize("/tmp/infographic/hook-network.png"))
