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
    if (bd.type !== 'image' || !bd.image.src) return Promise.resolve();
    const img = getImage(bd.image.src);
    if (img.complete) return Promise.resolve();
    return new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
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
    if (r.blur > 0.05) ctx.filter = `blur(${r.blur.toFixed(2)}px)`;
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
  function fillStyleFor(ctx, bd, b, c1 = bd.fill, c2 = bd.fill2) {
    if (!bd.gradient) return c1;
    const ang = ((bd.gradientAngle || 0) * Math.PI) / 180;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const dx = (Math.cos(ang) * b.w) / 2, dy = (Math.sin(ang) * b.h) / 2;
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
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
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      ctx.restore();
      return;
    }
    if (bd.type !== 'shape') { ctx.restore(); return; }
    ctx.fillStyle = fillStyleFor(ctx, bd, b);
    switch (bd.shape) {
      case 'rect': ctx.fillRect(b.x, b.y, b.w, b.h); break;
      case 'rounded': roundRectPath(ctx, b.x, b.y, b.w, b.h, bd.radius); ctx.fill(); break;
      case 'pill': roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2); ctx.fill(); break;
      case 'slant': {
        const s = bd.skew;
        ctx.beginPath();
        ctx.moveTo(b.x + s, b.y); ctx.lineTo(b.x + b.w, b.y);
        ctx.lineTo(b.x + b.w - s, b.y + b.h); ctx.lineTo(b.x, b.y + b.h);
        ctx.closePath(); ctx.fill(); break;
      }
      case 'accent': {
        roundRectPath(ctx, b.x, b.y, b.w, b.h, bd.radius); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = bd.accentColor;
        ctx.save(); roundRectPath(ctx, b.x, b.y, b.w, b.h, bd.radius); ctx.clip();
        ctx.fillRect(b.x, b.y, bd.accentWidth, b.h); ctx.restore();
        break;
      }
      case 'twoTone': {
        const tb = L.titleBox, sb = L.subBox;
        ctx.fillStyle = fillStyleFor(ctx, bd, tb);
        roundRectPath(ctx, tb.x, tb.y, tb.w, tb.h, bd.radius); ctx.fill();
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
      default: ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
  }

  // ---------- Text drawing ----------
  function textShadow(ctx, s) {
    if (s.shadow && s.shadow.on) {
      ctx.shadowColor = rgba(s.shadow.color, s.shadow.opacity ?? 1);
      ctx.shadowBlur = s.shadow.blur;
      ctx.shadowOffsetY = s.shadow.offsetY || 0;
    }
  }

  function drawText(ctx, s, line, ph, L, state) {
    if (line.empty || !ph.visible) return;
    const type = effType(ph);
    const b = { x: line.x, y: line.top, w: line.width, h: line.bottom - line.top || s.size };
    ctx.save();
    if (s.clipToBox) {
      const bx = L.box;
      ctx.beginPath(); ctx.rect(bx.x, bx.y, bx.w, bx.h); ctx.clip();
    }
    setTextStyle(ctx, s);
    if (line.extraLs) ctx.letterSpacing = `${(s.letterSpacing || 0) + line.extraLs}px`;
    ctx.fillStyle = s.color;
    textShadow(ctx, s);

    if (PER_CHAR.has(type) || PER_WORD.has(type)) {
      drawPerUnit(ctx, s, line, ph, type);
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
      const ls = (s.letterSpacing || 0) + (line.extraLs || 0) + extra;
      ctx.letterSpacing = `${ls}px`;
      const w = ctx.measureText(line.text).width - ls;
      const anchorX = line.x + line.width / 2 - w / 2;
      ctx.fillText(line.text, anchorX, line.baseline);
    } else {
      ctx.fillText(line.text, line.x, line.baseline);
    }
    ctx.restore();
  }

  function drawPerUnit(ctx, s, line, ph, type) {
    const chars = Array.from(line.text);
    // Build units (characters or words) with x positions.
    const units = [];
    if (PER_WORD.has(type)) {
      const re = /\S+/g; let m;
      while ((m = re.exec(line.text))) {
        const pre = line.text.slice(0, m.index);
        units.push({ text: m[0], x: line.x + (pre ? ctx.measureText(pre).width : 0) });
      }
    } else {
      let pre = '';
      for (const ch of chars) {
        units.push({ text: ch, x: line.x + (pre ? ctx.measureText(pre).width : 0) });
        pre += ch;
      }
    }
    const n = units.length;
    const stagger = clamp(s.anim.stagger ?? 0.5, 0, 0.98);
    const span = 1 + stagger * (n - 1);
    const anim = ph.anim || s.anim.in;
    const easeFn = ph.ease || getEasing(anim.easing, anim.bezier);
    const isOut = ph.phase === 'out';
    if (type === 'typewriter') {
      const p = ph.phase === 'hold' ? 1 : ph.p;
      const count = Math.floor(p * n + 1e-6);
      for (let i = 0; i < count; i++) ctx.fillText(units[i].text, units[i].x, line.baseline);
      return;
    }
    for (let i = 0; i < n; i++) {
      let p;
      if (ph.phase === 'hold') p = 1;
      else {
        // Out phase: animate letters in the same order they came in.
        const raw = clamp(ph.raw * span - i * stagger);
        p = isOut ? 1 - easeFn(raw) : easeFn(raw);
      }
      if (p <= 0.0001 && type !== 'lettersScale') continue;
      const u = units[i];
      ctx.save();
      const uw = ctx.measureText(u.text).width;
      const h = line.bottom - line.top;
      switch (type) {
        case 'lettersFade': ctx.globalAlpha *= clamp(p); break;
        case 'lettersRise': ctx.globalAlpha *= clamp(p * 2); ctx.translate(0, (1 - p) * s.size * 0.6); break;
        case 'wordsRise': ctx.globalAlpha *= clamp(p * 2); ctx.translate(0, (1 - p) * s.size * 0.6); break;
        case 'lettersDrop': ctx.globalAlpha *= clamp(p * 2); ctx.translate(0, -(1 - p) * s.size * 0.6); break;
        case 'lettersScale': {
          if (p <= 0.0001) { ctx.restore(); continue; }
          const cx = u.x + uw / 2, cy = line.top + h / 2;
          ctx.translate(cx, cy); ctx.scale(p, p); ctx.translate(-cx, -cy);
          break;
        }
        case 'lettersBlur': ctx.globalAlpha *= clamp(p); ctx.filter = `blur(${((1 - p) * 12).toFixed(2)}px)`; break;
        default: break;
      }
      ctx.fillText(u.text, u.x, line.baseline);
      ctx.restore();
    }
  }

  // ---------- Main render ----------
  function render(ctx, state, t, opts = {}) {
    const { width, height, duration } = state.comp;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.restore();

    const L = computeLayout(ctx, state);
    const bd = state.backdrop;

    // Backdrop
    if (bd.type !== 'none') {
      const ph = phaseAt(bd.anim, t, duration);
      if (ph.visible) {
        const type = effType(ph);
        const margin = 200;
        const bb = { x: L.box.x, y: L.box.y, w: L.box.w, h: L.box.h };
        const r = animParams(type, ph.p, bb, bd.anim.distance);
        ctx.save();
        applyParams(ctx, r, margin);
        drawBackdrop(ctx, state, L);
        ctx.restore();
      }
    }
    // Text
    drawText(ctx, state.title, L.title, phaseAt(state.title.anim, t, duration), L, state);
    drawText(ctx, state.subtitle, L.subtitle, phaseAt(state.subtitle.anim, t, duration), L, state);

    L.layers = layerBounds(state, L);
    if (opts.guides) drawGuides(ctx, state, L, opts);
    return L;
  }

  // Untransformed bounds of each layer, used for click-to-select.
  function layerBounds(state, L) {
    const tb = (line, s) => (line.empty ? null : { x: line.x - 4, y: line.top - s.size * 0.12, w: line.width + 8, h: (line.bottom - line.top) + s.size * 0.24 });
    return {
      title: tb(L.title, state.title),
      subtitle: tb(L.subtitle, state.subtitle),
      backdrop: state.backdrop.type === 'none' ? null : { ...L.box },
    };
  }
  function hitTest(L, x, y) {
    if (!L || !L.layers) return null;
    for (const k of ['title', 'subtitle', 'backdrop']) {
      const b = L.layers[k];
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
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
      ctx.save();
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 * lw; ctx.setLineDash([6 * lw, 4 * lw]);
      ctx.strokeRect(b.x - 3 * lw, b.y - 3 * lw, b.w + 6 * lw, b.h + 6 * lw);
      ctx.setLineDash([]);
      const label = { backdrop: 'Backdrop', title: 'Title', subtitle: 'Subtitle' }[opts.selected];
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
    BACKDROP_ANIMS, TEXT_ANIMS, SHAPES,
    render, computeLayout, phaseAt, timingSpans, imagesReady, getImage, hitTest,
    set onImageLoad(fn) { onImageLoad = fn; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
