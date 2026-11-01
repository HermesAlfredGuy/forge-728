#!/usr/bin/env python3
"""Build the Forge 728 asset pipeline from the PixelSRPG-Forge download.

Inputs  : ref/unz/*/*.png            (728 weapon icons, native size 18-66 px)
          ref/monster.zip            (20 animated creatures, horizontal strips)
Outputs : assets/atlas.png           (one 68 px grid, 28 x 26 cells)
          assets/weapons/NNN.png     (individual icons for the arena)
          assets/weapons.json        (measured traits, all from pixels)
          assets/monsters/*.png      (idle + hit strips, alpha-normalised)
          assets/monsters.json

Every number in weapons.json is measured from the PNG. Nothing is invented.
"""
import glob
import io
import json
import math
import os
import re
import zipfile
from collections import Counter

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "ref")
OUT = os.path.join(ROOT, "assets")
CELL = 72  # largest icon in the pack is 69 px
COLS, ROWS = 28, 26  # 728 cells, 727 weapons


def n_kind(path, kind):
    """True when the filename names an animation of this kind (Idle, Hit, ...)."""
    return kind.lower() in os.path.basename(path).lower()

os.makedirs(os.path.join(OUT, "weapons"), exist_ok=True)
os.makedirs(os.path.join(OUT, "monsters"), exist_ok=True)


def feret(points):
    """Max pairwise distance (max Feret diameter) of a point cloud."""
    pts = points.astype(np.float64)
    if len(pts) < 2:
        return 0.0
    # drop interior points with a cheap convex hull (monotone chain)
    uniq = np.unique(pts, axis=0)
    if len(uniq) < 3:
        return float(np.max(np.ptp(uniq, axis=0))) if len(uniq) else 0.0
    p = sorted(map(tuple, uniq))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for pt in p:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], pt) <= 0:
            lower.pop()
        lower.append(pt)
    for pt in reversed(p):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], pt) <= 0:
            upper.pop()
        upper.append(pt)
    hull = np.array(lower[:-1] + upper[:-1])
    d = ((hull[:, None, :] - hull[None, :, :]) ** 2).sum(-1)
    return float(math.sqrt(d.max()))


HUE_BUCKETS = [
    ("ember", 0, 25), ("gold", 25, 55), ("verdant", 55, 150),
    ("azure", 150, 210), ("violet", 210, 285), ("crimson", 285, 360),
]


def measure(path):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    alpha = a[:, :, 3]
    ys, xs = np.nonzero(alpha >= 128)
    if len(xs) == 0:
        return None
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    px = a[ys, xs][:, :3].astype(np.float32) / 255.0
    mass = int(len(xs))
    mx = px.max(1)
    mn = px.min(1)
    val = mx
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # hue
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    d = np.maximum(mx - mn, 1e-6)
    hue = np.zeros_like(mx)
    m = (mx == r)
    hue[m] = ((g[m] - b[m]) / d[m]) % 6
    m = (mx == g) & (mx != r)
    hue[m] = ((b[m] - r[m]) / d[m]) + 2
    m = (mx == b) & (mx != r) & (mx != g)
    hue[m] = ((r[m] - g[m]) / d[m]) + 4
    hue = (hue * 60) % 360
    # colourful share drives the family; greys are "steel"
    colour = (sat > 0.28) & (val > 0.18)
    share = float(colour.mean())
    if share > 0.35:
        w = (sat * val)[colour]
        ang = np.deg2rad(hue[colour])
        ch = float(np.rad2deg(math.atan2((np.sin(ang) * w).sum(), (np.cos(ang) * w).sum())) % 360)
    else:
        ch = None
    if ch is None:
        family = "steel"
    else:
        family = min(HUE_BUCKETS, key=lambda hb: min(abs(ch - hb[1]), 360 - abs(ch - hb[2])))[0]
    # dominant colour, weighted by saturation so the "metal" is not washed out
    q = (px * 8).astype(int)
    keys = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    cnt = Counter(keys.tolist())
    palette = []
    for k, _ in cnt.most_common(40):
        rr, gg, bb = k // 64, (k % 64) // 8, k % 8
        c = tuple(min(255, v * 32 + 16) for v in (rr, gg, bb))
        pal_sat = (max(c) - min(c)) / max(max(c), 1)
        if pal_sat > 0.12 or max(c) > 150:
            palette.append("#%02x%02x%02x" % c)
        if len(palette) == 5:
            break
    if not palette:
        palette = ["#8a8a8a"]
    accent = palette[0]
    lum = float((val * 0.6 + sat * 0.4).mean())
    return dict(
        w=im.width, h=im.height,
        bw=x1 - x0, bh=y1 - y0,
        mass=mass,
        len=round(feret(np.stack([xs, ys], 1)), 2),
        ink=round(mass / (im.width * im.height), 3),
        hue=None if ch is None else round(ch, 1),
        family=family,
        palette=palette,
        accent=accent,
        lum=round(lum, 3),
        box=[x0, y0, x1, y1],
    )


files = sorted(glob.glob(os.path.join(REF, "unz", "*", "*.png")))
# 392.png is a 32x160 five-frame "VIP chest" HUD animation, not a weapon icon.
files = [f for f in files if re.match(r"^\d{3}\.png$", os.path.basename(f))
         and os.path.basename(f) != "392.png"]
