#!/usr/bin/env python3
"""Synthesise the Forge 728 sound set (no samples, no licence questions).

Writes assets/sfx/{swing,clang,kill,fail,tick}.wav — 22.05 kHz mono 16-bit.
"""
import os
import struct
import wave

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "sfx")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def env(n, attack=0.002, decay=6.0):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t * decay)


def noise(n):
    return rng.normal(0, 1, n)


def onepole_lp(x, cut):
    """crude one-pole low-pass, cut as a 0..1 coefficient"""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += cut * (v - acc)
        y[i] = acc
    return y


def sweep_filter(x, f0, f1):
    """time-varying one-pole low-pass for whooshes"""
    y = np.empty_like(x)
    acc = 0.0
    n = len(x)
    for i, v in enumerate(x):
        f = f0 + (f1 - f0) * (i / n) ** 0.6
        c = 1 - np.exp(-2 * np.pi * f / SR)
        acc += c * (v - acc)
        y[i] = acc
    return y


def write(name, data, gain=0.9):
    data = np.asarray(data, dtype=np.float64)
    peak = np.max(np.abs(data)) or 1.0
    data = data / peak * gain
    pcm = (data * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(name, len(data) / SR, "s")


# --- whoosh: band-swept noise ------------------------------------------------
n = int(0.26 * SR)
w = sweep_filter(noise(n), 6000, 700) * env(n, 0.02, 9.0)
w += 0.25 * np.sin(2 * np.pi * 180 * np.arange(n) / SR) * env(n, 0.02, 14)
write("swing", w, 0.55)

# --- clang: metallic partials + noise attack --------------------------------
n = int(0.55 * SR)
t = np.arange(n) / SR
cl = (
    1.0 * np.sin(2 * np.pi * 523 * t) * np.exp(-t * 9)
    + 0.6 * np.sin(2 * np.pi * 1307 * t + 1.1) * np.exp(-t * 13)
    + 0.35 * np.sin(2 * np.pi * 2190 * t + 2.2) * np.exp(-t * 19)
    + 0.25 * np.sin(2 * np.pi * 349 * t) * np.exp(-t * 6)
)
cl += 0.5 * np.convolve(noise(n), np.ones(4) / 4, "same") * np.exp(-t * 40)
write("clang", cl, 0.75)

# --- kill: thud + shatter ---------------------------------------------------
n = int(0.7 * SR)
t = np.arange(n) / SR
k = 0.9 * np.sin(2 * np.pi * (90 - 40 * t) * t) * np.exp(-t * 7)
k += 0.5 * np.convolve(noise(n), np.ones(3) / 3, "same") * np.exp(-t * 12)
sh = sweep_filter(noise(n), 9000, 1500) * np.exp(-t * 5) * 0.5
k += sh
write("kill", k, 0.8)

# --- fail: falling two-tone -------------------------------------------------
n = int(0.5 * SR)
t = np.arange(n) / SR
f = np.where(t < 0.18, 330.0, 180.0)
ph = 2 * np.pi * np.cumsum(f) / SR
fa = np.sign(np.sin(ph)) * 0.35 * np.exp(-((t % 0.18)) * 6) * np.exp(-t * 2)
write("fail", fa, 0.5)

# --- tick: ui select --------------------------------------------------------
n = int(0.055 * SR)
t = np.arange(n) / SR
tk = np.sign(np.sin(2 * np.pi * 1400 * t)) * np.exp(-t * 90)
write("tick", tk, 0.35)
