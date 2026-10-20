# Builds the launcher icon, adaptive icon layers and splash mark from the Frequency round logo
# (design_handoff/frequency/assets/logo/frequency-icon-round.png). The logo is used as a MASK filled
# with Commons ink (#34312E) on the Commons canvas (#FAF4EA), never recoloured by hand.
# Run: python3 scripts/gen-app-icons.py (from mobile/). Needs Pillow.
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'brand', 'frequency-icon-round.png')
OUT = os.path.join(HERE, '..', 'assets')
CANVAS = (0xFA, 0xF4, 0xEA, 255)
INK = (0x34, 0x31, 0x2E, 255)

mark = Image.open(SRC).convert('RGBA')
alpha = mark.split()[3]

def filled(size, fill):
    m = alpha.resize((size, size), Image.LANCZOS)
    layer = Image.new('RGBA', (size, size), fill)
    layer.putalpha(m)
    return layer

def place(canvas_size, mark_size, bg, fill):
    img = Image.new('RGBA', (canvas_size, canvas_size), bg)
    off = (canvas_size - mark_size) // 2
    img.alpha_composite(filled(mark_size, fill), (off, off))
    return img

# Launcher icon (legacy + iOS): mark at 62% on canvas.
place(1024, 640, CANVAS, INK).convert('RGB').save(os.path.join(OUT, 'icon.png'))
# Adaptive foreground: transparent, mark inside the 66% safe zone.
place(1024, 560, (0, 0, 0, 0), INK).save(os.path.join(OUT, 'android-icon-foreground.png'))
# Monochrome (themed icons): white mark, transparent.
place(1024, 560, (0, 0, 0, 0), (255, 255, 255, 255)).save(os.path.join(OUT, 'android-icon-monochrome.png'))
# Splash mark: transparent, the splash background colour comes from app.config.ts.
place(512, 512, (0, 0, 0, 0), INK).save(os.path.join(OUT, 'splash-icon.png'))
print('icons written')
# Splash mark for the night room: Thermal text-strong (#FBF2E6).
place(512, 512, (0, 0, 0, 0), (0xFB, 0xF2, 0xE6, 255)).save(os.path.join(OUT, 'splash-icon-dark.png'))