assert len(files) == 727, len(files)

atlas = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
items = []
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA")
    n = i + 1
    im.save(os.path.join(OUT, "weapons", "%03d.png" % n))
    cx, cy = (i % COLS) * CELL, (i // COLS) * CELL
    atlas.alpha_composite(im, (cx + (CELL - im.width) // 2, cy + (CELL - im.height) // 2))
    m = measure(f) or {}
    m.update(id=n, cell=[cx, cy, CELL, CELL],
             ax=cx + (CELL - im.width) // 2, ay=cy + (CELL - im.height) // 2)
    items.append(m)

atlas.save(os.path.join(OUT, "atlas.png"), optimize=True)

# ---- monsters -------------------------------------------------------------
z = zipfile.ZipFile(os.path.join(REF, "monster.zip"))
TIERS = [
    ("slime", "Slime", 34), ("mushroom", "Mushroom", 40), ("snail", "Snail", 46),
    ("bunny", "Bunny", 52), ("duck", "Duck", 58), ("bluebird", "BlueBird", 64),
    ("bee", "Bee", 70), ("chicken", "Chicken", 76), ("angrypig", "AngryPig", 84),
    ("turtle", "Turtle", 92), ("fatbird", "FatBird", 100), ("radish", "Radish", 108),
    ("ghost", "Ghost", 118), ("bat", "Bat", 128), ("skull", "Skull", 140),
    ("plant", "Plant", 152), ("trunk", "Trunk", 164), ("rino", "Rino", 178),
    ("rocks", "Rocks", 192),
]
mons = []
for slug, folder, hp in TIERS:
    entries = [x for x in z.namelist() if x.startswith("monster/%s/" % folder) and x.endswith(".png")]
    # the folder's frame size is stated in at least one filename (e.g. "Idle (44x30).png")
    fw = fh = None
    for n in entries:
        mm = re.search(r"\((\d+)x(\d+)\)", n)
        if mm:
            fw, fh = int(mm.group(1)), int(mm.group(2))
            break

    def open_strip(kind):
        cand = [x for x in entries if n_kind(x, kind) and "bullet" not in x.lower()
                and "particle" not in x.lower()]
        if not cand:
            return None
        cand.sort(key=lambda x: (0 if os.path.basename(x).lower().startswith(kind.lower()) else 1, len(x)))
        name = cand[0]
        im = Image.open(io.BytesIO(z.read(name))).convert("RGBA")
        w, h = fw, fh
        if w is None:
            mm = re.search(r"\((\d+)x(\d+)\)", name)
            w, h = (int(mm.group(1)), int(mm.group(2))) if mm else (im.width, im.height)
        cnt = max(1, im.width // w)
        return name, im, w, h, cnt

    idle = open_strip("Idle")
    if idle is None:
        print("skip (no idle):", folder)
        continue
    hit = open_strip("Hit") or idle
    name_i, im_i, fw_i, fh_i, n_i = idle
    name_h, im_h, fw_h, fh_h, n_h = hit
    # union alpha bbox over both strips so the sprite never jumps between frames
    box = None
    for imx, fwx, fhx, cnt in ((im_i, fw_i, fh_i, n_i), (im_h, fw_h, fh_h, n_h)):
        for k in range(cnt):
            fr = imx.crop((k * fwx, 0, k * fwx + fwx, fhx))
            bb = fr.getbbox()
            if bb:
                box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]),
                                              max(box[2], bb[2]), max(box[3], bb[3]))
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0, y1 - y0
    for kind, imx, fwx, fhx, cnt in (("idle", im_i, fw_i, fh_i, n_i),
                                     ("hit", im_h, fw_h, fh_h, n_h)):
        strip = Image.new("RGBA", (cw * cnt, ch), (0, 0, 0, 0))
        for k in range(cnt):
            fr = imx.crop((k * fwx, 0, k * fwx + fwx, fhx))
            strip.alpha_composite(fr.crop((x0, y0, x1, y1)), (k * cw, 0))
        strip.save(os.path.join(OUT, "monsters", "%s-%s.png" % (slug, kind)))
    mons.append(dict(slug=slug, name=folder, hp=hp, fw=cw, fh=ch,
                     idle=n_i, hit=n_h))

json.dump({"count": len(items), "atlas": {"cols": COLS, "rows": ROWS, "cell": CELL},
           "items": items}, open(os.path.join(OUT, "weapons.json"), "w"), separators=(",", ":"))
json.dump({"monsters": mons}, open(os.path.join(OUT, "monsters.json"), "w"), separators=(",", ":"))

fam = Counter(i["family"] for i in items)
print("weapons:", len(items), "monsters:", len(mons))
print("families:", dict(fam))
print("len range:", min(i["len"] for i in items), max(i["len"] for i in items))
print("mass range:", min(i["mass"] for i in items), max(i["mass"] for i in items))
print("atlas bytes:", os.path.getsize(os.path.join(OUT, "atlas.png")))
print("json bytes:", os.path.getsize(os.path.join(OUT, "weapons.json")))
