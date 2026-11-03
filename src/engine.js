// Lower-third rendering engine. Pure canvas 2D drawing: render(ctx, state, t).
// Used by both the live preview and the frame-accurate exporter.
(function (global) {
  const { getEasing } = global.Easing;

  // ---------- Animation catalogue ----------
  const BACKDROP_ANIMS = {
    none: 'None (cut)',
    fade: 'Fade',
    slideLeft: 'Slide · left',
    slideRight: 'Slide · right',
    slideUp: 'Slide · bottom',
    slideDown: 'Slide · top',
    wipeRight: 'Wipe · left → right',
    wipeLeft: 'Wipe · right → left',
    wipeUp: 'Wipe · bottom → top',
    wipeDown: 'Wipe · top → bottom',
    wipeCenter: 'Wipe · from center',
    growX: 'Grow width (from left)',
    growXCenter: 'Grow width (from center)',
    growY: 'Grow height',
    scale: 'Scale / zoom',
    pop: 'Pop (scale + fade)',
    blur: 'Blur in',
    flipX: 'Flip (3D-ish)',
  };
  const TEXT_ANIMS = {
    none: 'None (cut)',
    fade: 'Fade',
    slideLeft: 'Slide · left',
    slideRight: 'Slide · right',
    slideUp: 'Slide · bottom',
    slideDown: 'Slide · top',
    maskUp: 'Mask reveal · up',
    maskDown: 'Mask reveal · down',
    wipeRight: 'Wipe · left → right',
    wipeLeft: 'Wipe · right → left',
    scale: 'Scale / zoom',
    pop: 'Pop (scale + fade)',
    blur: 'Blur in',
    tracking: 'Tracking (letter spread)',
    typewriter: 'Typewriter',
    lettersFade: 'Letters · fade',
    lettersRise: 'Letters · rise',
    lettersDrop: 'Letters · drop',
    lettersScale: 'Letters · scale',
    lettersBlur: 'Letters · blur',
    wordsRise: 'Words · rise',
  };
  const PER_CHAR = new Set(['lettersFade', 'lettersRise', 'lettersDrop', 'lettersScale', 'lettersBlur', 'typewriter']);
  const PER_WORD = new Set(['wordsRise']);

  const SHAPES = {
    rect: 'Rectangle',
    rounded: 'Rounded rectangle',
    pill: 'Pill',
    slant: 'Slanted (parallelogram)',
    accent: 'Box + accent bar',
    twoTone: 'Two-tone (stacked boxes)',
    underline: 'Underline only',
    sideBar: 'Side bar only',
    corners: 'Corner brackets',
  };

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ---------- Timing ----------
  // Returns { visible, phase, raw, p } where p is eased visibility (1 = fully on).
  const NO_ANIM_DIR = { type: 'none', duration: 0.5, delay: 0, offset: 0, easing: 'linear' };
  function phaseAt(anim, t, duration) {
    // A layer without an animation (or with half of one) just holds.
    const inA = (anim && anim.in) || NO_ANIM_DIR, outA = (anim && anim.out) || NO_ANIM_DIR;
    const inStart = inA.delay || 0;
    const inDur = inA.type === 'none' ? 0 : Math.max(0.001, inA.duration);
    const outEnd = duration - (outA.offset || 0);
    const outDur = outA.type === 'none' ? 0 : Math.max(0.001, outA.duration);
    const outStart = outEnd - outDur;
    if (t < inStart) return { visible: false, phase: 'before', raw: 0, p: 0, anim: inA };
    if (inDur > 0 && t < inStart + inDur) {
      const raw = (t - inStart) / inDur;
      return { visible: true, phase: 'in', raw, ease: getEasing(inA.easing, inA.bezier), anim: inA, p: getEasing(inA.easing, inA.bezier)(raw) };
    }
    if (outA.type === 'none') {
      return t <= outEnd || outA.offset === 0 ? { visible: true, phase: 'hold', raw: 1, p: 1 } : { visible: false, phase: 'after', raw: 1, p: 0, anim: outA };
    }
    if (t < outStart) return { visible: true, phase: 'hold', raw: 1, p: 1 };
    if (t < outEnd) {
      const raw = (t - outStart) / outDur;
      const ease = getEasing(outA.easing, outA.bezier);
      return { visible: true, phase: 'out', raw, ease, anim: outA, p: 1 - ease(raw) };
    }
    return { visible: false, phase: 'after', raw: 1, p: 0, anim: outA };
  }

  function timingSpans(anim, duration) {
    anim = { in: (anim && anim.in) || NO_ANIM_DIR, out: (anim && anim.out) || NO_ANIM_DIR };
    const inStart = anim.in.delay || 0;
    const inEnd = anim.in.type === 'none' ? inStart : inStart + anim.in.duration;
    const outEnd = duration - (anim.out.offset || 0);
    const outStart = anim.out.type === 'none' ? outEnd : outEnd - anim.out.duration;
    return { inStart, inEnd, outStart, outEnd };
  }

  // ---------- Fonts & text measurement ----------
  function fontString(s, sizeOverride) {
    return `${s.italic ? 'italic ' : ''}${s.weight || 400} ${sizeOverride || s.size}px "${s.font}", sans-serif`;
  }
  function displayText(s) {
    const txt = s.text || '';
    return s.uppercase ? txt.toUpperCase() : txt;
  }
  function setTextStyle(ctx, s) {
    ctx.font = fontString(s);
    ctx.letterSpacing = `${s.letterSpacing || 0}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }
  function measureLine(ctx, s) {
    const text = displayText(s);
    setTextStyle(ctx, s);
    if (!text.trim()) return { text, width: 0, ascent: 0, descent: 0, empty: true };
    const m = ctx.measureText(text);
    const cap = ctx.measureText('H').actualBoundingBoxAscent || s.size * 0.7;
    const desc = s.uppercase ? 0 : (ctx.measureText('gjpqy').actualBoundingBoxDescent || s.size * 0.2);
    // Trailing letter-spacing is not visible; remove it from the width.
    const width = Math.max(0, m.width - (s.letterSpacing || 0));
    return { text, width, ascent: cap, descent: desc, empty: false };
  }

  // ---------- Layout ----------
  function computeLayout(ctx, state) {
    const { backdrop: bd, title, subtitle, layout } = state;
    ctx.save();
    const tm = measureLine(ctx, title);
    const sm = measureLine(ctx, subtitle);
    ctx.restore();
    const gap = tm.empty || sm.empty ? 0 : layout.lineGap;
    const contentW = Math.max(tm.width, sm.width);
    const contentH = tm.ascent + tm.descent + gap + sm.ascent + sm.descent;

    const shape = bd.type === 'shape' ? bd.shape : bd.type;
    let padL = bd.padX, padR = bd.padX;
    if (bd.type === 'shape') {
      if (shape === 'accent' || shape === 'sideBar') padL += bd.accentWidth + bd.accentGap;
      if (shape === 'slant') { padL += bd.skew; padR += bd.skew; }
      if (shape === 'pill') { const r = (contentH + 2 * bd.padY) / 2; padL = Math.max(padL, r * 0.75); padR = Math.max(padR, r * 0.75); }
    }

    let boxW = contentW + padL + padR;
    let boxH = contentH + 2 * bd.padY;
    if (bd.type === 'shape' && shape === 'underline') boxH += bd.accentGap + bd.accentWidth - bd.padY;
    if (bd.fixedWidth > 0) boxW = bd.fixedWidth;
    boxW = Math.max(boxW, bd.minWidth || 0);

    let img = null;
    if (bd.type === 'image' && bd.image && bd.image.src) {
      img = getImage(bd.image.src);
      if (bd.image.fit === 'natural' && img && img.complete && img.naturalWidth) {
        boxW = img.naturalWidth * bd.image.scale;
        boxH = img.naturalHeight * bd.image.scale;
      }
    }

    // Two-tone: separate title and subtitle boxes stacked.
    let tt = null;
    if (bd.type === 'shape' && shape === 'twoTone') {
      const py2 = bd.padY * 0.6;
      const tW = Math.max(tm.width + padL + padR, bd.minWidth || 0, bd.fixedWidth || 0);
      const tH = tm.ascent + tm.descent + 2 * bd.padY;
      const sW = sm.empty ? 0 : sm.width + padL + padR;
      const sH = sm.empty ? 0 : sm.ascent + sm.descent + 2 * py2;
      tt = { tW, tH, sW, sH, py2 };
      boxW = Math.max(tW, sW);
      boxH = tH + sH;
    }

    // Anchor: (layout.x, layout.y) refers to the box's left/center/right and top/bottom.
    const x = layout.hAnchor === 'center' ? layout.x - boxW / 2 : layout.hAnchor === 'right' ? layout.x - boxW : layout.x;
    const y = layout.vAnchor === 'bottom' ? layout.y - boxH : layout.y;
    const innerL = x + padL, innerR = x + boxW - padR;
    const alignX = (w) => layout.align === 'center' ? (innerL + innerR) / 2 - w / 2 : layout.align === 'right' ? innerR - w : innerL;
    // Justify: spread letters so each line fills the inner width of the box.
    const justify = (line, l, r) => {
      if (layout.align !== 'justify' || line.empty) return line;
      const n = Array.from(line.text).length;
      const target = Math.max(line.width, r - l);
      if (n < 2) return line;
      return { ...line, x: l, extraLs: (target - line.width) / (n - 1), width: target };
    };

    let top = y + bd.padY + (bd.type === 'image' ? (bd.image.textOffsetY || 0) : 0);
    // For natural-size images, vertically center text inside the image.
    if (bd.type === 'image' && bd.image.fit === 'natural') top = y + (boxH - contentH) / 2 + (bd.image.textOffsetY || 0);
    const xShift = bd.type === 'image' ? (bd.image.textOffsetX || 0) : 0;

    const titleL = { ...tm, x: alignX(tm.width) + xShift, baseline: top + tm.ascent, top, bottom: top + tm.ascent + tm.descent };
    const subTop = titleL.bottom + gap;
    const subL = { ...sm, x: alignX(sm.width) + xShift, baseline: subTop + sm.ascent, top: subTop, bottom: subTop + sm.ascent + sm.descent };

    const out = { box: { x, y, w: boxW, h: boxH }, title: justify(titleL, innerL + xShift, innerR + xShift), subtitle: justify(subL, innerL + xShift, innerR + xShift), padL, padR, contentW, contentH };

    if (tt) {
      const { tW, tH, sW, sH, py2 } = tt;
      // Right-anchored stacks align their right edges.
      const bx = (w) => layout.hAnchor === 'right' ? x + boxW - w : layout.hAnchor === 'center' ? x + boxW / 2 - w / 2 : x;
      out.titleBox = { x: bx(tW), y, w: tW, h: tH };
      out.subBox = { x: bx(sW), y: y + tH, w: sW, h: sH };
      const ax = (w, b) => layout.align === 'center' ? b.x + b.w / 2 - w / 2 : layout.align === 'right' ? b.x + b.w - padR - w : b.x + padL;
      out.title = { ...tm, x: ax(tm.width, out.titleBox), baseline: y + bd.padY + tm.ascent, top: y + bd.padY, bottom: y + bd.padY + tm.ascent + tm.descent };
      out.subtitle = { ...sm, x: ax(sm.width, out.subBox), baseline: y + tH + py2 + sm.ascent, top: y + tH + py2, bottom: y + tH + py2 + sm.ascent + sm.descent };
      out.title = justify(out.title, out.titleBox.x + padL, out.titleBox.x + tW - padR);
      out.subtitle = justify(out.subtitle, out.subBox.x + padL, out.subBox.x + sW - padR);
    }
    return out;
  }

  // ---------- Image cache ----------
  const imageCache = new Map();
  let onImageLoad = null;
  function getImage(src) {
    if (!src) return null;
    let img = imageCache.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => onImageLoad && onImageLoad();
      img.src = src;
      imageCache.set(src, img);
    }
    return img;
  }
  function imagesReady(state) {
    const bd = state.backdrop;
    const srcs = [bd.type === 'image' && bd.image.src, bd.texture && bd.texture.enabled && bd.texture.src,
      ...Object.values(state.layers || {}).filter((l) => l.kind === 'image').map((l) => l.src)].filter(Boolean);
    return Promise.all(srcs.map((src) => {
      const img = getImage(src);
      if (img.complete) return null;
      return new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
    }));
  }

  // ---------- Keyframes ----------
  // state.keys = { 'title.transform.x': [{ t, v, e }] } — any numeric or #hex colour path can be keyed.
  // e is the easing used from that key to the next ('hold' keeps the value).
  function hexToRgb(h) {
    let x = h.slice(1); if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    const n = parseInt(x.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lerpValue(a, b, f) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * f;
    if (typeof a === 'string' && typeof b === 'string' && a[0] === '#' && b[0] === '#') {
      const A = hexToRgb(a), B = hexToRgb(b);
      return '#' + A.map((c, i) => Math.round(c + (B[i] - c) * f).toString(16).padStart(2, '0')).join('');
    }
    // Paths: point by point, when both keys have the same number of points.
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((p) => p && typeof p === 'object')) {
      return a.map((p, i) => { const q = b[i], o = { ...p }; for (const k of Object.keys(p)) if (typeof p[k] === 'number' && typeof q[k] === 'number') o[k] = p[k] + (q[k] - p[k]) * f; return o; });
    }
    return f < 1 ? a : b;
  }
  function valueAtKeys(ks, t) {
    if (!ks || !ks.length) return undefined;
    if (t <= ks[0].t) return ks[0].v;
    const last = ks[ks.length - 1];
    if (t >= last.t) return last.v;
    let i = 0; while (i < ks.length - 2 && ks[i + 1].t <= t) i++;
    const a = ks[i], b = ks[i + 1];
    if (a.e === 'hold') return a.v;
    const f = getEasing(a.e || 'easeInOutCubic', a.bezier)((t - a.t) / Math.max(1e-9, b.t - a.t));
    return lerpValue(a.v, b.v, f);
  }
  // Returns a copy of state with every keyed path replaced by its value at time t (copy-on-write).
  function resolveAt(state, t) {
    const keys = state.keys;
    if (!keys) return state;
    const paths = Object.keys(keys).filter((p) => keys[p] && keys[p].length);
    if (!paths.length) return state;
    const out = { ...state };
    const copied = new WeakSet([out]);
    for (const path of paths) {
      const parts = path.split('.');
      let cur = out, ok = true;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        const next = cur[k];
        if (next == null || typeof next !== 'object') { ok = false; break; }
        if (!copied.has(next)) { cur[k] = Array.isArray(next) ? [...next] : { ...next }; copied.add(cur[k]); }
        cur = cur[k];
      }
      if (ok) cur[parts[parts.length - 1]] = valueAtKeys(keys[path], t);
    }
    return out;
  }

  // ---------- Layer transform (Advanced) ----------
  const NO_TR = { x: 0, y: 0, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blur: 0, tracking: 0, anchorX: 50, anchorY: 50 };
  let layerBlur = 0;
  // Anchor point: where the layer scales and rotates from, in % of its box (50/50 = centre).
  function pivotOf(tr, b) {
    const ax = tr && tr.anchorX != null ? tr.anchorX : 50, ay = tr && tr.anchorY != null ? tr.anchorY : 50;
    return [b.x + (b.w * ax) / 100, b.y + (b.h * ay) / 100];
  }
  const anchored = (tr) => !!tr && ((tr.anchorX != null && tr.anchorX !== 50) || (tr.anchorY != null && tr.anchorY !== 50));
  function applyLayerTransform(ctx, tr, b, withAlpha = true) {
    if (!tr) return;
    const [cx, cy] = pivotOf(tr, b);
    if (tr.x || tr.y) ctx.translate(tr.x || 0, tr.y || 0);
    const sc = (tr.scale ?? 100) / 100, sx = sc * ((tr.scaleX ?? 100) / 100), sy = sc * ((tr.scaleY ?? 100) / 100);
    if (tr.rotation || sx !== 1 || sy !== 1) {
      ctx.translate(cx, cy);
      if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180);
      ctx.scale(Math.max(1e-4, sx), Math.max(1e-4, sy));
      ctx.translate(-cx, -cy);
    }
    if (withAlpha && (tr.opacity ?? 100) < 100) ctx.globalAlpha *= clamp((tr.opacity ?? 100) / 100);
  }
  // ---------- Idle loops (while the layer is on screen) ----------
  // anim.loop = { type, amount (%), period (s) }. Starts at rest when the In animation ends, eases
  // in over a moment and eases out before the Out animation, so nothing jumps.
  let togetherSpan = null;
  const LOOP_TYPES = { none: 'None', pulse: 'Pulse (gentle zoom)', float: 'Float (up and down)', drift: 'Drift (side to side)', breathe: 'Breathe (opacity)', wiggle: 'Wiggle (tilt)' };
  function loopAt(anim, t, duration) {
    const lp = anim && anim.loop;
    if (!lp || !lp.type || lp.type === 'none') return null;
    // "together": every layer uses the same window (after the last In, before the first Out), so the
    // whole design moves as one.
    const sp = lp.together && togetherSpan ? togetherSpan : timingSpans(anim, duration);
    if (t <= sp.inEnd || t >= sp.outStart) return null;
    const ramp = Math.min(1, (t - sp.inEnd) / 0.4, (sp.outStart - t) / 0.3);
    const k = ramp * ramp * (3 - 2 * ramp);
    const per = Math.max(0.2, lp.period || 2), a = (lp.amount ?? 50) / 100;
    const ph = ((t - sp.inEnd) / per) * Math.PI * 2;
    // v swings both ways (−1…1), u goes out and back (0…1); both start and end at rest.
    return { type: lp.type, v: Math.sin(ph) * k, u: ((1 - Math.cos(ph)) / 2) * k, a };
  }
  function applyLoop(ctx, anim, t, duration, b, pivot) {
    const L = loopAt(anim, t, duration);
    if (!L) return;
    const [cx, cy] = pivot || [b.x + b.w / 2, b.y + b.h / 2];
    switch (L.type) {
      case 'pulse': { const s = 1 + 0.06 * L.a * L.u; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); break; }
      case 'float': ctx.translate(0, -12 * L.a * L.v); break;
      case 'drift': ctx.translate(14 * L.a * L.v, 0); break;
      case 'breathe': ctx.globalAlpha *= 1 - 0.4 * L.a * L.u; break;
      case 'wiggle': ctx.translate(cx, cy); ctx.rotate((3 * L.a * L.v * Math.PI) / 180); ctx.translate(-cx, -cy); break;
      default: break;
    }
  }
  const blurFilter = (b) => (b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none');

  // ---------- Parenting ----------
  // A layer can follow another layer's transform (position, rotation, scale around its anchor),
  // like After Effects parenting. Opacity, blur and the parent's in/out animation are not inherited.
  function parentChain(state, id) {
    const out = [], seen = new Set([id]);
    let p = (getLayer(state, id) || {}).parent;
    while (p && !seen.has(p) && getLayer(state, p)) { out.unshift(p); seen.add(p); p = getLayer(state, p).parent; }
    return out; // root first
  }
  // The box a layer's transform pivots on, as drawn.
  function drawBox(state, L, id) {
    if (id === 'backdrop') return L.box;
    if (id === 'title' || id === 'subtitle') { const l = L[id]; return { x: l.x, y: l.top, w: l.width, h: (l.bottom - l.top) || state[id].size }; }
    return (L.extras || {})[id] || null;
  }
  function parentFrames(state, L, id) {
    const out = [];
    for (const p of parentChain(state, id)) { const b = drawBox(state, L, p); if (b) out.push({ id: p, tr: { ...NO_TR, ...(getLayer(state, p).transform || {}) }, b }); }
    return out;
  }
  // anim: also apply each parent *group's* in/out animation, so a group animates its children.
  function applyParents(ctx, state, L, id, anim = false) {
    for (const f of parentFrames(state, L, id)) {
      const g = getLayer(state, f.id), isGroup = !!g && g.kind === 'group';
      // Only a group passes its opacity down (After Effects parenting doesn't).
      applyLayerTransform(ctx, f.tr, f.b, anim && isGroup);
      // Children follow their parent's In/Out motion and loops (tethered, as in After Effects).
      // Only a group also passes on its fade, blur and wipe.
      if (anim && g && g.anim) {
        const ph = phaseAt(g.anim, curT, state.comp.duration);
        const r = animParams(effType(ph), ph.p, f.b, g.anim.distance, anchored(f.tr) ? pivotOf(f.tr, f.b) : null);
        applyParams(ctx, isGroup ? r : { ...r, alpha: 1, blur: 0, clip: null }, 200, 0);
        applyLoop(ctx, g.anim, curT, state.comp.duration, f.b, pivotOf(f.tr, f.b));
      }
    }
  }
  // A layer is hidden when a group it belongs to is hidden or not on screen yet / any more.
  function hiddenByGroup(state, id, t) {
    for (const p of parentChain(state, id)) {
      const g = getLayer(state, p);
      if (g && g.kind === 'group' && (g.visible === false || !phaseAt(g.anim, t, state.comp.duration).visible)) return true;
    }
    return false;
  }
  // Point through one transform (forward) and back (inverse).
  function fwdPt(tr, b, x, y) {
    const [cx, cy] = pivotOf(tr, b);
    const sc = (tr.scale ?? 100) / 100;
    let dx = (x - cx) * sc * ((tr.scaleX ?? 100) / 100), dy = (y - cy) * sc * ((tr.scaleY ?? 100) / 100);
    const a = ((tr.rotation || 0) * Math.PI) / 180;
    [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    return [dx + cx + (tr.x || 0), dy + cy + (tr.y || 0)];
  }
  function invPt(tr, b, x, y) {
    const [cx, cy] = pivotOf(tr, b);
    let px = x - (tr.x || 0) - cx, py = y - (tr.y || 0) - cy;
    const a = -((tr.rotation || 0) * Math.PI) / 180;
    [px, py] = [px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)];
    const sc = (tr.scale ?? 100) / 100 || 1e-4;
    return [px / (sc * ((tr.scaleX ?? 100) / 100) || 1e-4) + cx, py / (sc * ((tr.scaleY ?? 100) / 100) || 1e-4) + cy];
  }
  // Comp point → the space a layer's own transform lives in (undoing its parents).
  function toParentSpace(frames, x, y) { for (const f of frames || []) [x, y] = invPt(f.tr, f.b, x, y); return [x, y]; }
  function fromParentSpace(frames, x, y) { const fr = frames || []; for (let i = fr.length - 1; i >= 0; i--) [x, y] = fwdPt(fr[i].tr, fr[i].b, x, y); return [x, y]; }

  // ---------- Text animator range selector (After Effects style) ----------
  function selectorAmount(a, i, n) {
    if (n <= 0) return 0;
    let s = (a.start ?? 0) + (a.offset ?? 0), e = (a.end ?? 100) + (a.offset ?? 0);
    if (s > e) [s, e] = [e, s];
    const c0 = (i / n) * 100, c1 = ((i + 1) / n) * 100;
    let amt;
    const shape = a.shape || 'square';
    if (shape === 'square') amt = clamp((Math.min(e, c1) - Math.max(s, c0)) / (c1 - c0));
    else {
      const r = e - s <= 1e-6 ? ((c0 + c1) / 2 < s ? -1 : 2) : ((c0 + c1) / 2 - s) / (e - s);
      if (shape === 'rampUp') amt = r < 0 ? 0 : r > 1 ? 1 : r;
      else if (shape === 'rampDown') amt = r < 0 ? 1 : r > 1 ? 0 : 1 - r;
      else if (r < 0 || r > 1) amt = 0;
      else if (shape === 'triangle') amt = 1 - Math.abs(2 * r - 1);
      else if (shape === 'round') amt = Math.sqrt(Math.max(0, 1 - (2 * r - 1) ** 2));
      else amt = 0.5 - 0.5 * Math.cos(2 * Math.PI * r); // smooth
    }
    return amt * ((a.amount ?? 100) / 100);
  }

  // On the way out, directional wipes/masks are mirrored so the label describes the motion.
  const OUT_SWAP = { wipeLeft: 'wipeRight', wipeRight: 'wipeLeft', wipeUp: 'wipeDown', wipeDown: 'wipeUp', maskUp: 'maskDown', maskDown: 'maskUp' };
  // Before a layer comes in it sits at the start of its In; after it leaves, at the end of its Out
  // (children tethered to it follow it there).
  const effType = (ph) => (ph.phase === 'hold' || !ph.anim ? 'none' : ph.phase === 'out' ? OUT_SWAP[ph.anim.type] || ph.anim.type : ph.anim.type);

  // ---------- Generic element transform from animation ----------
  // b = element bounds. Returns parameters to apply around the element draw.
  // pivot: the layer's anchor point; scale / pop / grow-from-centre / flip animate around it.
  function animParams(type, p, b, dist, pivot) {
    const q = 1 - p;
    const r = { dx: 0, dy: 0, sx: 1, sy: 1, ox: pivot ? pivot[0] : b.x + b.w / 2, oy: pivot ? pivot[1] : b.y + b.h / 2, alpha: 1, clip: null, blur: 0, tracking: 0, maskSelf: false, b };
    switch (type) {
      case 'fade': r.alpha = p; break;
      case 'slideLeft': r.dx = -dist * q; r.alpha = clamp(p * 3); break;
      case 'slideRight': r.dx = dist * q; r.alpha = clamp(p * 3); break;
      case 'slideUp': r.dy = dist * q; r.alpha = clamp(p * 3); break;
      case 'slideDown': r.dy = -dist * q; r.alpha = clamp(p * 3); break;
      case 'maskUp': r.dy = (b.h + 4) * q; r.maskSelf = true; break;
      case 'maskDown': r.dy = -(b.h + 4) * q; r.maskSelf = true; break;
      case 'wipeRight': r.clip = { x: b.x, y: b.y, w: b.w * p, h: b.h }; break;
      case 'wipeLeft': r.clip = { x: b.x + b.w * q, y: b.y, w: b.w * p, h: b.h }; break;
      case 'wipeUp': r.clip = { x: b.x, y: b.y + b.h * q, w: b.w, h: b.h * p , axis: 'y' }; break;
      case 'wipeDown': r.clip = { x: b.x, y: b.y, w: b.w, h: b.h * p , axis: 'y' }; break;
      case 'wipeCenter': r.clip = { x: b.x + (b.w * q) / 2, y: b.y, w: b.w * p, h: b.h }; break;
      case 'growX': r.sx = Math.max(0.0001, p); r.ox = b.x; break;
      case 'growXCenter': r.sx = Math.max(0.0001, p); break;
      case 'growY': r.sy = Math.max(0.0001, p); r.oy = b.y + b.h; break;
      case 'scale': r.sx = r.sy = Math.max(0.0001, p); r.alpha = clamp(p * 4); break;
      case 'pop': r.sx = r.sy = 0.6 + 0.4 * p; r.alpha = clamp(p); break;
      case 'blur': r.blur = 24 * q; r.alpha = clamp(p * 1.5); break;
      case 'flipX': r.sy = Math.max(0.0001, Math.abs(Math.cos((q * Math.PI) / 2))); r.alpha = clamp(p * 2); break;
      case 'tracking': r.tracking = -0.6 + 0.6 * p; r.alpha = p; r.blur = 6 * q; break;
      default: break;
    }
    return r;
  }

  // How far a layer's shadow / glow / outline reaches past its box, so wipes and mask reveals
  // sweep across it too instead of cutting it off and letting it pop back when the clip ends.
  function bleed(ly) {
    if (!ly) return 0;
    let e = 0;
    const sh = ly.shadow;
    if (sh && sh.on) e = Math.max(e, (sh.blur || 0) * 1.5 + Math.max(Math.abs(sh.offsetX || 0), Math.abs(sh.offsetY || 0)));
    const gl = ly.glow;
    if (gl && gl.on) e = Math.max(e, (gl.size || 0) * 1.5);
    const st = ly.stroke;
    if (st && st.on) e += st.width || 0;
    return Math.ceil(e);
  }
  // Wipe clip rect stretched along its axis so p = 0 shows nothing and p = 1 shows the box plus its bleed.
  function sweepClip(c, b, s) {
    if (!c || !(s > 0) || !b) return c;
    if (c.axis === 'y') {
      const k = (b.h + 2 * s) / Math.max(1e-6, b.h), y = b.y - s + (c.y - b.y) * k;
      return { ...c, y, h: c.h * k };
    }
    const k = (b.w + 2 * s) / Math.max(1e-6, b.w), x = b.x - s + (c.x - b.x) * k;
    return { ...c, x, w: c.w * k };
  }
  function applyParams(ctx, r, margin = 0, sweep = 0) {
    if (r.alpha < 1) ctx.globalAlpha *= clamp(r.alpha);
    if (r.blur + layerBlur > 0.05) ctx.filter = blurFilter(r.blur + layerBlur);
    if (r.clip) {
      ctx.beginPath();
      // Expand the clip along the non-animated axis so shadows are not cropped.
      const c = sweepClip(r.clip, r.b, sweep);
      if (c.axis === 'y') ctx.rect(c.x - margin, c.y, c.w + margin * 2, c.h);
      else ctx.rect(c.x, c.y - margin, c.w, c.h + margin * 2);
      ctx.clip();
    }
    if (r.dx || r.dy) ctx.translate(r.dx, r.dy);
    if (r.sx !== 1 || r.sy !== 1) {
      ctx.translate(r.ox, r.oy);
      ctx.scale(r.sx, r.sy);
      ctx.translate(-r.ox, -r.oy);
    }
  }

  // ---------- Backdrop drawing ----------
  // rad: one radius, or [topLeft, topRight, bottomRight, bottomLeft].
  function roundRectPath(ctx, x, y, w, h, rad) {
    const R = Array.isArray(rad) ? rad : [rad, rad, rad, rad];
    const [tl, tr, br, bl] = R.map((r) => Math.max(0, Math.min(r || 0, w / 2, h / 2)));
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.arcTo(x + w, y, x + w, y + h, tr);
    ctx.arcTo(x + w, y + h, x, y + h, br);
    ctx.arcTo(x, y + h, x, y, bl);
    ctx.arcTo(x, y, x + w, y, tl);
    ctx.closePath();
  }
  // A layer's corner rounding: its radius, or each corner on its own when "corners" is switched on.
  function cornerRadii(ly, fallback) {
    const c = ly && ly.corners;
    if (c && c.on) return [c.tl || 0, c.tr || 0, c.br || 0, c.bl || 0];
    return fallback ?? (ly && ly.radius) ?? 0;
  }

  // ---------- Torn paper ----------
  // The outline is sampled every ~2 px and pushed inwards by fractal noise measured along the edge,
  // so the tears stay put when the layer moves. An optional paper rim shows under the colour.
  const tHash = (i, seed) => { let h = Math.imul(i | 0, 374761393) ^ Math.imul(seed | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const tNoise = (x, seed) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return tHash(i, seed) * (1 - u) + tHash(i + 1, seed) * u; };
  function tFbm(x, seed) { let a = 1, sum = 0, n = 0, fr = 1; for (let o = 0; o < 5; o++) { sum += a * tNoise(x * fr, seed + o * 131); n += a; a *= 0.55; fr *= 2.3; } return sum / n; }
  function resamplePoly(P, step = 2) {
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    return out;
  }
  // Outline as a polygon: 'rect' (with corner radii), 'ellipse' or a list of points.
  function outlinePoly(kind, b, rad) {
    if (Array.isArray(kind)) return resamplePoly(kind);
    if (kind === 'ellipse') {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, n = Math.max(24, Math.ceil((Math.PI * (b.w + b.h)) / 4));
      const P = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; P.push([cx + (Math.cos(a) * b.w) / 2, cy + (Math.sin(a) * b.h) / 2]); }
      return resamplePoly(P);
    }
    const R = (Array.isArray(rad) ? rad : [rad, rad, rad, rad]).map((r) => Math.max(0, Math.min(r || 0, b.w / 2, b.h / 2)));
    const P = [], arc = (cx, cy, r, a0) => { if (r <= 0) { P.push([cx + Math.cos(a0 + Math.PI / 4) * 0, cy]); return; } const n = Math.max(2, Math.ceil(r / 2)); for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (Math.PI / 2); P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    const { x, y, w, h } = b;
    if (R[1] > 0) arc(x + w - R[1], y + R[1], R[1], -Math.PI / 2); else P.push([x + w, y]);
    if (R[2] > 0) arc(x + w - R[2], y + h - R[2], R[2], 0); else P.push([x + w, y + h]);
    if (R[3] > 0) arc(x + R[3], y + h - R[3], R[3], Math.PI / 2); else P.push([x, y + h]);
    if (R[0] > 0) arc(x + R[0], y + R[0], R[0], Math.PI); else P.push([x, y]);
    return resamplePoly(P);
  }
  // Returns { color, paper } polygons (paper is null without a rim).
  function tornPolys(P, t) {
    const n = P.length; if (n < 3) return { color: P, paper: null };
    let area = 0; for (let i = 0; i < n; i++) { const [ax, ay] = P[i], [bx, by] = P[(i + 1) % n]; area += ax * by - bx * ay; }
    const sgn = area > 0 ? 1 : -1, amt = Math.max(0, t.amount ?? 10), size = Math.max(2, t.size ?? 40), rim = Math.max(0, t.edge ?? 0), seed = Math.round(t.seed ?? 1);
    const color = [], paper = rim > 0 ? [] : null;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const [px, py] = P[(i - 1 + n) % n], [x, y] = P[i], [qx, qy] = P[(i + 1) % n];
      if (i) s += Math.hypot(x - px, y - py);
      let nx = -(qy - py) * sgn, ny = (qx - px) * sgn; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; // inward
      const f = s / size, jag = (tHash(Math.floor(s / 3), seed + 7) - 0.5) * 0.35;
      const dc = amt * Math.min(1, Math.max(0, tFbm(f, seed) * 1.25 - 0.1 + jag * 0.5));
      color.push([x + nx * dc, y + ny * dc]);
      if (paper) {
        const fib = (tHash(Math.floor(s / 1.5), seed + 23) - 0.5) * rim * 0.5;
        const dp = Math.max(0, dc - rim * (0.35 + 1.1 * tFbm(f * 2.7, seed + 51)) + fib);
        paper.push([x + nx * dp, y + ny * dp]);
      }
    }
    return { color, paper };
  }
  const tracePoly = (ctx, P) => () => { ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  // Paints the paper rim (with the layer's shadow) and returns the torn colour path.
  function tornPath(ctx, t, P) {
    const { color, paper } = tornPolys(P, t);
    if (paper) {
      ctx.save(); ctx.fillStyle = t.paperColor || '#f4efe6'; tracePoly(ctx, paper)(); ctx.fill(); ctx.restore();
      ctx.shadowColor = 'transparent';
    }
    return tracePoly(ctx, color);
  }
  const tornOn = (o) => !!(o && o.torn && o.torn.on && (o.torn.amount > 0 || o.torn.edge > 0));

  // ---------- Pen paths ----------
  // A path is a list of points { x, y, ix, iy, ox, oy, r }: (ix, iy) / (ox, oy) are the in / out
  // bezier handles relative to the point (0, 0 = none) and r rounds a sharp corner.
  // Paths are flattened to polylines so corner rounding and trim (draw-on) work the same everywhere.
  function pathPolys(pts, closed, trim) {
    const n = pts ? pts.length : 0;
    if (n < 2) return [];
    const P = pts.map((p) => ({ x: +p.x || 0, y: +p.y || 0, ix: +p.ix || 0, iy: +p.iy || 0, ox: +p.ox || 0, oy: +p.oy || 0, r: +p.r || 0 }));
    const sharp = (p) => !p.ix && !p.iy && !p.ox && !p.oy;
    const prev = (i) => (i > 0 ? P[i - 1] : closed ? P[n - 1] : null), next = (i) => (i < n - 1 ? P[i + 1] : closed ? P[0] : null);
    // Where each corner's rounding starts (E) and ends (X).
    const E = [], X = [];
    P.forEach((p, i) => {
      const a = prev(i), b = next(i);
      if (p.r > 0 && sharp(p) && a && b) {
        const d1 = [a.x - p.x, a.y - p.y], d2 = [b.x - p.x, b.y - p.y];
        const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
        if (l1 > 1e-6 && l2 > 1e-6) {
          const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2];
          const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
          if (th > 0.01 && th < Math.PI - 0.01) {
            const t = Math.min(p.r / Math.tan(th / 2), l1 / 2, l2 / 2);
            E[i] = [p.x + u1[0] * t, p.y + u1[1] * t]; X[i] = [p.x + u2[0] * t, p.y + u2[1] * t];
            return;
          }
        }
      }
      E[i] = X[i] = [p.x, p.y];
    });
    const out = [];
    const push = (x, y) => { const l = out[out.length - 1]; if (!l || Math.abs(l[0] - x) > 1e-6 || Math.abs(l[1] - y) > 1e-6) out.push([x, y]); };
    const cubic = (a, c1, c2, b) => {
      const len = Math.hypot(c1[0] - a[0], c1[1] - a[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(b[0] - c2[0], b[1] - c2[1]);
      const N = Math.max(2, Math.min(64, Math.ceil(len / 6)));
      for (let k = 1; k <= N; k++) {
        const t = k / N, u = 1 - t;
        push(u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]);
      }
    };
    // Rounded corner: an arc-like curve from E past the corner to X.
    const corner = (i) => {
      const p = P[i], e = E[i], x = X[i];
      if (e[0] === x[0] && e[1] === x[1]) return;
      const k = 0.5523 * 1.0;
      cubic(e, [e[0] + (p.x - e[0]) * k, e[1] + (p.y - e[1]) * k], [x[0] + (p.x - x[0]) * k, x[1] + (p.y - x[1]) * k], x);
    };
    push(...X[0]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = P[i], j = (i + 1) % n, b = P[j];
      const h1 = a.ox || a.oy, h2 = b.ix || b.iy;
      if (!h1 && !h2) push(...E[j]);
      else cubic(X[i], h1 ? [a.x + a.ox, a.y + a.oy] : X[i], h2 ? [b.x + b.ix, b.y + b.iy] : E[j], E[j]);
      corner(j);
    }
    if (!trim) return [out];
    // Trim: keep the part between start and end (in % of the length), shifted by offset.
    let s = (trim.start ?? 0) / 100, e = (trim.end ?? 100) / 100;
    if (s > e) [s, e] = [e, s];
    if (e - s >= 0.9999) return [out];
    if (e - s <= 0.0001) return [];
    const off = (trim.offset ?? 0) / 100;
    s += off; e += off;
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    const L = cum[cum.length - 1];
    if (L <= 0) return [];
    const at = (d) => {
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const f = Math.max(0, Math.min(1, (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1])));
      return [out[i - 1][0] + (out[i][0] - out[i - 1][0]) * f, out[i - 1][1] + (out[i][1] - out[i - 1][1]) * f];
    };
    const piece = (a, b) => {
      const da = a * L, db = b * L, poly = [at(da)];
      for (let i = 0; i < out.length; i++) if (cum[i] > da && cum[i] < db) poly.push(out[i]);
      poly.push(at(db));
      return poly;
    };
    if (!closed) { const a = Math.max(0, Math.min(1, s)), b = Math.max(0, Math.min(1, e)); return b - a > 1e-4 ? [piece(a, b)] : []; }
    const a = s - Math.floor(s), b = a + (e - s);
    return b <= 1 ? [piece(a, b)] : [piece(a, 1), piece(0, b - 1)];
  }
  function tracePolys(ctx, polys, closeIt) {
    ctx.beginPath();
    for (const poly of polys) { poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (closeIt) ctx.closePath(); }
  }
  // Bounds of a path's points and handles.
  function pathBounds(pts) {
    if (!pts || !pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = [], ys = [];
    for (const p of pts) { xs.push(p.x, p.x + (p.ix || 0), p.x + (p.ox || 0)); ys.push(p.y, p.y + (p.iy || 0), p.y + (p.oy || 0)); }
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  // ---------- Backdrop fills: solid, linear, radial, 4-point, with optional animation ----------
  const GRADIENT_TYPES = { solid: 'Solid colour', linear: 'Linear gradient', radial: 'Radial gradient', fourPoint: '4-point gradient' };
  const GRADIENT_ANIMS = {
    none: 'Static', rotate: 'Rotate (linear)', slide: 'Slide / flow (linear)', shimmer: 'Shimmer sweep (any)',
    pulse: 'Pulse (radial)', orbit: 'Orbit (radial)', swirl: 'Swirl colours (4-point)', breathe: 'Breathe colours (4-point)',
  };
  let curT = 0;
  const mixHex = (a, b, f) => lerpValue(a, b, clamp(f));
  const fillType = (bd) => bd.fillType || (bd.gradient ? 'linear' : 'solid');
  const fourCache = new Map();
  function fourPointImage(c) {
    const key = c.join();
    let cv = fourCache.get(key);
    if (cv) return cv;
    const N = 48;
    cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
    const g = cv.getContext('2d');
    const img = g.createImageData(N, N);
    const [tl, tr, br, bl] = c.map(hexToRgb);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / (N - 1), v = y / (N - 1);
      // smoothstep the weights for softer blending
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const i = (y * N + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = tl[ch] + (tr[ch] - tl[ch]) * su, bot = bl[ch] + (br[ch] - bl[ch]) * su;
        img.data[i + ch] = top + (bot - top) * sv;
      }
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (fourCache.size > 64) fourCache.clear();
    fourCache.set(key, cv);
    return cv;
  }
  // Returns { style, overlay? } for the backdrop's main fill at the current time.
  function fillFor(ctx, bd, b) {
    const type = fillType(bd);
    const anim = bd.gradAnim || 'none';
    const ph = anim === 'none' ? 0 : ((curT / Math.max(0.1, bd.gradSpeed || 4)) % 1 + 1) % 1;
    const c1 = bd.fill, c2 = bd.fill2 || bd.fill, c3 = bd.fill3 || c2, c4 = bd.fill4 || c1;
    // Linear / radial gradients run through 2–4 evenly spaced colours.
    const n = Math.max(2, Math.min(4, Math.round(bd.gradStops || 2)));
    const ramp = [c1, c2, c3, c4].slice(0, n);
    const at = (u) => { const x = Math.max(0, Math.min(1, u)) * (n - 1), i = Math.min(n - 2, Math.floor(x)); return mixHex(ramp[i], ramp[i + 1], x - i); };
    const addRamp = (g) => ramp.forEach((c, i) => g.addColorStop(i / (n - 1), c));
    let style = c1, overlay = null;
    if (type === 'linear') {
      const ang = (((bd.gradientAngle || 0) + (anim === 'rotate' ? ph * 360 : 0)) * Math.PI) / 180;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const half = (Math.abs(Math.cos(ang)) * b.w + Math.abs(Math.sin(ang)) * b.h) / 2;
      const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
      const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      if (anim === 'slide') {
        // Seamless flowing band through the colours and back
        const k = 6 * n;
        for (let i = 0; i <= k; i++) {
          const u = i / k, w = ((u * 0.5 - ph) % 1 + 1) % 1;
          g.addColorStop(u, at(1 - Math.abs(2 * w - 1)));
        }
      } else addRamp(g);
      style = g;
    } else if (type === 'radial') {
      let cx = b.x + ((bd.gradCX ?? 50) / 100) * b.w, cy = b.y + ((bd.gradCY ?? 50) / 100) * b.h;
      let r = ((bd.gradRadius ?? 75) / 100) * Math.hypot(b.w, b.h) / 2;
      if (anim === 'orbit') { cx += Math.cos(ph * 2 * Math.PI) * b.w * 0.3; cy += Math.sin(ph * 2 * Math.PI) * b.h * 0.3; }
      if (anim === 'pulse') r *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(ph * 2 * Math.PI));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
      addRamp(g);
      style = g;
    } else if (type === 'fourPoint') {
      let cs = [c1, c2, c3, c4];
      if (anim === 'swirl') {
        const ring = [c1, c2, c3, c4];
        cs = [0, 1, 2, 3].map((k) => { const pos = (k + ph * 4) % 4, i = Math.floor(pos); return mixHex(ring[i], ring[(i + 1) % 4], pos - i); });
      } else if (anim === 'breathe') {
        const f = 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI);
        cs = [mixHex(c1, c3, f), mixHex(c2, c4, f), mixHex(c3, c1, f), mixHex(c4, c2, f)];
      }
      style = cs[0];
      const img = fourPointImage(cs);
      overlay = (c) => { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(img, b.x, b.y, b.w, b.h); };
    }
    if (anim === 'shimmer') {
      const prev = overlay;
      overlay = (c) => {
        prev && prev(c);
        const pos = -0.3 + ph * 1.6, x0 = b.x - b.h, x1 = b.x + b.w + b.h;
        const sx = x0 + (x1 - x0) * pos;
        const g = c.createLinearGradient(sx - b.h, b.y, sx + b.h, b.y + b.h);
        const hi = rgba(bd.shimmerColor || '#ffffff', bd.shimmerOpacity ?? 0.45);
        g.addColorStop(0, rgba('#ffffff', 0)); g.addColorStop(0.5, hi); g.addColorStop(1, rgba('#ffffff', 0));
        c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h);
      };
    }
    return { style, overlay };
  }
  // Fill a path with the backdrop fill (shadow comes from the base fill, overlays are clipped).
  function paintFill(ctx, bd, b, path) {
    const filled = bd.fillOn !== false;
    if (filled) {
      const f = fillFor(ctx, bd, b);
      path(); ctx.fillStyle = f.style; ctx.fill();
      if (f.overlay) {
        ctx.save();
        ctx.shadowColor = 'transparent';
        path(); ctx.clip();
        f.overlay(ctx);
        ctx.restore();
      }
      drawTexture(ctx, bd, b, path);
    }
    strokeShape(ctx, bd.stroke, path, filled);
  }
  // Outline a shape along its edge (centred on it, like After Effects' shape stroke).
  // With a fill, the fill already cast the shadow, so the stroke doesn't cast a second one.
  function strokeShape(ctx, st, path, filled, cap) {
    if (!st || !st.on || !(st.width > 0)) return;
    ctx.save();
    if (filled) ctx.shadowColor = 'transparent';
    if (path) path();
    ctx.lineWidth = st.width; ctx.strokeStyle = st.color || '#ffffff'; ctx.lineJoin = 'miter'; ctx.miterLimit = 10; ctx.lineCap = cap || 'butt';
    ctx.stroke();
    ctx.restore();
  }
  // Text fill: a solid colour, or a linear / radial gradient across the line.
  function textFill(ctx, s, b) {
    if (!s.fillType || s.fillType === 'solid') return s.color;
    return fillFor(ctx, { fill: s.color, fill2: s.color2 || s.color, fillType: s.fillType, gradientAngle: s.gradAngle ?? 90, gradStops: 2, gradAnim: 'none', gradCX: 50, gradCY: 50, gradRadius: 75 }, b).style;
  }
  const BLEND_MODES = {
    'source-over': 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', 'soft-light': 'Soft light',
    'hard-light': 'Hard light', 'color-dodge': 'Colour dodge', 'color-burn': 'Colour burn', darken: 'Darken', lighten: 'Lighten',
    difference: 'Difference', exclusion: 'Exclusion', luminosity: 'Luminosity', color: 'Colour', 'source-atop': 'Replace (keep shape)',
  };
  // Texture overlay: an image blended onto the backdrop, clipped to the backdrop's shape.
  function drawTexture(ctx, bd, b, path) {
    const tx = bd.texture;
    if (!tx || !tx.src || !tx.enabled) return;
    const img = getImage(tx.src);
    if (!img || !img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.shadowColor = 'transparent';
    path(); ctx.clip();
    ctx.globalAlpha *= clamp(tx.opacity ?? 1);
    ctx.globalCompositeOperation = tx.blend || 'overlay';
    const sc = Math.max(0.01, tx.scale ?? 1);
    const ox = tx.offsetX || 0, oy = tx.offsetY || 0;
    // Optional drift so textures can move (px per second)
    const dx = ox + (tx.driftX || 0) * curT, dy = oy + (tx.driftY || 0) * curT;
    if (tx.fit === 'tile') {
      const tw = img.naturalWidth * sc, th = img.naturalHeight * sc;
      const sx0 = b.x + (((dx % tw) + tw) % tw) - tw, sy0 = b.y + (((dy % th) + th) % th) - th;
      for (let y = sy0; y < b.y + b.h; y += th) for (let x = sx0; x < b.x + b.w; x += tw) ctx.drawImage(img, x, y, tw, th);
    } else if (tx.fit === 'stretch') {
      ctx.drawImage(img, b.x + dx, b.y + dy, b.w * sc, b.h * sc);
    } else {
      // cover
      const k = Math.max(b.w / img.naturalWidth, b.h / img.naturalHeight) * sc;
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      ctx.drawImage(img, b.x + (b.w - w) / 2 + dx, b.y + (b.h - h) / 2 + dy, w, h);
    }
    ctx.restore();
  }
  function rgba(hex, a = 1) {
    if (!hex) return 'rgba(0,0,0,0)';
    if (!hex.startsWith('#')) return hex;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function withShadow(ctx, bd) {
    if (bd.shadow && bd.shadow.on) {
      ctx.shadowColor = rgba(bd.shadow.color, bd.shadow.opacity ?? 1);
      ctx.shadowBlur = bd.shadow.blur;
      ctx.shadowOffsetX = bd.shadow.offsetX || 0;
      ctx.shadowOffsetY = bd.shadow.offsetY || 0;
    }
  }

  function drawBackdrop(ctx, state, L) {
    const bd = state.backdrop;
    const b = L.box;
    ctx.save();
    ctx.globalAlpha *= bd.opacity;
    withShadow(ctx, bd);
    if (bd.type === 'image') {
      const img = bd.image.src ? getImage(bd.image.src) : null;
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, b.x, b.y, b.w, b.h);
        if (bd.texture && bd.texture.enabled && bd.texture.src) {
          // Mask the texture to the image's own alpha via an offscreen pass.
          const W = Math.ceil(b.w), H = Math.ceil(b.h);
          const off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
          const o = off.getContext('2d');
          o.drawImage(img, 0, 0, W, H);
          drawTexture(o, { ...bd, texture: { ...bd.texture, blend: bd.texture.blend } }, { x: 0, y: 0, w: W, h: H }, () => { o.beginPath(); o.rect(0, 0, W, H); });
          o.globalCompositeOperation = 'destination-in';
          o.drawImage(img, 0, 0, W, H);
          ctx.shadowColor = 'transparent';
          ctx.drawImage(off, b.x, b.y);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      ctx.restore();
      return;
    }
    if (bd.type !== 'shape') { ctx.restore(); return; }
    const rect = (x, y, w, h) => () => { ctx.beginPath(); ctx.rect(x, y, w, h); };
    const rr = (x, y, w, h, r) => () => roundRectPath(ctx, x, y, w, h, r);
    if (tornOn(bd) && ['rect', 'rounded', 'pill', 'slant', 'accent'].includes(bd.shape)) {
      const s = bd.skew || 0;
      const P = bd.shape === 'slant' ? outlinePoly([[b.x + s, b.y], [b.x + b.w, b.y], [b.x + b.w - s, b.y + b.h], [b.x, b.y + b.h]])
        : outlinePoly('rect', b, bd.shape === 'pill' ? b.h / 2 : bd.shape === 'rect' && !(bd.corners && bd.corners.on) ? 0 : cornerRadii(bd));
      const path = tornPath(ctx, bd.torn, P);
      paintFill(ctx, bd, b, path);
      if (bd.shape === 'accent') { ctx.shadowColor = 'transparent'; ctx.fillStyle = bd.accentColor; ctx.save(); path(); ctx.clip(); ctx.fillRect(b.x, b.y, bd.accentWidth, b.h); ctx.restore(); }
      ctx.restore();
      return;
    }
    switch (bd.shape) {
      case 'rect': paintFill(ctx, bd, b, bd.corners && bd.corners.on ? rr(b.x, b.y, b.w, b.h, cornerRadii(bd)) : rect(b.x, b.y, b.w, b.h)); break;
      case 'rounded': paintFill(ctx, bd, b, rr(b.x, b.y, b.w, b.h, cornerRadii(bd))); break;
      case 'pill': paintFill(ctx, bd, b, rr(b.x, b.y, b.w, b.h, b.h / 2)); break;
      case 'slant': {
        const s = bd.skew;
        paintFill(ctx, bd, b, () => {
          ctx.beginPath();
          ctx.moveTo(b.x + s, b.y); ctx.lineTo(b.x + b.w, b.y);
          ctx.lineTo(b.x + b.w - s, b.y + b.h); ctx.lineTo(b.x, b.y + b.h);
          ctx.closePath();
        });
        break;
      }
      case 'accent': {
        paintFill(ctx, bd, b, rr(b.x, b.y, b.w, b.h, cornerRadii(bd)));
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = bd.accentColor;
        ctx.save(); roundRectPath(ctx, b.x, b.y, b.w, b.h, cornerRadii(bd)); ctx.clip();
        ctx.fillRect(b.x, b.y, bd.accentWidth, b.h); ctx.restore();
        break;
      }
      case 'twoTone': {
        const tb = L.titleBox, sb = L.subBox;
        paintFill(ctx, bd, tb, rr(tb.x, tb.y, tb.w, tb.h, bd.radius));
        if (sb && sb.w > 0) {
          ctx.fillStyle = bd.accentColor;
          roundRectPath(ctx, sb.x, sb.y, sb.w, sb.h, bd.radius); ctx.fill();
        }
        break;
      }
      case 'underline': {
        ctx.fillStyle = bd.accentColor;
        ctx.fillRect(b.x, b.y + b.h - bd.accentWidth, b.w, bd.accentWidth);
        break;
      }
      case 'sideBar': {
        ctx.fillStyle = bd.accentColor;
        ctx.fillRect(b.x, b.y, bd.accentWidth, b.h);
        break;
      }
      case 'corners': {
        const len = Math.min(b.w, b.h) * 0.35, w = bd.accentWidth;
        ctx.fillStyle = bd.accentColor;
        ctx.fillRect(b.x, b.y, len, w); ctx.fillRect(b.x, b.y, w, len);
        ctx.fillRect(b.x + b.w - len, b.y + b.h - w, len, w); ctx.fillRect(b.x + b.w - w, b.y + b.h - len, w, len);
        break;
      }
      default: paintFill(ctx, bd, b, rect(b.x, b.y, b.w, b.h));
    }
    ctx.restore();
  }

  // ---------- Text drawing ----------
  function textShadow(ctx, s) {
    if (s.shadow && s.shadow.on) {
      ctx.shadowColor = rgba(s.shadow.color, s.shadow.opacity ?? 1);
      ctx.shadowBlur = s.shadow.blur;
      ctx.shadowOffsetX = s.shadow.offsetX || 0;
      ctx.shadowOffsetY = s.shadow.offsetY || 0;
    }
  }
  // Fills one run of text with the layer's glow (underneath), outline stroke and fill.
  // Export: text is drawn on whole pixels and then placed at its exact (fractional) position with
  // drawImage, because browsers snap glyphs to a pixel grid: slow moves would step instead of glide.
  let subpixelText = false, txtOff = null;
  const TEXT_PROPS = ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'miterLimit', 'textAlign', 'textBaseline', 'direction', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontStretch', 'fontVariantCaps', 'textRendering'];
  function paintText(ctx, s, text, x, y) {
    if (subpixelText && !ctx.__subText) {
      const m = ctx.getTransform();
      const fx = m.e - Math.floor(m.e), fy = m.f - Math.floor(m.f);
      if ((fx > 0.002 || fy > 0.002) && paintTextSubpixel(ctx, s, text, x, y, m, fx, fy)) return;
    }
    paintTextRaw(ctx, s, text, x, y);
  }
  function paintTextSubpixel(ctx, s, text, x, y, m, fx, fy) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const w = ctx.measureText(text).width, size = s.size || 40;
    const pad = size * 0.8 + (s.glow && s.glow.on ? (s.glow.size || 0) * 2 : 0) + (s.stroke && s.stroke.on ? (s.stroke.width || 0) * 2 : 0) + 4;
    const pts = [[x - w - pad, y - size * 1.6 - pad], [x + w + pad, y - size * 1.6 - pad], [x + w + pad, y + size * 1.6 + pad], [x - w - pad, y + size * 1.6 + pad]]
      .map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
    const rx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), ry = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
    const rx2 = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p[0])))), ry2 = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    if (rx2 <= rx || ry2 <= ry) return true; // off screen
    if (!txtOff) txtOff = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    if (txtOff.width !== W || txtOff.height !== H) { txtOff.width = W; txtOff.height = H; }
    const o = txtOff.getContext('2d');
    o.__subText = true;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(rx, ry, rx2 - rx, ry2 - ry);
    for (const k of TEXT_PROPS) if (k in ctx && k in o) { try { o[k] = ctx[k]; } catch {} }
    o.shadowColor = 'transparent'; o.shadowBlur = 0; o.globalAlpha = 1; o.filter = 'none'; o.globalCompositeOperation = 'source-over';
    o.setTransform(m.a, m.b, m.c, m.d, m.e - fx, m.f - fy);
    paintTextRaw(o, s, text, x, y);
    // Composite with this context's alpha, shadow, blur filter and clip, shifted by the fraction.
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(txtOff, rx, ry, rx2 - rx, ry2 - ry, rx + fx, ry + fy, rx2 - rx, ry2 - ry);
    ctx.restore();
    if (s.stroke && s.stroke.on && s.stroke.width > 0) ctx.shadowColor = 'transparent';
    return true;
  }
  function paintTextRaw(ctx, s, text, x, y) {
    const gl = s.glow, st = s.stroke;
    if (gl && gl.on && gl.size > 0) {
      ctx.save();
      ctx.shadowColor = rgba(gl.color, gl.opacity ?? 1); ctx.shadowBlur = gl.size; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      const passes = Math.max(1, Math.min(4, Math.round(gl.strength || 1)));
      for (let i = 0; i < passes; i++) ctx.fillText(text, x, y);
      ctx.restore();
    }
    if (st && st.on && st.width > 0) {
      // Stroke at twice the width under the fill, so the outline sits outside the letters.
      ctx.save(); ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = st.width * 2; ctx.strokeStyle = st.color;
      ctx.strokeText(text, x, y); ctx.restore();
      ctx.shadowColor = 'transparent';
    }
    ctx.fillText(text, x, y);
  }

  function drawText(ctx, s, line, ph, L, state) {
    if (line.empty || !ph.visible) return;
    const type = effType(ph);
    const perUnit = PER_CHAR.has(type) || PER_WORD.has(type);
    const animators = (s.animators || []).filter((a) => a.enabled !== false);
    const tr = s.transform || NO_TR;
    const b = { x: line.x, y: line.top, w: line.width, h: line.bottom - line.top || s.size };
    ctx.save();
    if (s.clipToBox) {
      // The clip follows the backdrop's own keyframed transform.
      const m = ctx.getTransform();
      const bx = L.box;
      if (!s.parentApplied) {
        applyParents(ctx, state, L, 'backdrop');
        applyLayerTransform(ctx, state.backdrop.transform, bx, false);
      } else ctx.setTransform(s.parentApplied);
      ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h);
      ctx.setTransform(m);
      ctx.clip();
    }
    setTextStyle(ctx, s);
    const baseLs = (s.letterSpacing || 0) + (line.extraLs || 0) + (tr.tracking || 0);
    ctx.letterSpacing = `${baseLs}px`;
    ctx.fillStyle = textFill(ctx, s, b);
    textShadow(ctx, s);
    applyLayerTransform(ctx, tr, b);
    applyLoop(ctx, s.anim, curT, state.comp.duration, b, pivotOf(tr, b));
    layerBlur = tr.blur || 0;

    if (perUnit || animators.length) {
      if (layerBlur > 0.05) ctx.filter = blurFilter(layerBlur);
      if (!perUnit) {
        const r = animParams(type, ph.p, b, s.anim.distance, anchored(tr) ? pivotOf(tr, b) : null);
        if (r.maskSelf) { const pad = s.size * 0.25, e = bleed(s); ctx.beginPath(); ctx.rect(b.x - pad - e, b.y - pad * 0.5 - e, b.w + (pad + e) * 2, b.h + pad + 2 * e); ctx.clip(); }
        applyParams(ctx, r, Math.max(s.size, bleed(s)), bleed(s));
      }
      drawChars(ctx, s, line, ph, perUnit ? type : 'none', animators);
      layerBlur = 0;
      ctx.restore();
      return;
    }
    const r = animParams(type, ph.p, b, s.anim.distance, anchored(tr) ? pivotOf(tr, b) : null);
    if (r.maskSelf) {
      const pad = s.size * 0.25, e = bleed(s);
      ctx.beginPath(); ctx.rect(b.x - pad - e, b.y - pad * 0.5 - e, b.w + (pad + e) * 2, b.h + pad + 2 * e); ctx.clip();
    }
    applyParams(ctx, r, Math.max(s.size, bleed(s)), bleed(s));
    if (r.tracking) {
      const extra = r.tracking * s.size * -1; // positive spread at start
      const ls = baseLs + extra;
      ctx.letterSpacing = `${ls}px`;
      const w = ctx.measureText(line.text).width - ls;
      const anchorX = line.x + line.width / 2 - w / 2;
      paintText(ctx, s, line.text, anchorX, line.baseline);
    } else {
      paintText(ctx, s, line.text, line.x, line.baseline);
    }
    layerBlur = 0;
    ctx.restore();
  }

  // Character-by-character drawing: per-letter/word in/out animations and text animators.
  function drawChars(ctx, s, line, ph, type, animators) {
    const chars = Array.from(line.text);
    const n = chars.length;
    // x positions (respecting kerning + letter spacing) and word indices
    const xs = []; let pre = '';
    const wordIdx = []; let w = -1, inWord = false;
    for (const ch of chars) {
      xs.push(line.x + (pre ? ctx.measureText(pre).width : 0));
      pre += ch;
      const space = /\s/.test(ch);
      if (!space && !inWord) w++;
      inWord = !space;
      wordIdx.push(Math.max(0, w));
    }
    const nWords = w + 1;
    const h = line.bottom - line.top;

    // In/out per-unit progress
    const byWord = PER_WORD.has(type);
    const units = byWord ? nWords : n;
    const stagger = clamp(s.anim.stagger ?? 0.5, 0, 0.98);
    const span = 1 + stagger * (units - 1);
    const anim = ph.anim || s.anim.in;
    const easeFn = ph.ease || getEasing(anim.easing, anim.bezier);
    const isOut = ph.phase === 'out';
    const typeCount = type === 'typewriter' ? Math.floor((ph.phase === 'hold' ? 1 : ph.p) * n + 1e-6) : n;

    let trackShift = 0;
    for (let i = 0; i < n; i++) {
      const ch = chars[i];
      // Animator amounts
      let dx = 0, dy = 0, sc = 1, rot = 0, op = 1, blur = 0, color = null, track = 0;
      for (const a of animators) {
        const amt = selectorAmount(a, a.unit === 'words' ? wordIdx[i] : i, a.unit === 'words' ? nWords : n);
        if (amt <= 0) continue;
        const pr = a.props || {};
        dx += amt * (pr.x || 0); dy += amt * (pr.y || 0);
        sc *= 1 + amt * (((pr.scale ?? 100) / 100) - 1);
        rot += amt * (pr.rotation || 0);
        op *= 1 + amt * (((pr.opacity ?? 100) / 100) - 1);
        blur += amt * (pr.blur || 0);
        track += amt * (pr.tracking || 0);
        if (pr.colorOn && pr.color) color = lerpValue(color || s.color, pr.color, clamp(amt));
      }
      const x = xs[i] + trackShift;
      trackShift += track;
      if (i >= typeCount || /\s/.test(ch)) continue;

      let p = 1;
      if (type !== 'none' && type !== 'typewriter' && ph.phase !== 'hold') {
        const raw = clamp(ph.raw * span - (byWord ? wordIdx[i] : i) * stagger);
        p = isOut ? 1 - easeFn(raw) : easeFn(raw);
      }
      if (p <= 0.0001 || op <= 0.001) continue;
      const cw = ctx.measureText(ch).width;
      const cx = x + cw / 2, cy = line.top + h / 2;
      ctx.save();
      switch (type) {
        case 'lettersFade': ctx.globalAlpha *= clamp(p); break;
        case 'lettersRise': case 'wordsRise': ctx.globalAlpha *= clamp(p * 2); dy += (1 - p) * s.size * 0.6; break;
        case 'lettersDrop': ctx.globalAlpha *= clamp(p * 2); dy -= (1 - p) * s.size * 0.6; break;
        case 'lettersScale': sc *= p; break;
        case 'lettersBlur': ctx.globalAlpha *= clamp(p); blur += (1 - p) * 12; break;
        default: break;
      }
      if (op < 1) ctx.globalAlpha *= clamp(op);
      if (blur + layerBlur > 0.05) ctx.filter = blurFilter(blur + layerBlur);
      if (color) ctx.fillStyle = color;
      ctx.translate(dx, dy);
      if (rot || sc !== 1) {
        ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.scale(Math.max(1e-4, sc), Math.max(1e-4, sc)); ctx.translate(-cx, -cy);
      }
      paintText(ctx, s, ch, x, line.baseline);
      ctx.restore();
    }
  }

  // ---------- Masks ----------
  let maskCanvas = null;
  function offscreen(w, h) {
    if (!maskCanvas) maskCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    if (maskCanvas.width !== w || maskCanvas.height !== h) { maskCanvas.width = w; maskCanvas.height = h; }
    return maskCanvas;
  }
  function maskPath(c, m) {
    c.beginPath();
    if (m.shape === 'path') { tracePolys(c, pathPolys((m.points || []).map((p) => ({ ...p, x: p.x + m.x, y: p.y + m.y })), true), true); return; }
    if (m.shape === 'ellipse') c.ellipse(m.x + m.w / 2, m.y + m.h / 2, Math.max(0, m.w / 2), Math.max(0, m.h / 2), 0, 0, Math.PI * 2);
    else if (m.radius > 0 || (m.corners && m.corners.on)) roundRectPath(c, m.x, m.y, m.w, m.h, cornerRadii(m));
    else c.rect(m.x, m.y, m.w, m.h);
  }
  // Draws a layer through its mask (if enabled) using an offscreen buffer.
  function withMask(ctx, state, layer, draw) {
    const ly = typeof layer === 'string' ? getLayer(state, layer) : layer;
    const m = ly && ly.mask;
    if (!m || !m.enabled) return draw(ctx);
    const { width: W, height: H } = state.comp;
    const off = offscreen(W, H);
    const o = off.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, W, H);
    o.setTransform(ctx.getTransform()); // keep the design scale (vertical / square versions)
    o.save(); draw(o); o.restore();
    o.save();
    o.globalCompositeOperation = m.invert ? 'destination-out' : 'destination-in';
    o.filter = blurFilter(m.feather || 0);
    o.fillStyle = '#000';
    maskPath(o, m); o.fill();
    o.restore();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(off, 0, 0); ctx.restore();
  }


  // ---------- Extra layers (logo, shapes, more text) ----------
  // state.layers = { id: layer }, state.order = bottom→top list of ids (backdrop/title/subtitle included).
  const EXTRA_KINDS = { text: 'Text', image: 'Logo / image', shape: 'Shape', group: 'Group', controller: 'Controller' };
  const EXTRA_SHAPES = { rect: 'Rectangle', rounded: 'Rounded rectangle', ellipse: 'Circle / ellipse', line: 'Line', path: 'Custom (pen)' };
  function getLayer(state, id) { return id === 'backdrop' || id === 'title' || id === 'subtitle' ? state[id] : state.layers && state.layers[id]; }
  function layerOrder(state) {
    const base = ['backdrop', 'title', 'subtitle'];
    const ids = Object.keys(state.layers || {});
    const order = (state.order || base).filter((id) => base.includes(id) || ids.includes(id));
    for (const id of [...base, ...ids]) if (!order.includes(id)) order.push(id);
    return order;
  }
  // Text layers with an auto-fit width shrink until they fit.
  function fitTextSizes(ctx, state) {
    const fit = (s) => {
      if (!(s && s.fitWidth > 0 && s.text)) return s;
      ctx.save(); const m = measureLine(ctx, s); ctx.restore();
      if (m.width <= s.fitWidth) return s;
      let size = s.size * (s.fitWidth / m.width);
      ctx.save(); const m2 = measureLine(ctx, { ...s, size }); ctx.restore();
      if (m2.width > s.fitWidth) size *= s.fitWidth / m2.width;
      return { ...s, size: Math.max(4, size) };
    };
    let out = state;
    for (const k of ['title', 'subtitle']) { const f = fit(state[k]); if (f !== state[k]) { if (out === state) out = { ...state }; out[k] = f; } }
    if (state.layers) {
      let layers = null;
      for (const [id, ly] of Object.entries(state.layers)) if (ly.kind === 'text') { const f = fit(ly); if (f !== ly) { layers ??= { ...state.layers }; layers[id] = f; } }
      if (layers) { if (out === state) out = { ...state }; out.layers = layers; }
    }
    return out;
  }
  // Untransformed box of each extra layer, positioned against the backdrop box or the frame.
  function extraBoxes(ctx, state, L) {
    const out = {};
    const { width: W, height: H } = state.comp;
    for (const [id, ly] of Object.entries(state.layers || {})) {
      if (ly.kind === 'group') continue;
      let w = ly.w || 0, h = ly.h || 0, line = null;
      const ref = ly.attach === 'frame' ? { x: 0, y: 0, w: W, h: H } : L.box;
      if (ly.kind === 'text') {
        ctx.save(); line = measureLine(ctx, ly); ctx.restore();
        if (line.empty) continue;
        w = line.width; h = line.ascent + line.descent;
      } else if (ly.kind === 'image') {
        const img = getImage(ly.src);
        if (!img) continue;
        w = ly.w || 160;
        h = img.complete && img.naturalWidth ? (w * img.naturalHeight) / img.naturalWidth : ly.h || w;
      } else if (ly.shape === 'path') {
        // Points are relative to the layer's origin (its x / y against the frame or backdrop box).
        if (!ly.points || ly.points.length < 2) continue;
        const pb = pathBounds(ly.points), pad = ly.stroke && ly.stroke.on ? (ly.stroke.width || 0) / 2 : 0;
        const ox = ref.x + ref.w * (ly.ax ?? 0) + (ly.x || 0), oy = ref.y + ref.h * (ly.ay ?? 0) + (ly.y || 0);
        out[id] = { x: ox + pb.x - pad, y: oy + pb.y - pad, w: Math.max(1, pb.w + pad * 2), h: Math.max(1, pb.h + pad * 2), ox, oy };
        continue;
      } else {
        if (!w) w = ref.w; // 0 = match the backdrop box
        if (!h) h = ref.h;
        if (ly.shape === 'line') h = Math.max(1, ly.h || 4);
      }
      const ax = ly.ax ?? 0, ay = ly.ay ?? 0;
      const x = ref.x + ref.w * ax - w * ax + (ly.x || 0);
      const y = ref.y + ref.h * ay - h * ay + (ly.y || 0);
      const b = { x, y, w, h };
      if (line) b.line = { ...line, x, top: y, baseline: y + line.ascent, bottom: y + h };
      out[id] = b;
    }
    // Groups: the box around everything in them (nested groups after their children).
    const groups = Object.entries(state.layers || {}).filter(([, l]) => l.kind === 'group').map(([id]) => id);
    const Lx = { ...L, extras: out };
    for (let pass = 0; pass < 4; pass++) for (const gid of groups) {
      const kids = layerOrder(state).filter((k) => (getLayer(state, k) || {}).parent === gid);
      const bs = kids.map((k) => drawBox(state, Lx, k)).filter(Boolean);
      if (!bs.length) { out[gid] = { ...L.box }; continue; }
      const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
      out[gid] = { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
    }
    return out;
  }
  function drawExtra(ctx, state, ly, b, ph, L) {
    if (ly.kind === 'text') return drawText(ctx, { ...ly, clipToBox: false }, b.line, ph, L, state);
    const tr = ly.transform || NO_TR;
    const r = animParams(effType(ph), ph.p, b, ly.anim.distance, anchored(tr) ? pivotOf(tr, b) : null);
    ctx.save();
    applyLayerTransform(ctx, tr, b);
    applyLoop(ctx, ly.anim, curT, state.comp.duration, b, pivotOf(tr, b));
    layerBlur = tr.blur || 0;
    applyParams(ctx, r, 200, bleed(ly));
    if (layerBlur > 0.05 && !(r.blur > 0.05)) ctx.filter = blurFilter(layerBlur);
    if ((ly.opacity ?? 1) < 1) ctx.globalAlpha *= clamp(ly.opacity ?? 1);
    if (ly.shadow && ly.shadow.on) {
      ctx.shadowColor = rgba(ly.shadow.color, ly.shadow.opacity ?? 1); ctx.shadowBlur = ly.shadow.blur;
      ctx.shadowOffsetX = ly.shadow.offsetX || 0; ctx.shadowOffsetY = ly.shadow.offsetY || 0;
    }
    if (ly.kind === 'image') {
      const img = getImage(ly.src);
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, b.x, b.y, b.w, b.h);
    } else {
      ctx.fillStyle = ly.color || '#ffffff';
      ctx.beginPath();
      if (ly.shape === 'path') {
        const polys = pathPolys((ly.points || []).map((p) => ({ ...p, x: p.x + b.ox, y: p.y + b.oy })), !!ly.closed, ly.trim);
        const full = !ly.trim || ((ly.trim.start ?? 0) <= 0 && (ly.trim.end ?? 100) >= 100);
        const filled = ly.fill !== false && ly.closed;
        if (tornOn(ly) && ly.closed && full && polys[0] && polys[0].length > 2) tornPath(ctx, ly.torn, outlinePoly(polys[0].map((p) => (Array.isArray(p) ? p : [p.x, p.y]))))();
        else tracePolys(ctx, polys, ly.closed && full);
        if (filled) ctx.fill();
        if (ly.stroke && ly.stroke.on && ly.stroke.width > 0) {
          if (filled) ctx.shadowColor = 'transparent';
          ctx.lineWidth = ly.stroke.width; ctx.strokeStyle = ly.stroke.color; ctx.lineCap = ly.stroke.cap || 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        }
      } else {
        if (tornOn(ly)) tornPath(ctx, ly.torn, ly.shape === 'ellipse' ? outlinePoly('ellipse', b) : outlinePoly('rect', b, ly.shape === 'line' ? b.h / 2 : ly.shape === 'rounded' || (ly.corners && ly.corners.on) ? cornerRadii(ly) : 0))();
        else if (ly.shape === 'ellipse') ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        else if (ly.shape === 'rounded' || ly.shape === 'line' || (ly.corners && ly.corners.on)) roundRectPath(ctx, b.x, b.y, b.w, b.h, ly.shape === 'line' ? b.h / 2 : cornerRadii(ly));
        else ctx.rect(b.x, b.y, b.w, b.h);
        const filled = ly.fill !== false;
        if (filled) ctx.fill();
        strokeShape(ctx, ly.stroke, null, filled, ly.shape === 'line' ? 'round' : 'butt');
      }
    }
    layerBlur = 0;
    ctx.restore();
  }

  // Draw a layer inside its parents' transforms. Passes the backdrop's own matrix along, so text
  // that clips to the backdrop gets the right clip whatever it is parented to.
  function withParents(ctx, state, L, id, draw) {
    const chain = parentChain(state, id);
    if (!chain.length) return draw(null);
    ctx.save();
    const m0 = ctx.getTransform();
    applyParents(ctx, state, L, id, true);
    const m = ctx.getTransform();
    ctx.setTransform(m0); applyParents(ctx, state, L, 'backdrop'); applyLayerTransform(ctx, state.backdrop.transform, L.box, false);
    const pm = ctx.getTransform(); ctx.setTransform(m);
    draw(pm);
    ctx.restore();
  }
  const matteCanvases = [];
  function matteCanvas(i, w, h) {
    let c = matteCanvases[i];
    if (!c) c = matteCanvases[i] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  // ---------- Main render ----------
  function render(ctx, state, t, opts = {}) {
    const base = state;
    curT = t;
    state = resolveAt(state, t);
    // Motion blur with some layers switched off: those layers stay at the frame's own time
    // while the others are sampled across the shutter.
    const fz = opts.freeze && opts.freeze.ids.size ? opts.freeze : null;
    if (fz) {
      state = { ...state, layers: { ...(state.layers || {}) } };
      for (const id of fz.ids) { if (id === 'backdrop' || id === 'title' || id === 'subtitle') state[id] = fz.state[id]; else if (fz.state.layers && fz.state.layers[id]) state.layers[id] = fz.state.layers[id]; }
    }
    const { width, height, duration } = state.comp;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();

    state = fitTextSizes(ctx, state);
    const L = computeLayout(ctx, state);
    const bd = state.backdrop;
    L.extras = extraBoxes(ctx, state, L);

    // Design scale (used by the vertical / square versions): the whole design scales around the
    // layout anchor point, masks included.
    const ds = state.comp.designScale || 1;
    {
      const spans = layerOrder(state).map((k) => getLayer(state, k)).filter((l) => l && l.visible !== false && l.anim).map((l) => timingSpans(l.anim, duration));
      togetherSpan = spans.length ? { inEnd: Math.max(...spans.map((x) => x.inEnd)), outStart: Math.min(...spans.map((x) => x.outStart)) } : null;
    }
    ctx.save();
    if (ds !== 1) { ctx.translate(state.layout.x, state.layout.y); ctx.scale(ds, ds); ctx.translate(-state.layout.x, -state.layout.y); }
    // Track mattes: a layer can use any other layer's alpha as its mask. The matte layer itself
    // isn't drawn on its own (as in After Effects' classic behaviour).
    const order = layerOrder(state);
    const matteOf = (id) => { const m = (getLayer(state, id) || {}).matte; return m && m.src && m.src !== id && order.includes(m.src) && getLayer(state, m.src) ? m : null; };
    const usedAsMatte = new Set(order.map(matteOf).filter(Boolean).map((m) => m.src));
    const drawOne = (ctx, id, force) => {
      const t = fz && fz.ids.has(id) ? fz.t : t0; curT = t;
      if (id === 'backdrop') {
        if (bd.type === 'none' || (bd.visible === false && !force) || hiddenByGroup(state, id, t)) return;
        const ph = phaseAt(bd.anim, t, duration);
        if (!ph.visible) return;
        const type = effType(ph);
        const margin = 200;
        const bb = { x: L.box.x, y: L.box.y, w: L.box.w, h: L.box.h };
        const r = animParams(type, ph.p, bb, bd.anim.distance, anchored(bd.transform) ? pivotOf(bd.transform, bb) : null);
        withMask(ctx, state, 'backdrop', (c) => {
          c.save();
          applyParents(c, state, L, 'backdrop', true);
          const tr = bd.transform || NO_TR;
          applyLayerTransform(c, tr, bb);
          applyLoop(c, bd.anim, t, duration, bb, pivotOf(tr, bb));
          layerBlur = tr.blur || 0;
          applyParams(c, r, margin, bleed(bd));
          if (layerBlur > 0.05 && !(r.blur > 0.05)) c.filter = blurFilter(layerBlur);
          drawBackdrop(c, state, L);
          layerBlur = 0;
          c.restore();
        });
      } else if (id === 'title' || id === 'subtitle') {
        if (hiddenByGroup(state, id, t)) return;
        const ph = phaseAt(state[id].anim, t, duration);
        if (!ph.visible || L[id].empty || (state[id].visible === false && !force)) return;
        withMask(ctx, state, id, (c) => withParents(c, state, L, id, (pm) => drawText(c, pm ? { ...state[id], parentApplied: pm } : state[id], L[id], ph, L, state)));
      } else {
        const ly = state.layers && state.layers[id], eb = L.extras[id];
        if (!ly || !eb || (ly.visible === false && !force) || ly.kind === 'group' || ly.kind === 'controller' || hiddenByGroup(state, id, t)) return;
        const ph = phaseAt(ly.anim, t, duration);
        if (!ph.visible) return;
        withMask(ctx, state, ly, (c) => withParents(c, state, L, id, () => drawExtra(c, state, ly, eb, ph, L)));
      }
    };
    const t0 = t;
    for (const id of order) {
      if (usedAsMatte.has(id)) continue;
      const m = matteOf(id);
      if (!m) { drawOne(ctx, id); continue; }
      const { width: W, height: H } = state.comp;
      const a = matteCanvas(0, W, H), ac = a.getContext('2d'), mc = matteCanvas(1, W, H), mcx = mc.getContext('2d');
      for (const c of [ac, mcx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.setTransform(ctx.getTransform()); }
      ac.save(); drawOne(ac, id); ac.restore();
      mcx.save(); drawOne(mcx, m.src, true); mcx.restore();
      ac.save(); ac.setTransform(1, 0, 0, 1, 0, 0); ac.globalCompositeOperation = m.invert ? 'destination-out' : 'destination-in'; ac.drawImage(mc, 0, 0); ac.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(a, 0, 0); ctx.restore();
    }
    curT = t0;
    ctx.restore();
    void base;

    L.order = layerOrder(state);
    L.layers = layerBounds(state, L);
    if (opts.guides) drawGuides(ctx, state, L, opts);
    return L;
  }

  // ---------- Motion blur (temporal supersampling) ----------
  // The part of the frame a rendered sample can touch: every layer's on-screen box plus room for
  // shadows, glows and blur; the whole frame when unsure.
  function mbRegion(L, W, H) {
    const rs = L && L.layers ? Object.values(L.layers).filter(Boolean).map((b) => screenRect(b)).filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite)) : [];
    if (!rs.length) return { x: 0, y: 0, w: W, h: H };
    const pad = Math.round(Math.max(W, H) * 0.08) + 40;
    const x = Math.max(0, Math.floor(Math.min(...rs.map((r) => r.x)) - pad)), y = Math.max(0, Math.floor(Math.min(...rs.map((r) => r.y)) - pad));
    const x2 = Math.min(W, Math.ceil(Math.max(...rs.map((r) => r.x + r.w)) + pad)), y2 = Math.min(H, Math.ceil(Math.max(...rs.map((r) => r.y + r.h)) + pad));
    return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
  }
  // Renders several sub-frames across the shutter interval and averages them in premultiplied
  // space by drawing each at 1/N alpha with additive ('lighter') compositing.
  let mbCanvas = null;
  function renderFrame(ctx, state, t, opts = {}) {
    subpixelText = !!opts.precise;
    const mb = state.comp.motionBlur;
    const samples = Math.round(opts.samples || (mb && mb.samples) || 8);
    if (!mb || !mb.enabled || opts.noMotionBlur || samples < 2 || !(mb.shutter > 0)) return render(ctx, state, t, opts);
    // Each layer's motion blur switch (on unless switched off). Layers with it off stay sharp.
    const ids = layerOrder(state), off = new Set(ids.filter((id) => (getLayer(state, id) || {}).motionBlur === false));
    if (ids.every((id) => off.has(id) || !getLayer(state, id))) return render(ctx, state, t, opts);
    const freeze = off.size ? { ids: off, t, state: resolveAt(state, t) } : null;
    const { width: W, height: H, fps } = state.comp;
    if (!mbCanvas) mbCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    if (mbCanvas.width !== W || mbCanvas.height !== H) { mbCanvas.width = W; mbCanvas.height = H; }
    const sc = mbCanvas.getContext('2d');
    const span = (Math.min(720, mb.shutter) / 360) / fps;
    const sampleT = (i) => Math.max(0, Math.min(state.comp.duration, t - span / 2 + (span * (i + 0.5)) / samples));
    if (opts.precise) {
      // Export quality: accumulate in floating point (premultiplied) to avoid banding.
      // Only the area the design covers is read back and averaged (a lower third is mostly empty).
      const sctx = mbCanvas.getContext('2d', { willReadFrequently: true });
      const frames = [];
      // In/Out animations move layers outside their layout boxes, so while any is running the
      // whole frame is used; during holds only the area the design covers.
      const moving = ids.some((id) => { const l = getLayer(state, id); if (!l || !l.anim) return false; return [sampleT(0), t, sampleT(samples - 1)].some((tt) => { const ph = phaseAt(l.anim, tt, state.comp.duration); return ph.phase === 'in' || ph.phase === 'out'; }); });
      for (let i = 0; i < samples; i++) {
        const L = render(sctx, state, sampleT(i), { guides: false, freeze });
        // Read each sample right away (the canvas is reused for the next one).
        const r = moving ? { x: 0, y: 0, w: W, h: H } : mbRegion(L, W, H);
        frames.push({ r, d: r.w > 0 && r.h > 0 ? sctx.getImageData(r.x, r.y, r.w, r.h).data : null });
      }
      // Union of the sampled regions.
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (const f of frames) if (f.d) { x0 = Math.min(x0, f.r.x); y0 = Math.min(y0, f.r.y); x1 = Math.max(x1, f.r.x + f.r.w); y1 = Math.max(y1, f.r.y + f.r.h); }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      if (x1 > x0 && y1 > y0) {
        const RW = x1 - x0, RH = y1 - y0;
        const acc = new Float32Array(RW * RH * 4);
        for (const f of frames) {
          if (!f.d) continue;
          const { r, d } = f;
          for (let yy = 0; yy < r.h; yy++) {
            let j = yy * r.w * 4, k = ((yy + r.y - y0) * RW + (r.x - x0)) * 4;
            for (let xx = 0; xx < r.w; xx++, j += 4, k += 4) {
              const a = d[j + 3];
              if (!a) continue;
              acc[k] += d[j] * a; acc[k + 1] += d[j + 1] * a; acc[k + 2] += d[j + 2] * a; acc[k + 3] += a;
            }
          }
        }
        const out = ctx.createImageData(RW, RH), o = out.data;
        for (let j = 0; j < o.length; j += 4) {
          const a = acc[j + 3];
          if (!a) continue;
          o[j] = acc[j] / a; o[j + 1] = acc[j + 1] / a; o[j + 2] = acc[j + 2] / a; o[j + 3] = a / samples;
        }
        ctx.putImageData(out, x0, y0);
      }
      ctx.restore();
      curT = t;
      return layoutAt(ctx, resolveAt(state, t));
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 / samples;
    for (let i = 0; i < samples; i++) {
      render(sc, state, sampleT(i), { guides: false, freeze });
      ctx.drawImage(mbCanvas, 0, 0);
    }
    ctx.restore();
    // Layout / guides for the centre time (no clearing).
    curT = t;
    let rs = resolveAt(state, t);
    const L = layoutAt(ctx, rs);
    rs = fitTextSizes(ctx, rs);
    if (opts.guides) drawGuides(ctx, rs, L, opts);
    return L;
  }

  // Layout plus per-layer bounds without drawing (used after motion-blur accumulation).
  function layoutAt(ctx, rs) {
    rs = fitTextSizes(ctx, rs);
    const L = computeLayout(ctx, rs);
    L.extras = extraBoxes(ctx, rs, L);
    L.order = layerOrder(rs);
    L.layers = layerBounds(rs, L);
    return L;
  }
  // Untransformed bounds of each layer, used for click-to-select.
  function layerBounds(state, L) {
    const tb = (line, s) => (line.empty ? null : { x: line.x - 4, y: line.top - s.size * 0.12, w: line.width + 8, h: (line.bottom - line.top) + s.size * 0.24 });
    const out = {
      title: state.title.visible === false ? null : tb(L.title, state.title),
      subtitle: state.subtitle.visible === false ? null : tb(L.subtitle, state.subtitle),
      backdrop: state.backdrop.type === 'none' || state.backdrop.visible === false ? null : { ...L.box },
    };
    const eb = L.extras || {};
    for (const [id, b] of Object.entries(eb)) if (state.layers[id] && state.layers[id].visible !== false) out[id] = { x: b.x, y: b.y, w: b.w, h: b.h, ...(b.ox !== undefined ? { ox: b.ox, oy: b.oy } : {}) };
    for (const k of Object.keys(out)) if (out[k]) { out[k].tr = { ...NO_TR, ...((getLayer(state, k) || {}).transform || {}) }; out[k].parents = parentFrames(state, L, k); if ((getLayer(state, k) || {}).kind === 'group') out[k].group = true; }
    return out;
  }
  // Point-in-layer test that undoes the layer's transform (position, rotation, scale).
  function hitTest(L, x, y) {
    if (!L || !L.layers) return null;
    // Topmost first; text and extras win over the backdrop even when it is above them.
    const order = (L.order || ['backdrop', 'title', 'subtitle']).slice().reverse();
    const pick = [...order.filter((k) => k !== 'backdrop'), 'backdrop'];
    for (const k of pick) {
      const b = L.layers[k];
      if (!b || b.group) continue;
      const [qx, qy] = toParentSpace(b.parents, x, y);
      const [px, py] = invPt(b.tr || NO_TR, b, qx, qy);
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return k;
    }
    return null;
  }

  // On-screen bounding box of a layer (after its own transform and its parents').
  function screenRect(b) {
    if (!b) return null;
    const tr = b.tr || NO_TR;
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => fromParentSpace(b.parents, ...fwdPt(tr, b, x, y)));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  // Where a layer's anchor point is on screen (rotation/scale leave the pivot itself in place).
  function anchorScreen(state, id, b) {
    const tr = (getLayer(state, id) || {}).transform || NO_TR;
    const [px, py] = pivotOf(tr, b);
    return fromParentSpace(b.parents, px + (tr.x || 0), py + (tr.y || 0));
  }
  function drawGuides(ctx, state, L, opts) {
    const { width: W, height: H } = state.comp;
    const lw = Math.max(1, W / 960);
    ctx.save();
    ctx.lineWidth = lw;
    if (opts.safeAreas) {
      // Action safe 93%, title safe 90% (SMPTE ST 2046-1 style)
      ctx.setLineDash([10 * lw, 8 * lw]);
      ctx.strokeStyle = 'rgba(0,200,255,0.55)';
      ctx.strokeRect(W * 0.035, H * 0.035, W * 0.93, H * 0.93);
      ctx.strokeStyle = 'rgba(255,200,0,0.7)';
      ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
      ctx.setLineDash([]);
      // Center cross
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(W / 2 - 20 * lw, H / 2); ctx.lineTo(W / 2 + 20 * lw, H / 2);
      ctx.moveTo(W / 2, H / 2 - 20 * lw); ctx.lineTo(W / 2, H / 2 + 20 * lw);
      ctx.stroke();
      // Lower third band (bottom third of frame)
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, (H * 2) / 3, W, H / 3);
      ctx.font = `${13 * lw}px sans-serif`;
      ctx.fillStyle = 'rgba(255,200,0,0.85)';
      ctx.fillText('Title safe 90%', W * 0.05 + 8 * lw, H * 0.05 + 20 * lw);
      ctx.fillStyle = 'rgba(0,200,255,0.85)';
      ctx.textAlign = 'right';
      ctx.fillText('Action safe 93%', W * 0.965 - 8 * lw, H * 0.035 + 18 * lw);
      ctx.textAlign = 'left';
    }
    // Controllers: never rendered, shown in the preview as a red square with a crosshair.
    for (const [id, ly] of Object.entries(state.layers || {})) {
      const b = L.layers[id];
      if (ly.kind !== 'controller' || ly.visible === false || !b) continue;
      ctx.save();
      for (const f of b.parents || []) applyLayerTransform(ctx, f.tr, f.b, false);
      if (ly.transform) applyLayerTransform(ctx, ly.transform, b, false);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, col = ly.label || '#ef4444';
      for (const [c, w] of [['rgba(0,0,0,0.6)', 3.5 * lw], [col, 1.6 * lw]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.beginPath(); ctx.moveTo(cx - b.w * 0.3, cy); ctx.lineTo(cx + b.w * 0.3, cy); ctx.moveTo(cx, cy - b.h * 0.3); ctx.lineTo(cx, cy + b.h * 0.3); ctx.stroke();
      }
      ctx.font = `600 ${11 * lw}px sans-serif`; ctx.fillStyle = col;
      ctx.fillText(ly.name || 'Controller', b.x, b.y + b.h + 14 * lw);
      ctx.restore();
    }
    if (opts.selected && L.layers[opts.selected]) {
      const b = L.layers[opts.selected];
      const m = getLayer(state, opts.selected).mask;
      if (m && m.enabled) {
        ctx.save(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5 * lw; ctx.setLineDash([3 * lw, 3 * lw]);
        maskPath(ctx, m); ctx.stroke(); ctx.restore();
      }
      ctx.save();
      const tr = getLayer(state, opts.selected).transform;
      for (const f of b.parents || []) applyLayerTransform(ctx, f.tr, f.b, false);
      if (tr) applyLayerTransform(ctx, tr, b, false);
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 * lw; ctx.setLineDash([6 * lw, 4 * lw]);
      ctx.strokeRect(b.x - 3 * lw, b.y - 3 * lw, b.w + 6 * lw, b.h + 6 * lw);
      ctx.setLineDash([]);
      const label = { backdrop: 'Backdrop', title: 'Title', subtitle: 'Subtitle' }[opts.selected] || getLayer(state, opts.selected).name || 'Layer';
      ctx.font = `600 ${12 * lw}px sans-serif`;
      const tw = ctx.measureText(label).width + 10 * lw;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(b.x - 3 * lw, b.y - 3 * lw - 18 * lw, tw, 18 * lw);
      ctx.fillStyle = '#111';
      ctx.fillText(label, b.x + 2 * lw, b.y - 3 * lw - 5 * lw);
      ctx.restore();
      if (opts.anchor) {
        // Anchor point (After Effects style): a circle with a cross, where the layer scales and rotates from.
        const [ax, ay] = anchorScreen(state, opts.selected, b);
        const r = 7 * lw, arm = 13 * lw;
        ctx.save();
        for (const [col, w] of [['rgba(0,0,0,0.75)', 3.5 * lw], ['#ffffff', 1.5 * lw]]) {
          ctx.strokeStyle = col; ctx.lineWidth = w;
          ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2);
          ctx.moveTo(ax - arm, ay); ctx.lineTo(ax + arm, ay); ctx.moveTo(ax, ay - arm); ctx.lineTo(ax, ay + arm);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // Other layers in a multi-selection: a lighter outline.
    for (const id of opts.also || []) {
      if (id === opts.selected || !L.layers[id]) continue;
      const r = screenRect(L.layers[id]);
      ctx.save(); ctx.strokeStyle = 'rgba(245,158,11,0.75)'; ctx.lineWidth = 1.5 * lw; ctx.setLineDash([4 * lw, 4 * lw]);
      ctx.strokeRect(r.x - 3 * lw, r.y - 3 * lw, r.w + 6 * lw, r.h + 6 * lw); ctx.restore();
    }
    if (opts.bounds) {
      ctx.strokeStyle = 'rgba(255,80,160,0.9)';
      ctx.setLineDash([4 * lw, 4 * lw]);
      ctx.strokeRect(L.box.x, L.box.y, L.box.w, L.box.h);
    }
    ctx.restore();
  }

  global.Engine = {
    BACKDROP_ANIMS, TEXT_ANIMS, LOOP_TYPES, loopAt, pathPolys, pathBounds, cornerRadii, SHAPES, GRADIENT_TYPES, GRADIENT_ANIMS, BLEND_MODES, EXTRA_KINDS, EXTRA_SHAPES, getLayer, layerOrder,
    render, renderFrame, computeLayout, layoutAt, bleed, pivotOf, fwdPt, invPt, anchorScreen, parentChain, parentFrames, toParentSpace, fromParentSpace, screenRect, measureLine, fitTextSizes, extraBoxes, PER_CHAR, PER_WORD, OUT_SWAP, phaseAt, timingSpans, imagesReady, getImage, hitTest, resolveAt, valueAtKeys, selectorAmount,
    set onImageLoad(fn) { onImageLoad = fn; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
