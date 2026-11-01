#!/usr/bin/env python3
"""Tint the free PixelZ VFX strips into FORGE 728's per-family palette.

PixelZ ships each effect as a run of frames in one strip PNG (white-hot core,
cool tail). We keep the drawn shape and remap its luminance onto a duotone
ramp: dark end = the family accent, bright end = white. One strip per family,
so a crimson weapon throws crimson steel light and not blue.

Inputs : ref/vfx/{slash.png,hit-spark.png}   (PixelZ free pack, commercial OK)
Outputs: assets/vfx/{slash,spark}-<family>.png
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "ref", "vfx")
OUT = os.path.join(ROOT, "assets", "vfx")
os.makedirs(OUT, exist_ok=True)

FAMILIES = {
    "steel": (150, 162, 176),
    "gold": (232, 176, 62),
    "violet": (168, 108, 255),
    "verdant": (86, 208, 118),
    "crimson": (238, 66, 78),
    "ember": (255, 108, 40),
    "azure": (72, 168, 255),
}


def duotone(im, accent):
    im = im.convert("RGBA")
    px = im.load()
    ax, ay, az = accent
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            # gamma keeps the tail dark and the core hot
            t = lum ** 1.35
            px[x, y] = (
                int(ax + (255 - ax) * t),
                int(ay + (255 - ay) * t),
                int(az + (255 - az) * t),
                a,
            )
    return im


def main():
    for stem, out_stem in (("slash", "slash"), ("hit-spark", "spark")):
        src = os.path.join(SRC, stem + ".png")
        if not os.path.exists(src):
            print("missing", src)
            continue
        base = Image.open(src).convert("RGBA")
        for fam, rgb in FAMILIES.items():
            out = duotone(base, rgb)
            dst = os.path.join(OUT, f"{out_stem}-{fam}.png")
            out.save(dst, optimize=True)
            print(f"{os.path.basename(dst)} {out.size}")


if __name__ == "__main__":
    main()
