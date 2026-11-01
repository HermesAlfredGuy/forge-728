#!/usr/bin/env python3
"""Draw the forge hall backdrop for FORGE 728, pixel by pixel.

One 1000x700 pixel backdrop, stretched to the arena. Horizon at 80% of the
height; the CSS puts the actors' feet just above it.

Palette is deliberately a step brighter than the sprites will be lit, so dark
weapons still separate from the wall. assets/backdrop.png
"""
import math
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "backdrop.png")

WID, HEI = 1000, 800
HOR = 520
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def d(x, y, level):
    return BAYER[y % 4][x % 4] < level


img = Image.new("RGB", (WID, HEI), (16, 14, 11))
px = img.load()
random.seed(5)

# ------------------------------------------------------------------ wall ----
for y in range(HOR):
    fall = 0.80 + 0.20 * min(1.0, y / HOR)          # slightly darker up top
    row = y // 18
    off = 22 if row % 2 else 0
    for x in range(WID):
        if y % 18 == 0 or (x + off) % 44 == 0:
            c = (10, 9, 7)                          # mortar
        else:
            brick = ((x + off) // 44) * 7 + row * 13
            rnd = ((brick * 1103515245 + 12345) % 97) / 97.0
            base = 21 + rnd * 6
            if y % 18 == 1:
                base += 7                           # lit top edge of the brick
            elif y % 18 == 17:
                base -= 5                           # shadow under the brick
            c = (int(base * fall), int((base - 3) * fall), int((base - 6) * fall))
        px[x, y] = c

# ------------------------------------------------------------- forge arch ----
AX0, AX1 = 392, 608
ASPRING, ATOT = 372, 196
RAD = (AX1 - AX0) // 2
CX = (AX0 + AX1) // 2


def in_arch(x, y, grow=0):
    if y < ASPRING:
        return (x - CX) ** 2 + (y - ASPRING) ** 2 < (RAD - grow) ** 2 and y > ATOT
    return AX0 + grow <= x < AX1 - grow and y < HOR


# 1. outer reveal shadow (2 px darker ring)
for y in range(ATOT - 14, HOR):
    for x in range(AX0 - 16, AX1 + 16):
        if in_arch(x, y, -12) and not in_arch(x, y, -5):
            px[x, y] = (9, 8, 7)
# 2. stone surround with voussoirs
for y in range(ATOT - 12, HOR):
    for x in range(AX0 - 14, AX1 + 14):
        if in_arch(x, y, -6) and not in_arch(x, y, 0):
            tone = ((x // 12 + y // 12) % 3)
            base = (30, 26, 21) if tone == 0 else ((35, 30, 24) if tone == 1 else (26, 22, 18))
            if (x + y) % 12 == 0:
                base = (18, 15, 12)                # voussoir joints
            px[x, y] = base
# 3. warm inner rim + hot bed
for y in range(ATOT, HOR):
    for x in range(AX0, AX1):
        if in_arch(x, y, 0):
            t = max(0.0, (y - ASPRING) / (HOR - ASPRING))
            g = 8 + 74 * (t ** 1.7)
            if x < AX0 + 3 or x > AX1 - 4:
                px[x, y] = (int(g * 0.55), int(g * 0.26), int(g * 0.1))
                continue
            if d(x, y, int(3 + 11 * t)):
                px[x, y] = (int(g), int(g * 0.42), int(g * 0.13))
            else:
                px[x, y] = (int(g * 0.35), int(g * 0.16), int(g * 0.08))
# 4. coal bed at the foot of the arch
for y in range(HOR - 26, HOR):
    for x in range(AX0 + 26, AX1 - 26):
        nx = (x - CX) / 70.0
        ny = (y - (HOR - 8)) / 22.0
        r = (nx * nx + ny * ny) ** 0.5
        if r < 1 and d(x, y, int(14 * (1 - r))):
            px[x, y] = (255 if r < 0.3 else 226, 128 if r < 0.3 else 84, 40 if r < 0.3 else 22)
# 5. soot stain above the arch
for y in range(ATOT - 60, ATOT - 8):
    for x in range(CX - 96, CX + 96):
        nx = (x - CX) / 96.0
        ny = (y - (ATOT - 8)) / 60.0
        if (nx * nx + ny * ny) < 1 and d(x, y, int(7 * (1 - (nx * nx + ny * ny)))):
            c = px[x, y]
            px[x, y] = (int(c[0] * 0.55), int(c[1] * 0.55), int(c[2] * 0.6))

# ------------------------------------------------------------------ props ----
# anvil, left, standing on the floor line
AX, AY = 176, HOR
for i in range(0, 20):                                   # base block
    for x in range(AX - 12 + i // 3, AX + 13 - i // 3):
        px[x, AY - 20 + i] = (22, 19, 15) if i % 5 else (16, 14, 11)
for x in range(AX - 26, AX + 27):                        # body
    for y in range(AY - 34, AY - 26):
        px[x, y] = (19, 17, 13)
for x in range(AX - 34, AX + 22):                        # top face / horn
    for y in range(AY - 38, AY - 34):
        px[x, y] = (34, 30, 24) if y == AY - 38 else (26, 23, 18)
for y in range(AY - 33, AY - 29):                        # horn taper
    px[AX - 37, y] = (26, 23, 18)
    px[AX - 38, y] = (24, 21, 17)

# quench barrel, right
BX, BY = 846, HOR
for y in range(BY - 46, BY):
    for x in range(BX - 18, BX + 18):
        nx = (x - BX) / 18.0
        if abs(nx) > 0.94:
            px[x, y] = (14, 12, 10)
        elif y in (BY - 46, BY - 32, BY - 16):
            px[x, y] = (38, 33, 26)                      # hoops
        else:
            shade = 1 - abs(nx) * 0.35
            px[x, y] = (int(24 * shade), int(19 * shade), int(14 * shade))

# chains hanging from the dark, with alternating links
for cx_ in (128, 866):
    for y in range(0, 168):
        lit = (y // 5) % 2 == 0
        for x in (cx_, cx_ + 1):
            if 0 <= x < WID:
                px[x, y] = (34, 29, 23) if lit else (18, 16, 13)
    for x in range(cx_ - 6, cx_ + 8):                    # bracket
        for y in range(0, 5):
            px[x, y] = (30, 26, 21)

# wall sconces either side of the arch
for sx in (AX0 - 66, AX1 + 46):
    for y in range(ASPRING + 26, ASPRING + 46):
        for x in range(sx, sx + 14):
            nx = (x - (sx + 7)) / 7.0
            ny = (y - (ASPRING + 36)) / 10.0
            r = (nx * nx + ny * ny) ** 0.5
            if r < 1 and d(x, y, int(13 * (1 - r))):
                px[x, y] = (250, 150, 60) if r < 0.4 else (150, 70, 26)
    for x in range(sx + 3, sx + 11):                     # bracket
        px[x, ASPRING + 47] = (26, 22, 18)
        px[x, ASPRING + 48] = (20, 17, 13)

# ----------------------------------------------------------------- floor ----
for y in range(HOR, HEI):
    s = (y - HOR) / (HEI - HOR)
    for x in range(WID):
        base = 27 + 9 * s
        r = random.random()
        if r < 0.05:
            base += 8
        elif r < 0.09:
            base -= 4
        px[x, y] = (int(base), int(base * 0.79), int(base * 0.6))

VPX, VPY = 500, HOR
for k in range(-9, 10):
    xb = VPX + k * 118
    for y in range(HOR, HEI):
        s = (y - HOR) / (HEI - HOR)
        x = int(VPX + (xb - VPX) * s)
        if 0 <= x < WID:
            px[x, y] = (16, 13, 10)
for n in range(1, 9):
    y = int(HOR + (HEI - HOR) * (1 - 1 / (1 + n * 0.42)))
    if y < HEI:
        for x in range(WID):
            px[x, y] = (17, 14, 11)

# warm pool of light on the floor, in perspective
for y in range(HOR + 4, HEI):
    for x in range(190, 820):
        nx = (x - 505) / 310.0
        ny = (y - (HEI - 34)) / 160.0
        r = (nx * nx + ny * ny) ** 0.5
        if r < 1.0 and d(x, y, int(13 * (1 - r) ** 1.5)):
            c = px[x, y]
            px[x, y] = (min(255, c[0] + 22), min(255, c[1] + 12), min(255, c[2] + 5))

# horizon seam + wall/floor contact shadow
for x in range(WID):
    px[x, HOR] = (44, 33, 24)
    px[x, HOR - 1] = (20, 17, 13)
    px[x, HOR + 1] = (19, 16, 12)

# -------------------------------------------------------------- vignette ----
for y in range(HEI):
    for x in range(WID):
        nx = (x - WID / 2) / (WID / 2)
        ny = (y - HEI / 2) / (HEI / 2)
        r = math.sqrt(nx * nx * 0.7 + ny * ny * 0.85)
        if r > 0.74:
            f = min(0.55, (r - 0.74) * 1.35)
            c = px[x, y]
            px[x, y] = (int(c[0] * (1 - f)), int(c[1] * (1 - f)), int(c[2] * (1 - f)))

img.save(OUT, optimize=True)
print("backdrop", img.size, os.path.getsize(OUT), "bytes")
