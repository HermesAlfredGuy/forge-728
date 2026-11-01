#!/usr/bin/env python3
"""Procedural pixel-art set dressing for FORGE 728.

Everything here is drawn pixel by pixel at native resolution so the room, the
floor, the shadows and the hovering sigil share the sprites' pixel grid — no
smooth vector gradients sitting on top of pixel art.

Outputs (assets/):
  wall.png            96x96  ebony brick, tiled by CSS
  floor.png           64x64  stone flagstone, tiled + perspective in CSS
  shadow.png          64x16  dithered contact shadow
  sigil-<family>.png  44x16  pixel ring under the weapon
  shaft-<family>.png  44x64  dithered light cone
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
os.makedirs(OUT, exist_ok=True)

# 4x4 ordered dither
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def d(x, y, level):
    """True when a dither cell at (x,y) is on at the given 0..16 level."""
    return BAYER[y % 4][x % 4] < level


def save(img, name):
    img.save(os.path.join(OUT, name))
    print(name, img.size)


# ------------------------------------------------------------------ wall ----
W = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
px = W.load()
import random

random.seed(11)
for y in range(96):
    for x in range(96):
        if y % 24 == 0 or x % 48 == 0:
            px[x, y] = (7, 6, 5, 255)          # mortar
            continue
        row = y // 24
        off = 24 if row % 2 else 0
        if (x + off) % 48 == 0:
            px[x, y] = (7, 6, 5, 255)
            continue
        r = random.random()
        if r < 0.05:
            px[x, y] = (22, 18, 14, 255)       # chipped face
        elif y % 24 == 1:
            px[x, y] = (18, 15, 12, 255)       # top light edge
        else:
            px[x, y] = (13, 11, 9, 255)        # brick face
save(W, "wall.png")

# ----------------------------------------------------------------- floor ----
F = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
fp = F.load()
random.seed(23)
for y in range(64):
    for x in range(64):
        if x % 32 == 0 or y % 32 == 0:
            fp[x, y] = (8, 7, 6, 255)          # flagstone joint
            continue
        r = random.random()
        if r < 0.03:
            fp[x, y] = (26, 19, 13, 255)       # warm grit
        elif r < 0.10:
            fp[x, y] = (21, 16, 12, 255)
        elif (x % 32 in (1, 2)) or (y % 32 in (1, 2)):
            fp[x, y] = (24, 18, 13, 255)       # bevel catching light
        else:
            fp[x, y] = (17, 13, 10, 255)       # stone
save(F, "floor.png")

# ---------------------------------------------------------------- shadow ----
S = Image.new("RGBA", (64, 16), (0, 0, 0, 0))
sp = S.load()
for y in range(16):
    for x in range(64):
        nx = (x - 31.5) / 31.5
        ny = (y - 7.5) / 7.5
        r = (nx * nx + ny * ny) ** 0.5
        if r > 1.02:
            continue
        lvl = int(round(16 * max(0.0, 1 - r) ** 1.4))
        # solid core, dithered edge
        if r < 0.55 or d(x, y, lvl):
            sp[x, y] = (0, 0, 0, 205 if r < 0.55 else 150)
save(S, "shadow.png")

# ----------------------------------------------------------------- sigil ----
FAMILIES = {
    "steel": (170, 178, 184), "gold": (224, 169, 74), "verdant": (121, 196, 122),
    "azure": (79, 182, 232), "violet": (169, 139, 240), "crimson": (224, 87, 79),
    "ember": (255, 92, 26),
}
for fam, (r, g, b) in FAMILIES.items():
    im = Image.new("RGBA", (44, 16), (0, 0, 0, 0))
    ip = im.load()
    cx, cy, ax, ay = 21.5, 7.5, 20.5, 6.6
    for y in range(16):
        for x in range(44):
            nx = (x - cx) / ax
            ny = (y - cy) / ay
            rr = (nx * nx + ny * ny) ** 0.5
            if 0.78 <= rr <= 1.0:
                ip[x, y] = (r, g, b, 235)
            elif 1.0 < rr <= 1.6:
                if d(x, y, int(11 * (1.6 - rr))):
                    ip[x, y] = (r, g, b, 130)
            elif 0.64 <= rr < 0.78:
                if d(x, y, 6):
                    ip[x, y] = (r, g, b, 90)
            elif rr <= 0.62:
                # inner ticks
                ang = __import__("math").atan2(ny, nx)
                tick = int((ang + 3.14159) / (3.14159 * 2) * 16) % 2 == 0
                if rr > 0.5 and tick:
                    ip[x, y] = (r, g, b, 120)
                elif d(x, y, 2):
                    ip[x, y] = (r, g, b, 60)
    save(im, "sigil-%s.png" % fam)

    # light cone
    sh = Image.new("RGBA", (44, 64), (0, 0, 0, 0))
    shp = sh.load()
    for y in range(64):
        t = y / 63.0                                # 0 top, 1 bottom
        half = 4 + 18 * t
        for x in range(44):
            dx = abs(x - 21.5)
            if dx > half:
                continue
            edge = 1 - dx / max(half, 1)
            lvl = int(round(10 * (edge ** 1.3) * (t ** 2)))
            if lvl and d(x, y, lvl):
                shp[x, y] = (r, g, b, 34)
    save(sh, "shaft-%s.png" % fam)
