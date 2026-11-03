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
  function phaseAt(anim, t, duration) {
    const inA = anim.in, outA = anim.out;
    const inStart = inA.delay || 0;
    const inDur = inA.type === 'none' ? 0 : Math.max(0.001, inA.duration);
    const outEnd = duration - (outA.offset || 0);
    const outDur = outA.type === 'none' ? 0 : Math.max(0.001, outA.duration);
    const outStart = outEnd - outDur;
    if (t < inStart) return { visible: false, phase: 'before', raw: 0, p: 0 };
    if (inDur > 0 && t < inStart + inDur) {
      const raw = (t - inStart) / inDur;
      return { visible: true, phase: 'in', raw, ease: getEasing(inA.easing, inA.bezier), anim: inA, p: getEasing(inA.easing, inA.bezier)(raw) };
    }
    if (outA.type === 'none') {
      return t <= outEnd || outA.offset === 0 ? { visible: true, phase: 'hold', raw: 1, p: 1 } : { visible: false, phase: 'after', raw: 1, p: 0 };
    }
    if (t < outStart) return { visible: true, phase: 'hold', raw: 1, p: 1 };
    if (t < outEnd) {
      const raw = (t - outStart) / outDur;
      const ease = getEasing(outA.easing, outA.bezier);
      return { visible: true, phase: 'out', raw, ease, anim: outA, p: 1 - ease(raw) };
    }
    return { visible: false, phase: 'after', raw: 1, p: 0 };
  }

  function timingSpans(anim, duration) {
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
  const NO_TR = { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, blur: 0, tracking: 0 };
  let layerBlur = 0;
  function applyLayerTransform(ctx, tr, cx, cy, withAlpha = true) {
    if (!tr) return;
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
  const blurFilter = (b) => (b > 0.05 ? `blur(${b.toFixed(2)}px)` : 'none');

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
  const effType = (ph) => (ph.phase === 'hold' ? 'none' : ph.phase === 'out' ? OUT_SWAP[ph.anim.type] || ph.anim.type : ph.anim.type);

  // ---------- Generic element transform from animation ----------
  // b = element bounds. Returns parameters to apply around the element draw.
  function animParams(type, p, b, dist) {
    const q = 1 - p;
    const r = { dx: 0, dy: 0, sx: 1, sy: 1, ox: b.x + b.w / 2, oy: b.y + b.h / 2, alpha: 1, clip: null, blur: 0, tracking: 0, maskSelf: false };
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

  function applyParams(ctx, r, margin = 0) {
    if (r.alpha < 1) ctx.globalAlpha *= clamp(r.alpha);
    if (r.blur + layerBlur > 0.05) ctx.filter = blurFilter(r.blur + layerBlur);
    if (r.clip) {
      ctx.beginPath();
      // Expand the clip along the non-animated axis so shadows are not cropped.
      const c = r.clip;
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
  function roundRectPath(ctx, x, y, w, h, rad) {
    const r = Math.max(0, Math.min(rad, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
    let style = c1, overlay = null;
    if (type === 'linear') {
      const ang = (((bd.gradientAngle || 0) + (anim === 'rotate' ? ph * 360 : 0)) * Math.PI) / 180;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const half = (Math.abs(Math.cos(ang)) * b.w + Math.abs(Math.sin(ang)) * b.h) / 2;
      const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
      const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      if (anim === 'slide') {
        // Seamless flowing c1 → c2 → c1 band
        for (let i = 0; i <= 12; i++) {
          const u = i / 12, w = ((u * 0.5 - ph) % 1 + 1) % 1;
          g.addColorStop(u, mixHex(c1, c2, 1 - Math.abs(2 * w - 1)));
        }
      } else { g.addColorStop(0, c1); g.addColorStop(1, c2); }
      style = g;
    } else if (type === 'radial') {
      let cx = b.x + ((bd.gradCX ?? 50) / 100) * b.w, cy = b.y + ((bd.gradCY ?? 50) / 100) * b.h;
      let r = ((bd.gradRadius ?? 75) / 100) * Math.hypot(b.w, b.h) / 2;
      if (anim === 'orbit') { cx += Math.cos(ph * 2 * Math.PI) * b.w * 0.3; cy += Math.sin(ph * 2 * Math.PI) * b.h * 0.3; }
      if (anim === 'pulse') r *= 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(ph * 2 * Math.PI));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, r));
      g.addColorStop(0, c1); g.addColorStop(1, c2);
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
    switch (bd.shape) {
      case 'rect': paintFill(ctx, bd, b, rect(b.x, b.y, b.w, b.h)); break;
      case 'rounded': paintFill(ctx, bd, b, rr(b.x, b.y, b.w, b.h, bd.radius)); break;
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
        paintFill(ctx, bd, b, rr(b.x, b.y, b.w, b.h, bd.radius));
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = bd.accentColor;
        ctx.save(); roundRectPath(ctx, b.x, b.y, b.w, b.h, bd.radius); ctx.clip();
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
  function paintText(ctx, s, text, x, y) {
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
      applyLayerTransform(ctx, state.backdrop.transform, bx.x + bx.w / 2, bx.y + bx.h / 2, false);
      ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h);
      ctx.setTransform(m);
      ctx.clip();
    }
    setTextStyle(ctx, s);
    const baseLs = (s.letterSpacing || 0) + (line.extraLs || 0) + (tr.tracking || 0);
    ctx.letterSpacing = `${baseLs}px`;
    ctx.fillStyle = s.color;
    textShadow(ctx, s);
    applyLayerTransform(ctx, tr, b.x + b.w / 2, b.y + b.h / 2);
    layerBlur = tr.blur || 0;

    if (perUnit || animators.length) {
      if (layerBlur > 0.05) ctx.filter = blurFilter(layerBlur);
      if (!perUnit) {
        const r = animParams(type, ph.p, b, s.anim.distance);
        if (r.maskSelf) { const pad = s.size * 0.25; ctx.beginPath(); ctx.rect(b.x - pad, b.y - pad * 0.5, b.w + pad * 2, b.h + pad); ctx.clip(); }
        applyParams(ctx, r, s.size);
      }
      drawChars(ctx, s, line, ph, perUnit ? type : 'none', animators);
      layerBlur = 0;
      ctx.restore();
      return;
    }
    const r = animParams(type, ph.p, b, s.anim.distance);
    if (r.maskSelf) {
      const pad = s.size * 0.25;
      ctx.beginPath(); ctx.rect(b.x - pad, b.y - pad * 0.5, b.w + pad * 2, b.h + pad); ctx.clip();
    }
    applyParams(ctx, r, s.size);
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
    if (m.shape === 'ellipse') c.ellipse(m.x + m.w / 2, m.y + m.h / 2, Math.max(0, m.w / 2), Math.max(0, m.h / 2), 0, 0, Math.PI * 2);
    else if (m.radius > 0) roundRectPath(c, m.x, m.y, m.w, m.h, m.radius);
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
  const EXTRA_KINDS = { text: 'Text', image: 'Logo / image', shape: 'Shape' };
  const EXTRA_SHAPES = { rect: 'Rectangle', rounded: 'Rounded rectangle', ellipse: 'Circle / ellipse', line: 'Line' };
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
    return out;
  }
  function drawExtra(ctx, state, ly, b, ph, L) {
    if (ly.kind === 'text') return drawText(ctx, { ...ly, clipToBox: false }, b.line, ph, L, state);
    const tr = ly.transform || NO_TR;
    const r = animParams(effType(ph), ph.p, b, ly.anim.distance);
    ctx.save();
    applyLayerTransform(ctx, tr, b.x + b.w / 2, b.y + b.h / 2);
    layerBlur = tr.blur || 0;
    applyParams(ctx, r, 200);
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
      if (ly.shape === 'ellipse') ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      else if (ly.shape === 'rounded' || ly.shape === 'line') roundRectPath(ctx, b.x, b.y, b.w, b.h, ly.shape === 'line' ? b.h / 2 : ly.radius || 0);
      else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill();
      if (ly.stroke && ly.stroke.on && ly.stroke.width > 0) { ctx.shadowColor = 'transparent'; ctx.lineWidth = ly.stroke.width; ctx.strokeStyle = ly.stroke.color; ctx.stroke(); }
    }
    layerBlur = 0;
    ctx.restore();
  }

  // ---------- Main render ----------
  function render(ctx, state, t, opts = {}) {
    const base = state;
    curT = t;
    state = resolveAt(state, t);
    const { width, height, duration } = state.comp;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();

    state = fitTextSizes(ctx, state);
    const L = computeLayout(ctx, state);
    const bd = state.backdrop;
    L.extras = extraBoxes(ctx, state, L);

    for (const id of layerOrder(state)) {
      if (id === 'backdrop') {
        if (bd.type === 'none' || bd.visible === false) continue;
        const ph = phaseAt(bd.anim, t, duration);
        if (!ph.visible) continue;
        const type = effType(ph);
        const margin = 200;
        const bb = { x: L.box.x, y: L.box.y, w: L.box.w, h: L.box.h };
        const r = animParams(type, ph.p, bb, bd.anim.distance);
        withMask(ctx, state, 'backdrop', (c) => {
          c.save();
          const tr = bd.transform || NO_TR;
          applyLayerTransform(c, tr, bb.x + bb.w / 2, bb.y + bb.h / 2);
          layerBlur = tr.blur || 0;
          applyParams(c, r, margin);
          if (layerBlur > 0.05 && !(r.blur > 0.05)) c.filter = blurFilter(layerBlur);
          drawBackdrop(c, state, L);
          layerBlur = 0;
          c.restore();
        });
      } else if (id === 'title' || id === 'subtitle') {
        const ph = phaseAt(state[id].anim, t, duration);
        if (!ph.visible || L[id].empty || state[id].visible === false) continue;
        withMask(ctx, state, id, (c) => drawText(c, state[id], L[id], ph, L, state));
      } else {
        const ly = state.layers && state.layers[id], eb = L.extras[id];
        if (!ly || !eb || ly.visible === false) continue;
        const ph = phaseAt(ly.anim, t, duration);
        if (!ph.visible) continue;
        withMask(ctx, state, ly, (c) => drawExtra(c, state, ly, eb, ph, L));
      }
    }
    void base;

    L.order = layerOrder(state);
    L.layers = layerBounds(state, L);
    if (opts.guides) drawGuides(ctx, state, L, opts);
    return L;
  }

  // ---------- Motion blur (temporal supersampling) ----------
  // Renders several sub-frames across the shutter interval and averages them in premultiplied
  // space by drawing each at 1/N alpha with additive ('lighter') compositing.
  let mbCanvas = null;
  function renderFrame(ctx, state, t, opts = {}) {
    const mb = state.comp.motionBlur;
    const samples = Math.round(opts.samples || (mb && mb.samples) || 8);
    if (!mb || !mb.enabled || opts.noMotionBlur || samples < 2 || !(mb.shutter > 0)) return render(ctx, state, t, opts);
    const { width: W, height: H, fps } = state.comp;
    if (!mbCanvas) mbCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    if (mbCanvas.width !== W || mbCanvas.height !== H) { mbCanvas.width = W; mbCanvas.height = H; }
    const sc = mbCanvas.getContext('2d');
    const span = (Math.min(720, mb.shutter) / 360) / fps;
    const sampleT = (i) => Math.max(0, Math.min(state.comp.duration, t - span / 2 + (span * (i + 0.5)) / samples));
    if (opts.precise) {
      // Export quality: accumulate in floating point (premultiplied) to avoid banding.
      const sctx = mbCanvas.getContext('2d', { willReadFrequently: true });
      const acc = new Float32Array(W * H * 4);
      for (let i = 0; i < samples; i++) {
        render(sctx, state, sampleT(i), { guides: false });
        const d = sctx.getImageData(0, 0, W, H).data;
        for (let j = 0; j < d.length; j += 4) {
          const a = d[j + 3];
          if (!a) continue;
          acc[j] += d[j] * a; acc[j + 1] += d[j + 1] * a; acc[j + 2] += d[j + 2] * a; acc[j + 3] += a;
        }
      }
      const out = ctx.createImageData(W, H), o = out.data;
      for (let j = 0; j < o.length; j += 4) {
        const a = acc[j + 3];
        if (!a) continue;
        o[j] = acc[j] / a; o[j + 1] = acc[j + 1] / a; o[j + 2] = acc[j + 2] / a; o[j + 3] = a / samples;
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(out, 0, 0); ctx.restore();
      curT = t;
      return layoutAt(ctx, resolveAt(state, t));
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 / samples;
    for (let i = 0; i < samples; i++) {
      render(sc, state, sampleT(i), { guides: false });
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
    for (const [id, b] of Object.entries(eb)) if (state.layers[id] && state.layers[id].visible !== false) out[id] = { x: b.x, y: b.y, w: b.w, h: b.h };
    for (const k of Object.keys(out)) if (out[k]) out[k].tr = { ...NO_TR, ...((getLayer(state, k) || {}).transform || {}) };
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
      if (!b) continue;
      const tr = b.tr || NO_TR;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      let px = x - (tr.x || 0) - cx, py = y - (tr.y || 0) - cy;
      const a = -((tr.rotation || 0) * Math.PI) / 180;
      [px, py] = [px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)];
      const sc = (tr.scale ?? 100) / 100 || 1e-4;
      px /= sc; py /= sc;
      if (Math.abs(px) <= b.w / 2 && Math.abs(py) <= b.h / 2) return k;
    }
    return null;
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
    if (opts.selected && L.layers[opts.selected]) {
      const b = L.layers[opts.selected];
      const m = getLayer(state, opts.selected).mask;
      if (m && m.enabled) {
        ctx.save(); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5 * lw; ctx.setLineDash([3 * lw, 3 * lw]);
        maskPath(ctx, m); ctx.stroke(); ctx.restore();
      }
      ctx.save();
      const tr = getLayer(state, opts.selected).transform;
      if (tr) applyLayerTransform(ctx, tr, b.x + b.w / 2, b.y + b.h / 2, false);
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
    }
    if (opts.bounds) {
      ctx.strokeStyle = 'rgba(255,80,160,0.9)';
      ctx.setLineDash([4 * lw, 4 * lw]);
      ctx.strokeRect(L.box.x, L.box.y, L.box.w, L.box.h);
    }
    ctx.restore();
  }

  global.Engine = {
    BACKDROP_ANIMS, TEXT_ANIMS, SHAPES, GRADIENT_TYPES, GRADIENT_ANIMS, BLEND_MODES, EXTRA_KINDS, EXTRA_SHAPES, getLayer, layerOrder,
    render, renderFrame, computeLayout, phaseAt, timingSpans, imagesReady, getImage, hitTest, resolveAt, valueAtKeys, selectorAmount,
    set onImageLoad(fn) { onImageLoad = fn; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
