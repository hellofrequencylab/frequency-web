# Builds the STOCK EMAIL HEROES (EMAIL-029): a gathering photo lifted and desaturated for one shared tone, a
# blue gradient orb bottom left, a purple one top right (the --pa pastels, soft organic edges), and the ink
# wordmark set into the bottom left. One pre-composed JPEG per photo, because mail clients paint no overlay
# reliably. Run from the repo root; needs Pillow and numpy:
#   python3 scripts/email-hero.py
# Writes public/brand/frequency/email/hero-<n>.jpg for the photos in PICKS; lib/theme/email-type.ts lists them.
import math, os, sys
import numpy as np
from PIL import Image, ImageEnhance

W, H = 1200, 520  # served at 600x260 (2x)
OUT = 'public/brand/frequency/email/'
PHOTOS = 'public/brand/frequency/photos/'
# (file, vertical focus of the cover crop: 0 top, 1 bottom)
PICKS = [
    ('day-parachute-play.jpg', 0.7),
    ('gathering-10.jpg', 0.3),
    ('gathering-11.jpg', 0.55),
    ('gathering-06.jpg', 0.45),
    ('gathering-02.jpg', 0.5),
]
BLUE_IN, BLUE_OUT = (0x8F, 0xE9, 0xFF), (0xA3, 0xD4, 0xFF)      # --pa 100% and 68%
PURPLE_IN, PURPLE_OUT = (0xC4, 0xB8, 0xFF), (0xEE, 0xC1, 0xEC)  # --pa 36% and 0%
INK = (0x1E, 0x1B, 0x18)

def cover(im, fy):
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = int((im.height - H) * fy)
    return im.crop((x, y, x + W, y + H))

def orb(cx, cy, r, phase):
    """A soft radial field (1 at the centre, 0 past r) with an organic, slightly wandering edge."""
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = (xs - cx) / r, (ys - cy) / r
    ang = np.arctan2(dy, dx)
    wobble = 1 + 0.10 * np.sin(3 * ang + phase) + 0.06 * np.sin(5 * ang - 2 * phase) + 0.04 * np.sin(7 * ang + 0.5)
    d = np.sqrt(dx * dx + dy * dy) / wobble
    f = np.clip(1 - d, 0, 1)
    return f * f * (3 - 2 * f)  # smoothstep

def build(photo, out, fy):
    base = cover(Image.open(PHOTOS + photo).convert('RGB'), fy)
    base = ImageEnhance.Color(base).enhance(0.72)        # one shared, quieter tone across the five
    base = ImageEnhance.Brightness(base).enhance(1.06)
    px = np.asarray(base).astype(np.float32)
    # the pale wash the whole picture sits under (keeps the five on one theme)
    wash = np.array((0xF4, 0xEF, 0xF8), np.float32)
    px = px * 0.86 + wash * 0.14
    # blue orb, bottom left; purple orb, top right
    blue = orb(W * 0.12, H * 1.0, W * 0.56, 0.8)
    purple = orb(W * 0.92, H * 0.02, W * 0.58, 2.1)
    def tint(px, field, c_in, c_out, strength):
        col = np.array(c_in, np.float32)[None, None, :] * field[..., None] + np.array(c_out, np.float32)[None, None, :] * (1 - field[..., None])
        a = (field * strength)[..., None]
        return px * (1 - a) + col * a
    px = tint(px, purple, PURPLE_IN, PURPLE_OUT, 0.96)
    px = tint(px, blue, BLUE_IN, BLUE_OUT, 0.94)
    comp = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8)).convert('RGBA')
    wm = Image.open('public/brand/frequency/frequency-wordmark.png').convert('RGBA')
    tw = 340
    wm = wm.resize((tw, round(wm.height * tw / wm.width)), Image.LANCZOS)
    a = wm.split()[3]
    wm = Image.merge('RGBA', tuple(Image.new('L', wm.size, c) for c in INK) + (a,))
    comp.alpha_composite(wm, (72, H - wm.height - 44))
    comp.convert('RGB').save(out, quality=80, optimize=True, progressive=True)
    print(out, os.path.getsize(out) // 1024, 'KB')

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for i, (photo, fy) in enumerate(PICKS, 1):
        build(photo, f'{OUT}hero-{i}.jpg', fy)
