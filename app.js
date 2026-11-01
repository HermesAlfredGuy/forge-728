/* FORGE 728 — the game. All damage maths is measured, see DESIGN.md. */
(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  const FAM_COLOR = {
    steel: "#9aa2a8", gold: "#e0a94a", verdant: "#79c47a", azure: "#4fb6e8",
    violet: "#a98bf0", crimson: "#e0574f", ember: "#ff5c1a",
  };
  const MAXLEN = 70.58;   // measured max Feret in the pack
  const MAXMASS = 2182;   // measured max opaque-pixel count in the pack
  const SWINGS = 3;

  const state = {
    items: [], monsters: [], rack: [], vis: [],
    sel: null, mon: null, monIdx: 0, hp: 0, maxHp: 0, swings: SWINGS,
    kills: 0, streak: 0, best: +(localStorage.getItem("forge728.best") || 0),
    sort: "id", fam: null, clearOnly: false,
    busy: false, dead: false, sound: true, removed: 0,
  };

  const yard = $("#yard"), grid = $("#grid"), dmgLayer = $("#dmgLayer"), banner = $("#banner");
  const weaponArt = $("#weaponArt");
  const monCanvas = $("#monster");
  const mctx = monCanvas.getContext("2d");
  const fx = $("#fx");
  const fctx = fx.getContext("2d");

  /* ------------------------------------------------------------------ audio */
  const SRC = { swing: "assets/sfx/swing.wav", clang: "assets/sfx/clang.wav", kill: "assets/sfx/kill.wav", fail: "assets/sfx/fail.wav", tick: "assets/sfx/tick.wav" };
  const VOL = { swing: 0.32, clang: 0.42, kill: 0.46, fail: 0.34, tick: 0.16 };
  const pool = {};
  function prime() {
    for (const [k, src] of Object.entries(SRC)) {
      const a = new Audio(src);
      a.preload = "auto";
      a.volume = VOL[k];
      pool[k] = a;
    }
  }
  function sfx(name) {
    if (!state.sound) return;
    const a = pool[name];
    if (!a) return;
    try { a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }

  /* ------------------------------------------------------------------- fx */
  const parts = [];
  let W = 0, H = 0, dpr = 1;
  function sizeFx() {
    const r = fx.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function emberSpawn() {
    parts.push({
      x: Math.random() * W, y: H * (0.55 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 9, vy: -(7 + Math.random() * 16),
      size: Math.random() < 0.25 ? 2 : 1,
      life: 0, max: 3.4 + Math.random() * 3.2,
      color: Math.random() < 0.72 ? "#ff7a33" : "#ffcf9a", kind: "ember",
    });
  }
  function burst(x, y, accent, power) {
    const n = 26 + Math.round(power * 18);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 300 * (0.6 + power);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
        size: Math.random() < 0.45 ? 4 : (Math.random() < 0.5 ? 3 : 2),
        life: 0, max: 0.4 + Math.random() * 0.55,
        color: Math.random() < 0.34 ? "#fff6e2" : accent, kind: "spark", grav: 950,
      });
    }
    parts.push({ x, y, life: 0, max: 0.28, kind: "flash", color: "#fff3dd", size: 40 + power * 20 });
    strip("spark", x, y, 116 + power * 34, 0, 0.5, state.sel && state.sel.family);
  }
  /* PixelZ free VFX pack (pixelz.io/effects, commercial use allowed), recoloured
     per family by scripts/make-vfx.py: a 6-frame slash strip and an 8-frame spark. */
  const VFX_KEYS = ["steel", "gold", "violet", "verdant", "crimson", "ember", "azure"];
  const vfxCache = {};
  function vfxImage(kind, fam) {
    const f = VFX_KEYS.includes(fam) ? fam : "ember";
    const key = kind + "-" + f;
    if (!vfxCache[key]) { const im = new Image(); im.src = `assets/vfx/${key}.png`; vfxCache[key] = im; }
    return vfxCache[key];
  }
  function strip(kind, x, y, size, rot, dur, fam) {
    parts.push({
      kind: "strip", x, y, life: 0, max: dur, size, rot: rot || 0,
      img: vfxImage(kind, fam),
      fw: kind === "slash" ? 63 : 65, fh: kind === "slash" ? 63 : 73,
      frames: kind === "slash" ? 6 : 8,
    });
  }
  function slash(x, y, accent, dir) {
    strip("slash", x, y, 196, -0.55, 0.375, state.sel && state.sel.family);
  }
  function burstOut(x, y, w, h) {
    for (let i = 0; i < 34; i++) {
      parts.push({
        x: x + Math.random() * w, y: y + Math.random() * h,
        vx: (Math.random() - 0.5) * 130, vy: -30 - Math.random() * 150,
        size: Math.random() < 0.5 ? 2 : 3, life: 0, max: 0.5 + Math.random() * 0.6,
        color: Math.random() < 0.4 ? "#fff6e2" : "#ff8a3d", kind: "spark", grav: 520,
      });
    }
  }

  let last = performance.now();
  let fxPaused = false, pauseFrames = 0;
  function loop(now) {
    if (fxPaused) { last = now; requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fctx.clearRect(0, 0, W, H);
    if (Math.random() < dt * 26) emberSpawn();

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { parts.splice(i, 1); continue; }
      if (p.kind === "ember") {
        p.x += p.vx * dt + Math.sin((p.life + p.x) * 1.7) * 6 * dt;
        p.y += p.vy * dt;
        p.vy *= 0.999;
        fctx.globalAlpha = (1 - t) * 0.75;
        fctx.fillStyle = p.color;
        fctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      } else if (p.kind === "spark") {
        p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.985;
        fctx.globalAlpha = 1 - t;
        fctx.fillStyle = p.color;
        const s = p.size * (1 - t * 0.55);
        fctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
      } else if (p.kind === "flash") {
        const g = fctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (0.5 + t));
        g.addColorStop(0, p.color);
        g.addColorStop(1, "rgba(255,243,221,0)");
        fctx.globalAlpha = (1 - t) * 0.85;
        fctx.fillStyle = g;
        fctx.beginPath();
        fctx.arc(p.x, p.y, p.size * (0.5 + t), 0, Math.PI * 2);
        fctx.fill();
      } else if (p.kind === "strip") {
        if (!p.img || !p.img.complete || !p.img.naturalWidth) continue;
        const fi = Math.min(p.frames - 1, Math.floor(t * p.frames));
        const w = p.size, h = p.size * (p.fh / p.fw);
        fctx.save();
        fctx.imageSmoothingEnabled = false;
        fctx.translate(p.x, p.y);
        fctx.rotate(p.rot);
        fctx.globalAlpha = 1;
        fctx.drawImage(p.img, fi * p.fw, 0, p.fw, p.fh, -w / 2, -h / 2, w, h);
        fctx.restore();
      } else if (p.kind === "slash") {
        if (p.life < 0) continue;
        fctx.save();
        fctx.translate(p.x, p.y);
        fctx.rotate(-0.62 + (p.tilt || 0));
        fctx.globalAlpha = (1 - t) * 0.95;
        fctx.strokeStyle = p.color;
        fctx.lineWidth = 4 + 4 * (1 - t);
        fctx.lineCap = "butt";
        const r = p.size * (0.62 + t * 0.5);
        fctx.beginPath();
        fctx.arc(0, 0, r, -0.95 + t * 0.2, 0.95 + t * 0.2);
        fctx.stroke();
        fctx.restore();
      } else if (p.kind === "ring") {
        // pixel diamond shockwave
        fctx.globalAlpha = (1 - t) * 0.9;
        fctx.strokeStyle = p.color;
        const r = p.size * (0.5 + t * 2.6);
        fctx.lineWidth = 2;
        fctx.beginPath();
        fctx.moveTo(p.x, p.y - r);
        fctx.lineTo(p.x + r * 1.25, p.y);
        fctx.lineTo(p.x, p.y + r);
        fctx.lineTo(p.x - r * 1.25, p.y);
        fctx.closePath();
        fctx.stroke();
      }
    }
    fctx.globalAlpha = 1;
    if (pauseFrames > 0) { pauseFrames -= 1; if (pauseFrames === 0) fxPaused = true; }
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------- monsters */
  const monImgs = {};
  let monFrame = 0, monAnimStart = performance.now(), monHitAt = -1, monFlash = 0, monScale = 3;

  function loadMonsterSprites() {
    for (const m of state.monsters) {
      const img = new Image();
      img.src = `assets/monsters/${m.slug}-idle.png`;
      const hit = new Image();
      hit.src = `assets/monsters/${m.slug}-hit.png`;
      monImgs[m.slug] = { idle: img, hit };
    }
  }

  function monScaleFor(m) {
    const h = yard.getBoundingClientRect().height || 320;
    const target = Math.min(300, Math.max(96, h * 0.5));
    const slot = document.querySelector(".mon-slot").getBoundingClientRect().width || 340;
    const byH = Math.round(target / m.fh);
    const byW = Math.floor((slot - 2) / m.fw);
    return Math.max(2, Math.min(byH, byW));
  }

  function drawMonster(now) {
    if (!state.mon) return;
    const m = state.mon, im = monImgs[m.slug];
    if (!im || !im.idle.complete || !im.idle.naturalWidth) return;
    const hit = monHitAt > 0 && now - monHitAt < 210;
    const strip = hit ? im.hit : im.idle;
    const count = hit ? m.hit : m.idle;
    if (hit) {
      const f = Math.min(count - 1, Math.floor((now - monHitAt) / 28));
      monFrame = f;
    } else {
      monFrame = Math.floor((now - monAnimStart) / (state.dead ? 60 : 105)) % count;
    }
    const s = monScale;
    mctx.clearRect(0, 0, monCanvas.width, monCanvas.height);
    mctx.imageSmoothingEnabled = false;
    let dx = 0, dy = 0;
    if (hit) {
      const k = Math.max(0, 1 - (now - monHitAt) / 200);
      dx = Math.round(Math.sin((now - monHitAt) * 0.6) * 5 * k);
      dy = Math.round(-2 * k);
    }
    mctx.drawImage(strip, monFrame * m.fw, 0, m.fw, m.fh, dx, dy, m.fw * s, m.fh * s);
    if (monFlash > 0) {
      mctx.globalCompositeOperation = "source-atop";
      mctx.fillStyle = `rgba(255,248,232,${monFlash})`;
      mctx.fillRect(0, 0, monCanvas.width, monCanvas.height);
      mctx.globalCompositeOperation = "source-over";
      monFlash = Math.max(0, monFlash - 0.09);
    }
  }

  function mountMonster(m) {
    state.mon = m;
    monScale = monScaleFor(m);
    monCanvas.width = m.fw * monScale;
    monCanvas.height = m.fh * monScale;
    monCanvas.style.width = (m.fw * monScale) + "px";
    monCanvas.style.height = (m.fh * monScale) + "px";
    const sh = $("#monShadow");
    const sw = Math.round(m.fw * monScale * 0.92);
    sh.style.width = sw + "px";
    sh.style.height = Math.round(sw / 4) + "px";
    monAnimStart = performance.now();
    monHitAt = -1;
    monFlash = 0;
    $("#ghostId").textContent = String(state.sel ? state.sel.id : 1).padStart(3, "0");
    $("#monName").textContent = m.name.toUpperCase();
    $("#monTier").textContent = "tier " + String(state.monIdx + 1).padStart(2, "0") + " / " + state.monsters.length;
  }

  /* --------------------------------------------------------------- scoring */
  function dmgOf(it) {
    return Math.max(1, Math.round(60 * it.len / MAXLEN + 60 * it.mass / MAXMASS));
  }
  function swingsNeeded(it, hp) {
    return Math.ceil(hp / dmgOf(it));
  }

  /* ------------------------------------------------------------- rack view */
  function buildRack() {
    const frag = document.createDocumentFragment();
    for (const it of state.items) {
      const t = el("div", "tile");
      t.style.backgroundPosition = `-${it.ax}px -${it.ay}px`;
      t.dataset.id = it.id;
      t.title = `#${String(it.id).padStart(3, "0")} · ${it.family} · reach ${it.len.toFixed(1)}px · mass ${it.mass}px · dmg ${dmgOf(it)}`;
      t.setAttribute("role", "button");
      t.setAttribute("aria-label", `weapon ${it.id}`);
      it._el = t;
      frag.appendChild(t);
    }
    grid.appendChild(frag);
    state.rack = state.items;

    grid.addEventListener("click", (e) => {
      const t = e.target.closest(".tile");
      if (!t) return;
      select(+t.dataset.id, true);
    });

    const fams = $("#fams");
    const counts = {};
    for (const it of state.items) counts[it.family] = (counts[it.family] || 0) + 1;
    const order = ["steel", "gold", "violet", "verdant", "crimson", "ember", "azure"];
    const all = el("button", "fam on");
    all.innerHTML = `<i style="background:#f2ead9"></i>all <b>${state.items.length}</b>`;
    all.dataset.fam = "";
    fams.appendChild(all);
    for (const f of order) {
      const b = el("button", "fam");
      b.dataset.fam = f;
      b.innerHTML = `<i style="background:${FAM_COLOR[f]}"></i>${f} <b>${counts[f] || 0}</b>`;
      fams.appendChild(b);
    }
    fams.addEventListener("click", (e) => {
      const b = e.target.closest(".fam");
      if (!b) return;
      state.fam = b.dataset.fam || null;
      for (const x of fams.children) x.classList.toggle("on", x === b);
      applyView();
    });

    $("#sort").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.sort = b.dataset.sort;
      for (const x of $("#sort").children) x.classList.toggle("on", x === b);
      applyView();
    });

    $("#clearOnly").addEventListener("change", (e) => {
      state.clearOnly = e.target.checked;
      applyView();
    });
  }

  function cmp(a, b) {
    if (state.sort === "len") return b.len - a.len;
    if (state.sort === "mass") return b.mass - a.mass;
    if (state.sort === "dmg") return dmgOf(b) - dmgOf(a);
    return a.id - b.id;
  }

  function passes(it) {
    if (state.fam && it.family !== state.fam) return false;
    if (state.clearOnly && !state.dead && swingsNeeded(it, state.hp) > state.swings) return false;
    return true;
  }

  function applyView() {
    const vis = state.items.filter(passes).sort(cmp);
    const set = new Set(vis);
    for (const it of state.items) if (!set.has(it)) it._el.hidden = true;
    const frag = document.createDocumentFragment();
    for (const it of vis) { it._el.hidden = false; frag.appendChild(it._el); }
    grid.appendChild(frag);
    state.vis = vis;
    $("#rackCount").textContent = vis.length;
    $("#gridEmpty").hidden = vis.length > 0;
    updateClears();
  }

  function updateClears() {
    let n = 0;
    for (const it of state.items) {
      const ok = !state.dead && swingsNeeded(it, state.hp) <= state.swings;
      if (ok) n++;
      if (state.clearOnly && !ok) continue;
      it._el.classList.toggle("clears", ok);
    }
    $("#clearCount").textContent = n;
  }

  /* -------------------------------------------------------------- selection */
  function select(id, fromClick) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    if (state.sel && state.sel._el) state.sel._el.classList.remove("on");
    state.sel = it;
    it._el.classList.add("on");
    document.documentElement.style.setProperty("--acc", it.accent);
    renderWeapon(it);
    renderLedger(it);
    if (fromClick) sfx("tick");
    $("#strikeBtn").classList.add("armed");
    setTimeout(() => $("#strikeBtn").classList.remove("armed"), 520);
  }

  function renderWeapon(it) {
    const maxSide = Math.max(it.w, it.h);
    const host = weaponArt.getBoundingClientRect();
    const box = Math.max(96, Math.min(host.width || 200, (host.height || 190) * 1.02));
    const s = Math.max(2, Math.min(8, Math.round(box / maxSide)));
    weaponArt.innerHTML = "";
    const img = new Image();
    img.src = `assets/weapons/${String(it.id).padStart(3, "0")}.png`;
    img.width = it.w * s;
    img.height = it.h * s;
    img.alt = "";
    weaponArt.appendChild(img);
    $("#sigil").src = `assets/sigil-${it.family}.png`;
    $("#pedShaft").src = `assets/shaft-${it.family}.png`;
    $("#spot").style.background = `radial-gradient(closest-side, ${hexA(it.accent, 0.1)}, transparent 74%)`;
    $("#pedPlate").textContent = `#${String(it.id).padStart(3, "0")} · ${it.family}`;
    $("#ghostId").textContent = String(it.id).padStart(3, "0");
  }

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function renderLedger(it) {
    $("#ledId").textContent = "#" + String(it.id).padStart(3, "0");
    $("#ledFam").textContent = it.family + (it.hue == null ? "" : ` · ${Math.round(it.hue)}°`);
    $("#ledFam").style.setProperty("--acc", it.accent);
    $("#ledLen").textContent = it.len.toFixed(1) + "px";
    $("#ledMass").textContent = it.mass + "px";
    $("#ledDmg").textContent = dmgOf(it);
    const sw = $("#ledSwa");
    sw.innerHTML = "";
    for (const c of it.palette.slice(0, 5)) {
      const i = el("i");
      i.style.background = c;
      sw.appendChild(i);
    }
    const note = $("#ledNote");
    note.className = "led-note";
    if (state.dead) { note.textContent = "next monster coming…"; return; }
    const need = swingsNeeded(it, state.hp);
    if (need === 1) { note.textContent = `clears ${state.mon.name} in 1 swing`; note.classList.add("good"); }
    else if (need <= state.swings) { note.textContent = `clears in ${need} swings — ${state.swings} left`; note.classList.add("good"); }
    else if (need <= SWINGS) { note.textContent = `needs ${need} swings — you only have ${state.swings}`; note.classList.add("warn"); }
    else { note.textContent = `cannot clear ${state.mon.name} before it flees`; note.classList.add("warn"); }
  }

  /* ------------------------------------------------------------------- hud */
  function renderHud() {
    const pct = Math.max(0, state.hp / state.maxHp) * 100;
    $("#hpFill").style.width = pct + "%";
    $("#hpChip").style.width = pct + "%";
    $("#hpNum").textContent = Math.max(0, Math.round(state.hp)) + " / " + state.maxHp;
    const sw = $("#swings");
    if (!sw.children.length) for (let i = 0; i < SWINGS; i++) sw.appendChild(el("i", "swing"));
    [...sw.children].forEach((n, i) => n.classList.toggle("spent", i >= state.swings));
    $("#kills").textContent = state.kills;
    $("#streak").textContent = state.streak;
    $("#strikeSub").textContent = state.dead ? "WAIT" : state.busy ? "…" : "SPACE";
  }

  function bannerMsg(text, ms = 900) {
    banner.textContent = text;
    banner.classList.add("show");
    clearTimeout(bannerMsg._t);
    bannerMsg._t = setTimeout(() => banner.classList.remove("show"), ms);
  }

  /* ----------------------------------------------------------------- fight */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function anim(node, frames, opts) {
    return node.animate(frames, Object.assign({ fill: "none", easing: "linear" }, opts)).finished.catch(() => {});
  }

  function spawnMonster(fresh) {
    const total = state.monsters.length;
    const tier = Math.min(total - 1, state.kills % total);
    state.monIdx = tier;
    const base = state.monsters[tier];
    const loop = Math.floor(state.kills / total);
    state.maxHp = Math.round(base.hp * (1 + loop * 0.22));
    state.hp = state.maxHp;
    state.swings = SWINGS;
    state.dead = false;
    mountMonster(base);
    renderHud();
    if (fresh) {
      const r = monCanvas.getBoundingClientRect();
      burstOut(r.left - fx.getBoundingClientRect().left, r.top - fx.getBoundingClientRect().top, r.width, r.height);
    }
    monCanvas.animate(
      [{ opacity: 0, transform: "translateY(14px) scale(.9)" }, { opacity: 1, transform: "none" }],
      { duration: 320, easing: "cubic-bezier(.2,.9,.2,1)" });
    if (state.sel) renderLedger(state.sel);
    updateClears();
  }

  async function strike() {
    if (state.busy || state.dead || !state.sel) return;
    state.busy = true;
    renderHud();
    const it = state.sel;
    const dmg = dmgOf(it);
    const img = weaponArt.firstElementChild;
    const arenaRect = $("#arena").getBoundingClientRect();
    const yardRect = yard.getBoundingClientRect();
    const wRect = weaponArt.getBoundingClientRect();
    const mRect = monCanvas.getBoundingClientRect();
    const impactX = mRect.left - yardRect.left + mRect.width * 0.42;
    const impactY = mRect.top - yardRect.top + mRect.height * 0.5;

    sfx("swing");

    // trail ghosts
    const ghosts = [];
    for (let i = 0; i < 2; i++) {
      if (!img) break;
      const g = img.cloneNode();
      g.style.position = "fixed";
      g.style.left = wRect.left + "px";
      g.style.top = wRect.top + "px";
      g.style.width = wRect.width + "px";
      g.style.height = wRect.height + "px";
      g.style.opacity = String(0.34 - i * 0.12);
      g.style.pointerEvents = "none";
      g.style.zIndex = "40";
      g.style.mixBlendMode = "screen";
      document.body.appendChild(g);
      ghosts.push(g);
    }
    const dx = impactX - (wRect.left - yardRect.left + wRect.width / 2);
    const dy = impactY - (wRect.top - yardRect.top + wRect.height / 2);

    const swingIn = [
      { transform: "translate(0,0) rotate(0deg) scale(1)" },
      { transform: `translate(${dx * 0.06 - 12}px, ${dy * 0.02 - 16}px) rotate(-30deg) scale(1.04)` },
    ];
    const swingOut = [
      { transform: `translate(${dx * 0.06 - 12}px, ${dy * 0.02 - 16}px) rotate(-30deg) scale(1.04)` },
      { transform: `translate(${dx * 0.92}px, ${dy * 0.86}px) rotate(48deg) scale(1.16)` },
    ];

    anim(weaponArt, swingIn, { duration: 135, easing: "cubic-bezier(.3,.7,.3,1)" });

    ghosts.forEach((g, i) => {
      g.animate([
        { transform: "translate(0,0) rotate(0deg)", opacity: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.45}px) rotate(10deg)`, opacity: 0.3 },
        { transform: `translate(${dx * 0.92}px, ${dy * 0.86}px) rotate(48deg)`, opacity: 0 },
      ], { duration: 200, delay: 70 + i * 26, easing: "cubic-bezier(.2,.8,.3,1)", fill: "none" })
        .finished.catch(() => {}).then(() => g.remove());
    });

    await wait(132);
    anim(weaponArt, swingOut, { duration: 130, easing: "cubic-bezier(.5,.05,.9,.6)", fill: "forwards" });
    await wait(132);

    // ---- impact
    sfx("clang");
    const fxX = impactX + (yardRect.left - arenaRect.left);
    const fxY = impactY + (yardRect.top - arenaRect.top);
    slash(fxX, fxY, it.accent, 1);
    burst(fxX, fxY, it.accent, Math.min(1.4, dmg / 90));
    monHitAt = performance.now();
    monFlash = 0.95;
    const fl = $("#flash");
    fl.animate([{ opacity: 0.42 }, { opacity: 0 }], { duration: 150, easing: "ease-out" });
    const shake = 4 + Math.min(10, it.mass / 260);
    shakeArena(shake);

    state.hp = Math.max(0, state.hp - dmg);
    state.swings -= 1;
    floatDmg(impactX, impactY, dmg);
    renderHud();

    const hitStop = 95;
    await wait(hitStop);

    anim(weaponArt, [
      { transform: `translate(${dx * 0.92}px, ${dy * 0.86}px) rotate(48deg) scale(1.16)` },
      { transform: "translate(0,0) rotate(0deg) scale(1)" },
    ], { duration: 320, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" })
      .then(() => { weaponArt.style.transform = ""; });

    if (state.hp <= 0) {
      state.dead = true;
      state.busy = false;
      state.kills += 1;
      state.streak += 1;
      if (state.streak > state.best) { state.best = state.streak; localStorage.setItem("forge728.best", state.best); }
      renderHud();
      await wait(150);
      sfx("kill");
      const r = monCanvas.getBoundingClientRect();
      burstOut(r.left - arenaRect.left, r.top - arenaRect.top, r.width, r.height);
      monCanvas.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-10px) scale(.82)" }],
        { duration: 300, easing: "cubic-bezier(.4,0,.9,.4)" });
      bannerMsg("SLAIN", 620);
      await wait(430);
      spawnMonster(true);
      state.busy = false;
      renderHud();
      return;
    }

    if (state.swings <= 0) {
      state.busy = false;
      state.dead = true;
      state.streak = 0;
      renderHud();
      sfx("fail");
      bannerMsg("IT FLED", 900);
      await wait(640);
      state.busy = true;
      spawnMonster(false);
      state.kills = Math.max(0, state.kills - 1);
      state.dead = false;
      state.busy = false;
      renderHud();
      if (state.sel) renderLedger(state.sel);
      return;
    }

    state.busy = false;
    renderHud();
    if (state.sel) renderLedger(state.sel);
    updateClears();
  }

  function shakeArena(power) {
    const arena = $("#arena");
    arena.animate([
      { transform: "translate(0,0)" },
      { transform: `translate(${-power}px, ${power * 0.4}px)` },
      { transform: `translate(${power * 0.8}px, ${-power * 0.5}px)` },
      { transform: `translate(${-power * 0.5}px, ${power * 0.2}px)` },
      { transform: "translate(0,0)" },
    ], { duration: 210, easing: "ease-out" });
  }

  function floatDmg(x, y, dmg) {
    const d = el("div", "dmg" + (dmg >= 80 ? " crit" : ""));
    d.textContent = String(dmg);
    d.style.left = x + "px";
    d.style.top = (y - 92) + "px";
    d.style.setProperty("--dc", state.sel.accent);
    dmgLayer.appendChild(d);
    d.animate([
      { transform: "translate(-50%,-50%) scale(.6)", opacity: 0 },
      { transform: "translate(-50%,-64%) scale(1.22)", opacity: 1, offset: 0.18 },
      { transform: "translate(-50%,-72%) scale(1)", opacity: 1, offset: 0.4 },
      { transform: "translate(-50%,-130%) scale(1)", opacity: 0 },
    ], { duration: 980, easing: "cubic-bezier(.2,.7,.2,1)" }).finished.catch(() => {}).then(() => d.remove());
  }

  /* ---------------------------------------------------------------- runtime */
  function layoutStage() {
    // stand the actors on the forge floor, in front of the wall
    yard.style.paddingBottom = "0px";
    const arena = $("#arena").getBoundingClientRect();
    const yardBox = yard.getBoundingClientRect();
    const horizon = arena.height * 0.80;   // stand on the floor, in front of the wall
    const pad = Math.round((yardBox.bottom - arena.top) - horizon);
    yard.style.paddingBottom = Math.max(8, pad) + "px";
  }

  function onResize() {
    sizeFx();
    layoutStage();
    if (state.mon) {
      monScale = monScaleFor(state.mon);
      monCanvas.width = state.mon.fw * monScale;
      monCanvas.height = state.mon.fh * monScale;
      monCanvas.style.width = (state.mon.fw * monScale) + "px";
      monCanvas.style.height = (state.mon.fh * monScale) + "px";
    }
    if (state.sel) renderWeapon(state.sel);
  }

  function bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        if (document.activeElement && document.activeElement.tagName === "INPUT") return;
        e.preventDefault();
        strike();
        return;
      }
      if (!state.sel) return;
      const cols = Math.max(1, Math.floor((grid.clientWidth + 5) / 77));
      const idx = state.vis.indexOf(state.sel);
      let next = idx;
      if (e.key === "ArrowRight") next = idx + 1;
      else if (e.key === "ArrowLeft") next = idx - 1;
      else if (e.key === "ArrowDown") next = idx + cols;
      else if (e.key === "ArrowUp") next = idx - cols;
      else return;
      e.preventDefault();
      const it = state.vis[Math.max(0, Math.min(state.vis.length - 1, next))];
      if (it) {
        select(it.id, false);
        it._el.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function bindUI() {
    $("#strikeBtn").addEventListener("click", strike);
    $("#snd").addEventListener("click", (e) => {
      state.sound = !state.sound;
      e.currentTarget.setAttribute("aria-pressed", String(state.sound));
    });
  }

  function autoplay() {
    const q = new URLSearchParams(location.search);
    if (!q.has("autoplay")) return;
    const pick = () => {
      const best = [...state.items].sort((a, b) => dmgOf(b) - dmgOf(a))[(Math.random() * 3) | 0];
      select(best.id, false);
    };
    pick();
    setInterval(() => {
      if (state.busy) return;
      if (swingsNeeded(state.sel, state.hp) > state.swings) pick();
      strike();
    }, 1250);
  }

  async function boot() {
    prime();
    sizeFx();
    requestAnimationFrame(loop);
    const [w, m] = await Promise.all([
      fetch("assets/weapons.json").then((r) => r.json()),
      fetch("assets/monsters.json").then((r) => r.json()),
    ]);
    state.items = w.items;
    state.monsters = m.monsters;
    $("#metaWeapons").textContent = w.items.length;
    $("#metaMonsters").textContent = m.monsters.length;
    loadMonsterSprites();
    buildRack();
    bindUI();
    bindKeys();
    state.kills = 0;
    VFX_KEYS.forEach((f) => { vfxImage("slash", f); vfxImage("spark", f); });
    layoutStage();
    spawnMonster(false);
    applyView();
    select(state.items[0].id, false);
    window.addEventListener("resize", onResize);
    requestAnimationFrame(function draw(now) {
      drawMonster(now);
      requestAnimationFrame(draw);
    });
    // QA hook: freeze the FX at a chosen frame of the slash / spark strip
    function fxPose(kind, frac, x, y, size, rot, fam) {
      const dur = kind === "slash" ? 0.375 : 0.5;
      const im = vfxImage(kind, fam);
      const go = () => {
        parts.length = 0; fxPaused = false;
        parts.push({ kind: "strip", x, y, life: frac * dur * 0.985, max: dur, size, rot: rot || 0,
          img: im, fw: kind === "slash" ? 63 : 65,
          fh: kind === "slash" ? 63 : 73, frames: kind === "slash" ? 6 : 8 });
        pauseFrames = 2;
      };
      if (im.complete && im.naturalWidth) go(); else im.onload = go;
    }
    window.__game = { state, strike, select, dmgOf, swingsNeeded, applyView, fxPose };
    autoplay();
  }

  boot();
})();
