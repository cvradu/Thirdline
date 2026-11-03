// Export to After Effects / .mogrt.
// buildScene() turns a Thirdline document into a plain description of an After Effects comp
// (layers, properties, keyframes, expressions, Essential Graphics controls). main.js writes it
// next to src/ae/thirdline-build.jsx, which rebuilds it inside After Effects.
//
// Animation is carried by expressions that run tlrt() below: a copy of Thirdline's own timing,
// easing, layout and animation maths, so the AE comp moves exactly like the preview, and the
// backdrop still wraps the text when the text is edited in Premiere's Essential Graphics panel.
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------------------------
  // Expression runtime. Serialised into every expression with Function.prototype.toString(), so it
  // must be self-contained and use only what AE's JavaScript expression engine provides (time,
  // thisComp, thisLayer, createPath). Keep it ES2015 (no ?? / ?.).
  // ---------------------------------------------------------------------------------------------
  function tlrt(C) {
    var c1 = 1.70158, c3 = c1 + 1, c4 = (2 * Math.PI) / 3;
    function bounceOut(t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
    var E = {
      linear: function (t) { return t; },
      easeInQuad: function (t) { return t * t; },
      easeOutQuad: function (t) { return 1 - (1 - t) * (1 - t); },
      easeInOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
      easeInCubic: function (t) { return t * t * t; },
      easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
      easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
      easeInQuart: function (t) { return t * t * t * t; },
      easeOutQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
      easeInOutQuart: function (t) { return t < 0.5 ? 8 * Math.pow(t, 4) : 1 - Math.pow(-2 * t + 2, 4) / 2; },
      easeInExpo: function (t) { return t === 0 ? 0 : Math.pow(2, 10 * t - 10); },
      easeOutExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
      easeInOutExpo: function (t) { return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2; },
      easeInBack: function (t) { return c3 * t * t * t - c1 * t * t; },
      easeOutBack: function (t) { return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
      easeInOutBack: function (t) {
        var c2 = c1 * 1.525;
        return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
      },
      easeOutElastic: function (t) { return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
      easeInElastic: function (t) { return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4); },
      easeOutBounce: bounceOut,
      easeInBounce: function (t) { return 1 - bounceOut(1 - t); },
    };
    function cubicBezier(x1, y1, x2, y2) {
      var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
      var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
      function sx(t) { return ((ax * t + bx) * t + cx) * t; }
      function sy(t) { return ((ay * t + by) * t + cy) * t; }
      function dsx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
      function solve(x) {
        var t = x, i, e, d;
        for (i = 0; i < 8; i++) { e = sx(t) - x; if (Math.abs(e) < 1e-6) return t; d = dsx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
        var lo = 0, hi = 1; t = x;
        for (i = 0; i < 30; i++) { var v = sx(t); if (Math.abs(v - x) < 1e-6) return t; if (x > v) lo = t; else hi = t; t = (lo + hi) / 2; }
        return t;
      }
      return function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)); };
    }
    function ease(name, bez) {
      if (name === 'custom' && bez && bez.length === 4) return cubicBezier(bez[0], bez[1], bez[2], bez[3]);
      return E[name] || E.linear;
    }
    function clamp(v, a, b) { if (a === undefined) a = 0; if (b === undefined) b = 1; return Math.min(b, Math.max(a, v)); }

    // Same as Engine.phaseAt.
    function phaseAt(anim, t, duration) {
      var inA = anim['in'], outA = anim.out;
      var inStart = inA.delay || 0;
      var inDur = inA.type === 'none' ? 0 : Math.max(0.001, inA.duration);
      var outEnd = duration - (outA.offset || 0);
      var outDur = outA.type === 'none' ? 0 : Math.max(0.001, outA.duration);
      var outStart = outEnd - outDur;
      if (t < inStart) return { visible: false, phase: 'before', raw: 0, p: 0 };
      if (inDur > 0 && t < inStart + inDur) {
        var raw = (t - inStart) / inDur, e1 = ease(inA.easing, inA.bezier);
        return { visible: true, phase: 'in', raw: raw, ease: e1, anim: inA, p: e1(raw) };
      }
      if (outA.type === 'none') return t <= outEnd || outA.offset === 0 ? { visible: true, phase: 'hold', raw: 1, p: 1 } : { visible: false, phase: 'after', raw: 1, p: 0 };
      if (t < outStart) return { visible: true, phase: 'hold', raw: 1, p: 1 };
      if (t < outEnd) {
        var raw2 = (t - outStart) / outDur, e2 = ease(outA.easing, outA.bezier);
        return { visible: true, phase: 'out', raw: raw2, ease: e2, anim: outA, p: 1 - e2(raw2) };
      }
      return { visible: false, phase: 'after', raw: 1, p: 0 };
    }
    var OUT_SWAP = { wipeLeft: 'wipeRight', wipeRight: 'wipeLeft', wipeUp: 'wipeDown', wipeDown: 'wipeUp', maskUp: 'maskDown', maskDown: 'maskUp' };
    function effType(ph) { return ph.phase === 'hold' ? 'none' : ph.phase === 'out' ? OUT_SWAP[ph.anim.type] || ph.anim.type : ph.anim.type; }
    var PER = { lettersFade: 1, lettersRise: 1, lettersDrop: 1, lettersScale: 1, lettersBlur: 1, typewriter: 1, wordsRise: 1 };

    // Same as Engine animParams.
    function animParams(type, p, b, dist, pivot) {
      var q = 1 - p;
      var r = { dx: 0, dy: 0, sx: 1, sy: 1, ox: pivot ? pivot[0] : b.x + b.w / 2, oy: pivot ? pivot[1] : b.y + b.h / 2, alpha: 1, clip: null, blur: 0, tracking: 0, maskSelf: false };
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
        case 'wipeUp': r.clip = { x: b.x, y: b.y + b.h * q, w: b.w, h: b.h * p, axis: 'y' }; break;
        case 'wipeDown': r.clip = { x: b.x, y: b.y, w: b.w, h: b.h * p, axis: 'y' }; break;
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

    // ---- reading the comp ----
    function lay(n) { return thisComp.layer(n); }
    function sliderOf(layerName, name, def) {
      try { return lay(layerName).effect(name)(1).value; } catch (e) { return def; }
    }
    // A layer's own value: a keyframed slider ("TL <key>") when the value is animated, else the constant.
    function v(id, key) {
      var d = C.L[id], c = d.vals[key];
      if (d.keyed && d.keyed.indexOf(key) >= 0) return sliderOf(d.name, 'TL ' + key, c);
      return c;
    }
    function textOf(id) {
      var src = lay(C.L[id].name).text.sourceText;
      var s = String(src && src.value !== undefined ? src.value : src);
      return C.L[id].caps ? s.toUpperCase() : s;
    }
    // Width of a text layer: Thirdline's measured width, corrected by how much After Effects says the
    // text has grown or shrunk since export. f = auto-fit scale.
    var tcache = {};
    function textW(id) {
      if (tcache[id]) return tcache[id];
      var d = C.L[id], res = { w: 0, f: 1, n: 0 };
      if (d && d.on) {
        var s = textOf(id);
        res.n = s.length;
        if (s.replace(/\s/g, '').length) {
          var w = Math.max(0, d.W0 + (lay(d.name).sourceRectAtTime(C.HT, false).width - d.R0));
          if (d.fit > 0 && w > d.fit) { res.f = d.fit / w; w = d.fit; }
          res.w = w;
        }
      }
      tcache[id] = res;
      return res;
    }

    // ---- layout: same rules as Engine.computeLayout (vertical positions are fixed at export) ----
    var lcache = null;
    function layout() {
      if (lcache) return lcache;
      var K = C.K, tm = textW('title'), sm = textW('subtitle');
      var contentW = Math.max(tm.w, sm.w);
      var boxW = contentW + K.padL + K.padR, boxH = K.boxH;
      if (K.fixedWidth > 0) boxW = K.fixedWidth;
      boxW = Math.max(boxW, K.minWidth || 0);
      if (K.natural) boxW = K.boxW0;
      var tt = null;
      if (K.twoTone) {
        var tW = Math.max(tm.w + K.padL + K.padR, K.minWidth || 0, K.fixedWidth || 0);
        var sW = sm.w > 0 ? sm.w + K.padL + K.padR : 0;
        tt = { tW: tW, sW: sW };
        boxW = Math.max(tW, sW);
      }
      var x = K.hAnchor === 'center' ? K.lx - boxW / 2 : K.hAnchor === 'right' ? K.lx - boxW : K.lx;
      var y = K.boxY;
      var innerL = x + K.padL, innerR = x + boxW - K.padR;
      function alignX(w, l, r) { return K.align === 'center' ? (l + r) / 2 - w / 2 : K.align === 'right' ? r - w : l; }
      var out = { box: { x: x, y: y, w: boxW, h: boxH } };
      out.title = { x: alignX(tm.w, innerL, innerR) + K.xShift, w: tm.w, f: tm.f, n: tm.n };
      out.subtitle = { x: alignX(sm.w, innerL, innerR) + K.xShift, w: sm.w, f: sm.f, n: sm.n };
      if (K.align === 'justify') {
        out.title.x = innerL + K.xShift; out.title.w = Math.max(tm.w, innerR - innerL);
        out.subtitle.x = innerL + K.xShift; out.subtitle.w = Math.max(sm.w, innerR - innerL);
      }
      if (tt) {
        var bx = function (w) { return K.hAnchor === 'right' ? x + boxW - w : K.hAnchor === 'center' ? x + boxW / 2 - w / 2 : x; };
        out.titleBox = { x: bx(tt.tW), y: y, w: tt.tW, h: K.tH };
        out.subBox = { x: bx(tt.sW), y: y + K.tH, w: tt.sW, h: K.sH };
        var ax = function (w, b) { return K.align === 'center' ? b.x + b.w / 2 - w / 2 : K.align === 'right' ? b.x + b.w - K.padR - w : b.x + K.padL; };
        out.title.x = ax(tm.w, out.titleBox); out.subtitle.x = ax(sm.w, out.subBox);
        if (K.align === 'justify') { out.title.x = out.titleBox.x + K.padL; out.subtitle.x = out.subBox.x + K.padL; }
      }
      lcache = out;
      return out;
    }
    // Extra layers: same rules as Engine.extraBoxes.
    function extraBox(id) {
      var d = C.L[id], Lo = layout();
      var ref = d.attach === 'frame' ? { x: 0, y: 0, w: C.W, h: C.H } : Lo.box;
      var w = d.w, h = d.h, f = 1;
      if (d.kind === 'text') { var m = textW(id); w = m.w; f = m.f; h = d.textH; }
      else if (d.kind === 'shape') { if (!w) w = ref.w; if (!h) h = ref.h; if (d.shape === 'line') h = Math.max(1, d.h || 4); }
      var x = ref.x + ref.w * d.ax - w * d.ax + d.x;
      var y = ref.y + ref.h * d.ay - h * d.ay + d.y;
      return { x: x, y: y, w: w, h: h, f: f };
    }
    // Untransformed bounds the animation works on (Engine: b / bb), plus where the layer's own
    // content sits (pos0 = content origin in comp space, F = content scale).
    function frame(id) {
      var d = C.L[id], Lo = layout();
      if (d.kind === 'backdrop') {
        var bb = Lo.box;
        if (d.image) return { b: bb, pos0: [bb.x, bb.y], F: [bb.w / d.imgW, bb.h / d.imgH] };
        return { b: bb, pos0: [0, 0], F: [1, 1] };
      }
      if (d.kind === 'title' || d.kind === 'subtitle') {
        var ln = Lo[d.kind];
        var h = d.bottom - d.top || d.size;
        return { b: { x: ln.x, y: d.top, w: ln.w, h: h }, pos0: [ln.x, d.base], F: [ln.f, ln.f], n: ln.n };
      }
      var e = extraBox(id);
      if (d.kind === 'text') return { b: { x: e.x, y: e.y, w: e.w, h: e.h || d.size }, pos0: [e.x, e.y + d.ascent], F: [e.f, e.f], n: textW(id).n };
      if (d.kind === 'image') return { b: e, pos0: [e.x, e.y], F: [e.w / d.imgW, e.h / d.imgH] };
      return { b: e, pos0: [0, 0], F: [1, 1] };
    }
    // User transform (Advanced mode position/scale/rotation…) of a layer.
    function user(id, b) {
      var sc = v(id, 'scale') / 100;
      var ax = v(id, 'anchorX'), ay = v(id, 'anchorY');
      if (ax === undefined || ax === null) ax = 50;
      if (ay === undefined || ay === null) ay = 50;
      return {
        // Anchor point: where the layer scales and rotates from (Engine pivotOf).
        c: [b.x + (b.w * ax) / 100, b.y + (b.h * ay) / 100],
        d: [v(id, 'x'), v(id, 'y')],
        s: [Math.max(1e-4, sc * v(id, 'scaleX') / 100), Math.max(1e-4, sc * v(id, 'scaleY') / 100)],
        rot: v(id, 'rotation'),
        op: clamp(v(id, 'opacity') / 100),
        blur: v(id, 'blur'),
        tracking: v(id, 'tracking') || 0,
      };
    }
    function rotate(p, deg) {
      var a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
    }
    // U: the user transform as a point mapping.
    function applyU(u, p) {
      var q = rotate([(p[0] - u.c[0]) * u.s[0], (p[1] - u.c[1]) * u.s[1]], u.rot);
      return [u.c[0] + u.d[0] + q[0], u.c[1] + u.d[1] + q[1]];
    }

    // Parenting: the user transforms of a layer's parents, nearest first (Engine parentChain).
    function chain(id) {
      var out = [], seen = {}, p = C.L[id] && C.L[id].parent;
      seen[id] = 1;
      while (p && !seen[p] && C.L[p]) { seen[p] = 1; out.push(user(p, frame(p).b)); p = C.L[p].parent; }
      return out;
    }
    function applyChain(ch, p) { for (var i = 0; i < ch.length; i++) p = applyU(ch[i], p); return p; }

    // Everything about a layer at time t: AE transform (anchor stays [0,0]) plus effect amounts.
    var xcache = {};
    function xform(id, t) {
      if (t === undefined) t = time;
      var ck = id + '@' + t;
      if (xcache[ck]) return xcache[ck];
      var d = C.L[id], fr = frame(id), b = fr.b;
      // Text uses the line box, the backdrop its own box; both pivot the user transform on the centre.
      var u = user(id, b);
      var ph = phaseAt(d.anim, t, C.dur);
      var type = ph.visible ? effType(ph) : 'none';
      var per = !!PER[type];
      var r = animParams(per ? 'none' : type, ph.p, b, d.anim.distance || 0, u.c);
      var da = [r.dx, r.dy];
      var size = d.size ? d.size * fr.F[0] : 0;
      var extra = 0;
      if (r.tracking) {
        // Engine re-centres the line while it spreads: shift left by half the added width.
        extra = r.tracking * size * -1;
        da[0] -= (Math.max(1, fr.n) - 1) * extra / 2;
      }
      var o = [r.ox, r.oy], sa = [r.sx, r.sy];
      // Total = U ∘ A ∘ (place content at pos0, scaled by F). With anchor [0,0]:
      // position = c + d + R·Su·(o + da − c + Sa·(pos0 − o)), scale = Su·Sa·F.
      var q = [o[0] + da[0] - u.c[0] + sa[0] * (fr.pos0[0] - o[0]), o[1] + da[1] - u.c[1] + sa[1] * (fr.pos0[1] - o[1])];
      var rq = rotate([u.s[0] * q[0], u.s[1] * q[1]], u.rot);
      // Parents add their own rotation and scale on top (exact for uniform parent scale).
      var ch = chain(id), pos = [u.c[0] + u.d[0] + rq[0], u.c[1] + u.d[1] + rq[1]], psx = 1, psy = 1, prot = 0;
      for (var ci = 0; ci < ch.length; ci++) { pos = applyU(ch[ci], pos); psx *= ch[ci].s[0]; psy *= ch[ci].s[1]; prot += ch[ci].rot; }
      var res = {
        pos: pos,
        scale: [psx * u.s[0] * sa[0] * fr.F[0] * 100, psy * u.s[1] * sa[1] * fr.F[1] * 100],
        rot: u.rot + prot, ch: ch,
        opacity: ph.visible ? 100 * u.op * clamp(r.alpha) * clamp(d.baseOpacity === undefined ? 1 : v(id, 'baseOpacity')) : 0,
        blur: u.blur + r.blur,
        trackingEm: size > 0 ? ((extra + u.tracking) / size) * 1000 : 0,
        r: r, u: u, b: b, ph: ph, type: type, fr: fr,
      };
      xcache[ck] = res;
      return res;
    }

    // Content-space point for a comp-space point (inverse of the layer transform).
    function toContent(X, p) {
      var q = rotate([p[0] - X.pos[0], p[1] - X.pos[1]], -X.rot);
      return [q[0] / (X.scale[0] / 100), q[1] / (X.scale[1] / 100)];
    }
    function toContentVec(X, v2) {
      var q = rotate(v2, -X.rot);
      return [q[0] / (X.scale[0] / 100), q[1] / (X.scale[1] / 100)];
    }
    // Closed path through comp-space vertices (with comp-space tangents), mapped into layer space.
    function path(X, pts, ins, outs) {
      var P = [], I = [], O = [];
      for (var i = 0; i < pts.length; i++) {
        P.push(toContent(X, pts[i]));
        I.push(ins ? toContentVec(X, ins[i]) : [0, 0]);
        O.push(outs ? toContentVec(X, outs[i]) : [0, 0]);
      }
      return createPath(P, I, O, true);
    }
    function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
    var K4 = 0.5523;
    function ellipseShape(x, y, w, h) {
      var cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
      return {
        pts: [[cx, y], [x + w, cy], [cx, y + h], [x, cy]],
        ins: [[-rx * K4, 0], [0, -ry * K4], [rx * K4, 0], [0, ry * K4]],
        outs: [[rx * K4, 0], [0, ry * K4], [-rx * K4, 0], [0, -ry * K4]],
      };
    }
    function roundRectShape(x, y, w, h, rad) {
      var r = Math.max(0, Math.min(rad, w / 2, h / 2)), k = r * K4;
      if (r <= 0) return { pts: rectPts(x, y, w, h) };
      return {
        pts: [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]],
        ins: [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]],
        outs: [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]],
      };
    }
    var BIG = 100000;

    // ---- the values each expression asks for ----
    var api = {
      xform: xform,
      layout: layout,
      position: function (id) { return xform(id).pos; },
      scale: function (id) { return xform(id).scale; },
      rotation: function (id) { return xform(id).rot; },
      opacity: function (id) { return xform(id).opacity; },
      blur: function (id) { return Math.max(0, xform(id).blur) * C.BLURK; },
      trackingEm: function (id) { return xform(id).trackingEm; },
      // Mask paths. kind: 'clip' (wipe / mask-reveal of the in & out animations), 'box' (text kept
      // inside the backdrop), 'user' (the layer's own mask).
      mask: function (id, kind) {
        var X = xform(id), d = C.L[id];
        if (kind === 'user') {
          var m = { x: v(id, 'mask.x'), y: v(id, 'mask.y'), w: v(id, 'mask.w'), h: v(id, 'mask.h'), radius: v(id, 'mask.radius') };
          var sh = d.maskShape === 'ellipse' ? ellipseShape(m.x, m.y, m.w, m.h) : roundRectShape(m.x, m.y, m.w, m.h, m.radius || 0);
          return path(X, sh.pts, sh.ins, sh.outs);
        }
        if (kind === 'box') {
          var bxId = C.boxLayer, bb = layout().box, ub = user(bxId, bb);
          var bch = chain(bxId);
          var pts = rectPts(bb.x, bb.y, bb.w, bb.h).map(function (p) { return applyChain(bch, applyU(ub, p)); });
          return path(X, pts);
        }
        // clip: drawn in the layer's own (user-transformed) space
        var r = X.r, b = X.b, rect = null;
        var e = d.bleed || 0;
        if (r.maskSelf) { var pad = (d.size || 0) * X.fr.F[0] * 0.25; rect = { x: b.x - pad - e, y: b.y - pad * 0.5 - e, w: b.w + (pad + e) * 2, h: b.h + pad + 2 * e }; }
        else if (r.clip) {
          var mg = d.kind === 'backdrop' || d.kind === 'image' || d.kind === 'shape' ? 200 : d.size ? Math.max(d.size * X.fr.F[0], e) : 200;
          var c = r.clip;
          if (e > 0) {
            // Same as Engine sweepClip: the wipe also travels across the shadow / glow.
            if (c.axis === 'y') { var ky = (b.h + 2 * e) / Math.max(1e-6, b.h); c = { x: c.x, w: c.w, axis: 'y', y: b.y - e + (c.y - b.y) * ky, h: c.h * ky }; }
            else { var kx = (b.w + 2 * e) / Math.max(1e-6, b.w); c = { y: c.y, h: c.h, x: b.x - e + (c.x - b.x) * kx, w: c.w * kx }; }
          }
          rect = c.axis === 'y' ? { x: c.x - mg, y: c.y, w: c.w + mg * 2, h: c.h } : { x: c.x, y: c.y - mg, w: c.w, h: c.h + mg * 2 };
        }
        if (!rect) return path(X, rectPts(-BIG, -BIG, 2 * BIG, 2 * BIG));
        var u = X.u;
        return path(X, rectPts(rect.x, rect.y, Math.max(0, rect.w), Math.max(0, rect.h)).map(function (p) { return applyChain(X.ch, applyU(u, p)); }));
      },
      maskFeather: function (id) { var f = v(id, 'mask.feather') || 0; return [f * C.BLURK, f * C.BLURK]; },
      // Backdrop pieces (rectangles in comp space): [size], [centre], roundness.
      piece: function (name, what) {
        var Lo = layout(), b = Lo.box, K = C.K, rect, round = 0;
        switch (name) {
          case 'box': rect = b; round = K.shape === 'pill' ? b.h / 2 : K.shape === 'rect' ? 0 : K.radius; break;
          case 'bar': rect = { x: b.x, y: b.y, w: K.accentWidth, h: b.h }; break;
          case 'titleBox': rect = Lo.titleBox; round = K.radius; break;
          case 'subBox': rect = Lo.subBox; round = K.radius; break;
          case 'underline': rect = { x: b.x, y: b.y + b.h - K.accentWidth, w: b.w, h: K.accentWidth }; break;
          case 'cornerTL1': case 'cornerTL2': case 'cornerBR1': case 'cornerBR2': {
            var len = Math.min(b.w, b.h) * 0.35, w = K.accentWidth;
            rect = { cornerTL1: { x: b.x, y: b.y, w: len, h: w }, cornerTL2: { x: b.x, y: b.y, w: w, h: len },
              cornerBR1: { x: b.x + b.w - len, y: b.y + b.h - w, w: len, h: w }, cornerBR2: { x: b.x + b.w - w, y: b.y + b.h - len, w: w, h: len } }[name];
            break;
          }
          default: rect = b;
        }
        if (what === 'size') return [Math.max(0, rect.w), Math.max(0, rect.h)];
        if (what === 'pos') return [rect.x + rect.w / 2, rect.y + rect.h / 2];
        return Math.max(0, Math.min(round, rect.w / 2, rect.h / 2));
      },
      slant: function () {
        var b = layout().box, s = C.K.skew;
        return createPath([[b.x + s, b.y], [b.x + b.w, b.y], [b.x + b.w - s, b.y + b.h], [b.x, b.y + b.h]], [], [], true);
      },
      extraShape: function (id, what) {
        var e = extraBox(id), d = C.L[id];
        if (what === 'size') return [e.w, e.h];
        if (what === 'pos') return [e.x + e.w / 2, e.y + e.h / 2];
        return d.shape === 'line' ? e.h / 2 : d.shape === 'rounded' ? d.radius : 0;
      },
      // Backdrop gradients (effect points are in layer space = comp space for the backdrop).
      grad: function (what) {
        var b = layout().box, K = C.K;
        if (K.fillType === 'radial') {
          var cx = b.x + (K.gradCX / 100) * b.w, cy = b.y + (K.gradCY / 100) * b.h;
          var rr = (K.gradRadius / 100) * Math.hypot(b.w, b.h) / 2;
          return what === 'start' ? [cx, cy] : [cx + Math.max(1, rr), cy];
        }
        if (K.fillType === 'fourPoint') return { p1: [b.x, b.y], p2: [b.x + b.w, b.y], p3: [b.x + b.w, b.y + b.h], p4: [b.x, b.y + b.h] }[what];
        var ang = (K.gradientAngle * Math.PI) / 180, gx = b.x + b.w / 2, gy = b.y + b.h / 2;
        var half = (Math.abs(Math.cos(ang)) * b.w + Math.abs(Math.sin(ang)) * b.h) / 2;
        var dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
        return what === 'start' ? [gx - dx, gy - dy] : [gx + dx, gy + dy];
      },
      // Per-letter / per-word in & out animations, as an Expression Selector amount (0–100).
      unit: function (id, which, index, total) {
        var d = C.L[id], ph = phaseAt(d.anim, time, C.dur);
        if (!ph.visible) return which === 'alpha' ? 100 : 0;
        var type = effType(ph);
        if (type === 'typewriter') {
          var cnt = Math.floor((ph.phase === 'hold' ? 1 : ph.p) * total + 1e-6);
          return which === 'alpha' && index - 1 >= cnt ? 100 : 0;
        }
        if (!PER[type]) return 0;
        var byWord = type === 'wordsRise';
        if ((which.indexOf('w') === 0) !== byWord) return 0; // char animators skip word types and back
        var w = byWord ? which.slice(1) : which;
        var p = 1;
        if (ph.phase !== 'hold') {
          var st = clamp(d.anim.stagger === undefined ? 0.5 : d.anim.stagger, 0, 0.98);
          var span = 1 + st * (total - 1);
          var raw = clamp(ph.raw * span - (index - 1) * st);
          p = ph.phase === 'out' ? 1 - ph.ease(raw) : ph.ease(raw);
        }
        if (w === 'alpha') {
          if (p <= 0.0001) return 100;
          var a = type === 'lettersRise' || type === 'lettersDrop' || type === 'wordsRise' ? clamp(p * 2) : type === 'lettersScale' ? 1 : clamp(p);
          return 100 * (1 - a);
        }
        if (w === 'rise') return type === 'lettersRise' || type === 'wordsRise' ? 100 * (1 - p) : type === 'lettersDrop' ? -100 * (1 - p) : 0;
        if (w === 'scale') return type === 'lettersScale' ? 100 * (1 - p) : 0;
        if (w === 'blur') return type === 'lettersBlur' ? 100 * (1 - p) : 0;
        return 0;
      },
    };
    return api;
  }

  // Wraps a call to the runtime into a complete expression.
  const RUNTIME_SRC = tlrt.toString();
  function expr(cfgName, call) {
    return `var T = (${RUNTIME_SRC})(${cfgName});\n${call}`;
  }

  // ---------------------------------------------------------------------------------------------
  // Scene builder (runs in the Thirdline window).
  // ---------------------------------------------------------------------------------------------
  const BLURK = 2.5; // canvas blur radius (σ) → AE Gaussian Blur "Blurriness"
  // Closest cubic-bezier for each named easing (used for keyframes the user set by hand).
  const BEZ = {
    linear: [0, 0, 1, 1],
    easeInQuad: [0.11, 0, 0.5, 0], easeOutQuad: [0.5, 1, 0.89, 1], easeInOutQuad: [0.45, 0, 0.55, 1],
    easeInCubic: [0.32, 0, 0.67, 0], easeOutCubic: [0.33, 1, 0.68, 1], easeInOutCubic: [0.65, 0, 0.35, 1],
    easeInQuart: [0.5, 0, 0.75, 0], easeOutQuart: [0.25, 1, 0.5, 1], easeInOutQuart: [0.76, 0, 0.24, 1],
    easeInExpo: [0.7, 0, 0.84, 0], easeOutExpo: [0.16, 1, 0.3, 1], easeInOutExpo: [0.87, 0, 0.13, 1],
    easeInBack: [0.36, 0, 0.66, -0.56], easeOutBack: [0.34, 1.56, 0.64, 1], easeInOutBack: [0.68, -0.6, 0.32, 1.6],
  };
  const hexRGB = (h) => {
    let x = String(h || '#000000').slice(1); if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    const n = parseInt(x.slice(0, 6), 16) || 0; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const WEIGHT_STYLE = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  function styleName(weight, italic) {
    const w = WEIGHT_STYLE[Math.round((weight || 400) / 100) * 100] || 'Regular';
    if (!italic) return w;
    return w === 'Regular' ? 'Italic' : `${w} Italic`;
  }
  const TRANSFORM_KEYS = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'opacity', 'blur', 'tracking', 'anchorX', 'anchorY'];
  const TR_DEFAULT = { x: 0, y: 0, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blur: 0, tracking: 0, anchorX: 50, anchorY: 50 };
  const AE_SHAPE = { square: 1, rampUp: 2, rampDown: 3, triangle: 4, round: 5, smooth: 6 };

  // Keyframes for a Thirdline key list, converted to AE eases. Elastic and bounce curves (no
  // bezier equivalent) are sampled every frame.
  function aeKeys(ks, fps, map = (x) => x) {
    const out = ks.map((k) => ({ t: k.t, v: map(k.v) }));
    const extra = [];
    for (let i = 0; i < ks.length - 1; i++) {
      const k = ks[i], n = ks[i + 1], key = out[i], next = out[i + 1];
      const e = k.e || 'easeInOutCubic';
      if (e === 'hold') { key.hold = true; continue; }
      if (typeof k.v !== 'number' || typeof n.v !== 'number') { key.linear = true; next.linearIn = true; continue; }
      const dt = Math.max(1e-6, n.t - k.t);
      const bez = e === 'custom' && Array.isArray(k.bezier) && k.bezier.length === 4 ? k.bezier : BEZ[e];
      if (!bez) {
        // Elastic / bounce: sample the curve every frame with linear keys.
        const fn = Easing.getEasing(e, k.bezier);
        key.linear = true; next.linearIn = true;
        const steps = Math.max(2, Math.round(dt * fps));
        for (let s = 1; s < steps; s++) extra.push({ t: k.t + (dt * s) / steps, v: map(k.v + (n.v - k.v) * fn(s / steps)), linear: true });
        continue;
      }
      const [x1, y1, x2, y2] = bez;
      const a = map(k.v), b = map(n.v);
      const speed = (f) => (Array.isArray(a) ? a.map((va, j) => ((b[j] - va) / dt) * f) : ((b - a) / dt) * f);
      key.outInf = Math.min(100, Math.max(0.1, x1 * 100));
      key.outSpeed = speed(x1 > 1e-4 ? y1 / x1 : 0);
      next.inInf = Math.min(100, Math.max(0.1, (1 - x2) * 100));
      next.inSpeed = speed(1 - x2 > 1e-4 ? (1 - y2) / (1 - x2) : 0);
    }
    return out.concat(extra).sort((p, q) => p.t - q.t);
  }

  // Builds the scene. ctx: a 2D canvas context (for text measurement); doc: { name }.
  function buildScene(state0, ctx, doc = {}) {
    const warnings = [];
    const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };
    const { width: W, height: H, fps, duration } = state0.comp;
    // Lay out at the middle of the hold, where everything is at rest.
    const holds = Engine.layerOrder(state0).map((id) => Engine.getLayer(state0, id)).filter(Boolean).map((ly) => Engine.timingSpans(ly.anim, duration));
    const restStart = Math.max(0, ...holds.map((s) => s.inEnd)), restEnd = Math.min(duration, ...holds.map((s) => s.outStart));
    const HT = restEnd > restStart ? (restStart + restEnd) / 2 : duration / 2;
    const st = Engine.resolveAt(state0, HT);
    const fitted = Engine.fitTextSizes(ctx, st);
    const L = Engine.layoutAt(ctx, st);
    const bd = st.backdrop;
    const shapeType = bd.type === 'shape' ? bd.shape : bd.type;
    const keys = state0.keys || {};

    const fonts = {};
    const fontKey = (s) => {
      const k = `${s.font}|${s.weight || 400}|${s.italic ? 1 : 0}`;
      fonts[k] = { family: s.font, weight: s.weight || 400, italic: !!s.italic, style: styleName(s.weight, s.italic) };
      return k;
    };
    const images = {};

    // Static layout constants for the runtime.
    const K = {
      padL: L.padL, padR: L.padR, boxH: L.box.h, boxY: L.box.y, boxW0: L.box.w,
      fixedWidth: bd.fixedWidth || 0, minWidth: bd.minWidth || 0,
      natural: bd.type === 'image' && bd.image && bd.image.fit === 'natural',
      twoTone: bd.type === 'shape' && bd.shape === 'twoTone',
      tH: L.titleBox ? L.titleBox.h : 0, sH: L.subBox ? L.subBox.h : 0,
      hAnchor: st.layout.hAnchor, lx: st.layout.x, align: st.layout.align,
      xShift: bd.type === 'image' ? (bd.image.textOffsetX || 0) : 0,
      shape: shapeType, radius: bd.radius || 0, skew: bd.skew || 0, accentWidth: bd.accentWidth || 0,
      fillType: bd.fillType || (bd.gradient ? 'linear' : 'solid'), gradientAngle: bd.gradientAngle || 0,
      gradCX: bd.gradCX ?? 50, gradCY: bd.gradCY ?? 50, gradRadius: bd.gradRadius ?? 75,
    };
    const CFG = { W, H, dur: duration, HT, BLURK, K, L: {}, boxLayer: 'backdrop' };
    const layers = [];
    const nameOf = {};
    const usedNames = new Set();
    const uniqueName = (n) => { let s = n, i = 2; while (usedNames.has(s)) s = `${n} ${i++}`; usedNames.add(s); return s; };

    // Keyed values for a layer → sliders + constants.
    function valuesFor(id, ly, prefix, extra = {}) {
      const vals = { ...TR_DEFAULT, ...(ly.transform || {}), ...extra };
      const keyed = [];
      const sliders = [];
      const add = (key, path, map) => {
        const ks = keys[path];
        if (ks && ks.length) {
          keyed.push(key);
          sliders.push({ name: `TL ${key}`, keys: aeKeys(ks.map((k) => ({ ...k })), fps, map), value: map ? map(ks[0].v) : ks[0].v });
        }
      };
      for (const k of TRANSFORM_KEYS) add(k, `${prefix}.transform.${k}`);
      if (ly.mask && ly.mask.enabled) {
        for (const k of ['x', 'y', 'w', 'h', 'radius', 'feather']) { vals[`mask.${k}`] = ly.mask[k] || 0; add(`mask.${k}`, `${prefix}.mask.${k}`); }
      }
      if (extra.baseOpacity !== undefined) add('baseOpacity', `${prefix}.opacity`);
      return { vals, keyed, sliders };
    }
    // Every Thirdline key path we turn into something in AE; the rest are reported.
    const handled = new Set();
    const markHandled = (prefix) => Object.keys(keys).forEach((p) => { if (p.startsWith(`${prefix}.transform.`) || p.startsWith(`${prefix}.mask.`)) handled.add(p); });

    const exprCall = (call) => ({ expr: expr('TLC', call) });
    const fxSlider = (s) => ({ match: 'ADBE Slider Control', name: s.name, params: [{ sel: 'OneD:0', value: s.value, keys: s.keys }] });

    // Shared layer pieces ------------------------------------------------------------------------
    function transformProps(id, opts = {}) {
      const call = (fn) => exprCall(`T.${fn}(${JSON.stringify(id)})`);
      const props = [
        { path: ['ADBE Transform Group', 'ADBE Anchor Point'], value: [0, 0] },
        { path: ['ADBE Transform Group', 'ADBE Position'], ...call('position') },
        { path: ['ADBE Transform Group', 'ADBE Scale'], ...call('scale') },
        { path: ['ADBE Transform Group', 'ADBE Rotate Z'], ...call('rotation') },
        { path: ['ADBE Transform Group', 'ADBE Opacity'], ...call('opacity') },
      ];
      return props;
    }
    function blurEffect(id, possible) {
      if (!possible) return [];
      return [{ match: 'ADBE Gaussian Blur 2', name: 'TL Blur', params: [{ sel: 'OneD:0', ...exprCall(`T.blur(${JSON.stringify(id)})`) }, { sel: 'OneD:2', value: 1, optional: true }] }];
    }
    function masksFor(id, ly, { clip, box }) {
      const ms = [];
      if (box) ms.push({ name: 'TL keep inside backdrop', ...exprCall(`T.mask(${JSON.stringify(id)}, 'box')`) });
      if (clip) ms.push({ name: 'TL reveal', ...exprCall(`T.mask(${JSON.stringify(id)}, 'clip')`) });
      if (ly.mask && ly.mask.enabled) {
        ms.push({ name: 'TL mask', inverted: !!ly.mask.invert, user: true, feather: exprCall(`T.maskFeather(${JSON.stringify(id)})`).expr, ...exprCall(`T.mask(${JSON.stringify(id)}, 'user')`) });
      }
      // First mask adds, the others narrow it down (an inverted user mask cuts a hole).
      ms.forEach((m, i) => { m.mode = i === 0 ? 'add' : m.inverted ? 'subtract' : 'intersect'; if (i > 0 && m.inverted) m.inverted = false; });
      return ms;
    }
    const animTypes = (ly) => [ly.anim.in.type, ly.anim.out.type];
    const hasClip = (ly) => animTypes(ly).some((t) => /^wipe|^mask/.test(t));
    const mayBlur = (ly, prefix) => animTypes(ly).some((t) => t === 'blur' || t === 'tracking') || (ly.transform && ly.transform.blur > 0) || !!(keys[`${prefix}.transform.blur`] || []).length;
    function inOut(ly) {
      const sp = Engine.timingSpans(ly.anim, duration);
      const outEnd = ly.anim.out.type === 'none' && !(ly.anim.out.offset > 0) ? duration : sp.outEnd;
      return { inPoint: Math.max(0, sp.inStart), outPoint: Math.min(duration, Math.max(outEnd, sp.inStart + 1 / fps)) };
    }
    function shadowFx(name, sh, glow) {
      if (glow) {
        const passes = Math.max(1, Math.min(4, Math.round(sh.strength || 1)));
        const op = 1 - Math.pow(1 - Math.min(1, sh.opacity ?? 1), passes);
        return { match: 'ADBE Drop Shadow', name, params: [{ sel: 'COLOR:0', value: [...hexRGB(sh.color), 1] }, { sel: 'OneD:0', pct: op }, { sel: 'OneD:1', value: 0 }, { sel: 'OneD:2', value: 0 }, { sel: 'OneD:3', value: (sh.size || 0) * BLURK / 2 }] };
      }
      const dx = sh.offsetX || 0, dy = sh.offsetY || 0;
      const dir = (Math.atan2(dx, -dy) * 180) / Math.PI;
      return { match: 'ADBE Drop Shadow', name, params: [{ sel: 'COLOR:0', value: [...hexRGB(sh.color), 1] }, { sel: 'OneD:0', pct: sh.opacity ?? 1 }, { sel: 'OneD:1', value: (dir + 360) % 360 }, { sel: 'OneD:2', value: Math.hypot(dx, dy) }, { sel: 'OneD:3', value: (sh.blur || 0) * BLURK / 2 }] };
    }

    // Text layers (title, subtitle, extra text) -------------------------------------------------
    function textLayer(id, ly, prefix, line, opts) {
      const name = uniqueName(opts.name);
      nameOf[id] = name;
      const size0 = ly.size; // AE gets the full size; auto-fit is a layer scale
      ctx.save(); const full = Engine.measureLine(ctx, { ...ly, size: size0 }); ctx.restore();
      const fitOn = ly.fitWidth > 0;
      const extraLs = line.extraLs || 0;
      // Width before auto-fit (AE gets the full font size and shrinks with layer scale).
      const W0 = fitOn ? full.width + (line.extraLs ? line.width - full.width : 0) : line.width;
      const vals = valuesFor(id, ly, prefix);
      markHandled(prefix);
      const cfg = {
        kind: opts.kind, name, on: true, caps: !!ly.uppercase, size: size0,
        W0, R0: 0, fit: ly.fitWidth || 0,
        top: line.top, bottom: line.bottom, base: line.baseline, ascent: line.ascent, textH: line.ascent + line.descent,
        anim: ly.anim, vals: vals.vals, keyed: vals.keyed,
        attach: ly.attach, ax: ly.ax ?? 0, ay: ly.ay ?? 0, x: ly.x || 0, y: ly.y || 0, w: 0, h: 0,
        maskShape: ly.mask && ly.mask.shape, bleed: Engine.bleed(ly),
      };
      CFG.L[id] = cfg;
      const types = animTypes(ly);
      const per = (set) => types.some((t) => set.includes(t));
      const animators = [];
      const unitSel = (which, words) => ({ type: 'expr', basedOn: words ? 3 : 1, ...exprCall(`T.unit(${JSON.stringify(id)}, ${JSON.stringify((words ? 'w' : '') + which)}, textIndex, textTotal)`) });
      const charTypes = ['lettersFade', 'lettersRise', 'lettersDrop', 'lettersScale', 'lettersBlur', 'typewriter'];
      if (per(charTypes)) {
        animators.push({ name: 'TL letters opacity', props: { 'ADBE Text Opacity': 0 }, selector: unitSel('alpha') });
        if (per(['lettersRise', 'lettersDrop'])) animators.push({ name: 'TL letters rise', props: { 'ADBE Text Position 3D': [0, size0 * 0.6, 0] }, selector: unitSel('rise') });
        if (per(['lettersScale'])) animators.push({ name: 'TL letters scale', grouping: 1, props: { 'ADBE Text Scale 3D': [0, 0, 100] }, selector: unitSel('scale') });
        if (per(['lettersBlur'])) animators.push({ name: 'TL letters blur', props: { 'ADBE Text Blur': [12 * BLURK, 12 * BLURK] }, selector: unitSel('blur') });
      }
      if (per(['wordsRise'])) {
        animators.push({ name: 'TL words opacity', props: { 'ADBE Text Opacity': 0 }, selector: unitSel('alpha', true) });
        animators.push({ name: 'TL words rise', props: { 'ADBE Text Position 3D': [0, size0 * 0.6, 0] }, selector: unitSel('rise', true) });
      }
      // Tracking from the "tracking" animation and from keyframed / set transform tracking.
      if (types.includes('tracking') || vals.keyed.includes('tracking') || (ly.transform && ly.transform.tracking)) {
        animators.push({ name: 'TL tracking', props: { 'ADBE Text Tracking Amount': exprCall(`T.trackingEm(${JSON.stringify(id)})`) }, selector: { type: 'all' } });
      }
      // The user's own After Effects-style animators map one to one.
      (ly.animators || []).forEach((a, i) => {
        if (a.enabled === false) return;
        const pr = a.props || {};
        const ap = `${prefix}.animators.${i}`;
        const kv = (k, def, map) => {
          const ks = keys[`${ap}.${k}`];
          if (ks && ks.length) { handled.add(`${ap}.${k}`); return { value: map ? map(ks[0].v) : ks[0].v, keys: aeKeys(ks.map((x) => ({ ...x })), fps, map) }; }
          return { value: map ? map(a[k] ?? def) : a[k] ?? def };
        };
        const pv = (k, def, map) => {
          const ks = keys[`${ap}.props.${k}`];
          if (ks && ks.length) { handled.add(`${ap}.props.${k}`); return { value: map(ks[0].v), keys: aeKeys(ks.map((x) => ({ ...x })), fps, map) }; }
          return { value: map(pr[k] ?? def) };
        };
        const props = {};
        if (pr.x || pr.y || keys[`${ap}.props.x`] || keys[`${ap}.props.y`]) props['ADBE Text Position 3D'] = { value: [pr.x || 0, pr.y || 0, 0] };
        if ((pr.scale ?? 100) !== 100 || keys[`${ap}.props.scale`]) props['ADBE Text Scale 3D'] = pv('scale', 100, (s) => [s, s, 100]);
        if (pr.rotation || keys[`${ap}.props.rotation`]) props['ADBE Text Rotation'] = pv('rotation', 0, (r) => r);
        if ((pr.opacity ?? 100) !== 100 || keys[`${ap}.props.opacity`]) props['ADBE Text Opacity'] = pv('opacity', 100, (o) => o);
        if (pr.blur || keys[`${ap}.props.blur`]) props['ADBE Text Blur'] = pv('blur', 0, (b) => [b * BLURK, b * BLURK]);
        if (pr.tracking || keys[`${ap}.props.tracking`]) props['ADBE Text Tracking Amount'] = pv('tracking', 0, (t) => (t / size0) * 1000);
        if (pr.colorOn && pr.color) props['ADBE Text Fill Color'] = pv('color', '#ffffff', (c) => [...hexRGB(c), 1]);
        if (keys[`${ap}.props.x`] || keys[`${ap}.props.y`]) warn('Animated x/y offsets inside a text animator were exported at their first value.');
        animators.push({
          name: `${a.name || 'Animator'} ${i + 1}`, grouping: 1, props,
          selector: { type: 'range', basedOn: a.unit === 'words' ? 3 : 1, shape: AE_SHAPE[a.shape || 'square'] || 1,
            start: kv('start', 0), end: kv('end', 100), offset: kv('offset', 0), amount: kv('amount', 100) },
        });
      });
      // Fill colour as an animator so it can be an Essential Graphics control (and keyframed).
      const colKs = keys[`${prefix}.color`];
      if (colKs && colKs.length) handled.add(`${prefix}.color`);
      animators.push({ name: 'TL colour', props: { 'ADBE Text Fill Color': colKs && colKs.length ? { value: [...hexRGB(colKs[0].v), 1], keys: aeKeys(colKs.map((x) => ({ ...x })), fps, (c) => [...hexRGB(c), 1]) } : { value: [...hexRGB(ly.color), 1] } }, selector: { type: 'all' }, eg: `${opts.label} colour` });

      const effects = [];
      if (vals.sliders.length) effects.push(...vals.sliders.map(fxSlider));
      if (ly.glow && ly.glow.on && ly.glow.size > 0) effects.push(shadowFx('TL Glow', ly.glow, true));
      if (ly.shadow && ly.shadow.on) effects.push(shadowFx('TL Shadow', ly.shadow));
      effects.push(...blurEffect(id, mayBlur(ly, prefix)));
      const font = fontKey(ly);
      layers.push({
        id, name, kind: 'text', ...inOut(ly),
        text: {
          text: ly.text || '', font, size: size0, color: hexRGB(ly.color),
          tracking: (((ly.letterSpacing || 0) + extraLs) / size0) * 1000,
          caps: !!ly.uppercase,
          stroke: ly.stroke && ly.stroke.on && ly.stroke.width > 0 ? { width: ly.stroke.width * 2, color: hexRGB(ly.stroke.color) } : null,
        },
        props: transformProps(id),
        masks: masksFor(id, ly, { clip: hasClip(ly), box: !!opts.clipToBox }),
        effects, animators,
        eg: [{ what: 'sourceText', name: opts.label }],
        motionBlur: !!(st.comp.motionBlur && st.comp.motionBlur.enabled),
      });
    }

    // Backdrop ------------------------------------------------------------------------------------
    function backdropLayers() {
      if (bd.type === 'none' || bd.visible === false) { CFG.boxLayer = null; return; }
      const vals = valuesFor('backdrop', bd, 'backdrop', { baseOpacity: bd.opacity ?? 1 });
      markHandled('backdrop'); handled.add('backdrop.opacity');
      const base = { kind: 'backdrop', anim: bd.anim, vals: vals.vals, keyed: vals.keyed, baseOpacity: bd.opacity ?? 1, maskShape: bd.mask && bd.mask.shape, bleed: Engine.bleed(bd) };
      const fx = vals.sliders.map(fxSlider);
      const common = (id) => ({ ...inOut(bd), props: transformProps(id), masks: masksFor(id, bd, { clip: hasClip(bd) }), motionBlur: !!(st.comp.motionBlur && st.comp.motionBlur.enabled) });
      const sh = bd.shadow && bd.shadow.on ? shadowFx('TL Shadow', bd.shadow) : null;
      const fillKs = keys['backdrop.fill'];
      if (fillKs && fillKs.length) handled.add('backdrop.fill');
      const fillColor = fillKs && fillKs.length ? { value: hexRGB(fillKs[0].v), keys: aeKeys(fillKs.map((x) => ({ ...x })), fps, hexRGB) } : { value: hexRGB(bd.fill) };
      const accKs = keys['backdrop.accentColor'];
      if (accKs && accKs.length) handled.add('backdrop.accentColor');
      const accColor = accKs && accKs.length ? { value: hexRGB(accKs[0].v), keys: aeKeys(accKs.map((x) => ({ ...x })), fps, hexRGB) } : { value: hexRGB(bd.accentColor) };

      if (bd.type === 'image') {
        const name = uniqueName('Backdrop');
        nameOf.backdrop = name;
        images.backdrop = bd.image.src;
        CFG.L.backdrop = { ...base, name, image: true, imgW: 0, imgH: 0 };
        layers.push({ id: 'backdrop', name, kind: 'image', image: 'backdrop', ...common('backdrop'), effects: [...fx, ...(sh ? [sh] : []), ...blurEffect('backdrop', mayBlur(bd, 'backdrop'))], eg: [{ what: 'media', name: 'Backdrop image' }] });
        if (bd.texture && bd.texture.enabled) warn('Texture overlays are not exported.');
        return;
      }
      const rectGroup = (gname, piece, color, egName) => ({
        name: gname,
        items: [{ type: 'rect', size: exprCall(`T.piece(${JSON.stringify(piece)}, 'size')`).expr, pos: exprCall(`T.piece(${JSON.stringify(piece)}, 'pos')`).expr, round: exprCall(`T.piece(${JSON.stringify(piece)}, 'round')`).expr }],
        fill: { color, eg: egName },
      });
      const main = [], accent = [];
      const s = bd.shape;
      const ft = K.fillType;
      if (['rect', 'rounded', 'pill', 'accent'].includes(s)) main.push(rectGroup('Box', 'box', fillColor, 'Backdrop colour'));
      if (s === 'slant') main.push({ name: 'Box', items: [{ type: 'path', path: exprCall('T.slant()').expr }], fill: { color: fillColor, eg: 'Backdrop colour' } });
      if (s === 'twoTone') { main.push(rectGroup('Title box', 'titleBox', fillColor, 'Backdrop colour')); accent.push(rectGroup('Subtitle box', 'subBox', accColor, 'Accent colour')); }
      if (s === 'accent') {
        const g = rectGroup('Accent bar', 'bar', accColor, 'Accent colour');
        if (bd.radius > 0) {
          // keep the bar inside the rounded box
          g.items.unshift({ type: 'rect', size: exprCall("T.piece('box', 'size')").expr, pos: exprCall("T.piece('box', 'pos')").expr, round: exprCall("T.piece('box', 'round')").expr });
          g.items.push({ type: 'merge', mode: 4 });
        }
        accent.push(g);
      }
      if (s === 'underline') accent.push(rectGroup('Underline', 'underline', accColor, 'Accent colour'));
      if (s === 'sideBar') accent.push(rectGroup('Side bar', 'bar', accColor, 'Accent colour'));
      if (s === 'corners') ['cornerTL1', 'cornerTL2', 'cornerBR1', 'cornerBR2'].forEach((c, i) => accent.push(rectGroup(`Corner ${i + 1}`, c, accColor, i === 0 ? 'Accent colour' : null)));
      if (!main.length && !accent.length) main.push(rectGroup('Box', 'box', fillColor, 'Backdrop colour'));

      const gradFx = [];
      if (ft !== 'solid' && main.length) {
        if (ft === 'fourPoint') {
          gradFx.push({ match: 'ADBE 4ColorGradient', name: 'TL Gradient', params: [
            { sel: 'TwoD:0', ...exprCall("T.grad('p1')") }, { sel: 'COLOR:0', value: [...hexRGB(bd.fill), 1], eg: 'Gradient colour 1' },
            { sel: 'TwoD:1', ...exprCall("T.grad('p2')") }, { sel: 'COLOR:1', value: [...hexRGB(bd.fill2 || bd.fill), 1], eg: 'Gradient colour 2' },
            { sel: 'TwoD:2', ...exprCall("T.grad('p3')") }, { sel: 'COLOR:2', value: [...hexRGB(bd.fill3 || bd.fill2 || bd.fill), 1], eg: 'Gradient colour 3' },
            { sel: 'TwoD:3', ...exprCall("T.grad('p4')") }, { sel: 'COLOR:3', value: [...hexRGB(bd.fill4 || bd.fill), 1], eg: 'Gradient colour 4' }] });
          warn('4-point gradients use After Effects’ 4-Color Gradient, which blends a little differently.');
        } else {
          gradFx.push({ match: 'ADBE Ramp', name: 'TL Gradient', params: [
            { sel: 'TwoD:0', ...exprCall("T.grad('start')") }, { sel: 'COLOR:0', value: [...hexRGB(bd.fill), 1], eg: 'Gradient start' },
            { sel: 'TwoD:1', ...exprCall("T.grad('end')") }, { sel: 'COLOR:1', value: [...hexRGB([bd.fill, bd.fill2, bd.fill3, bd.fill4][Math.max(2, Math.min(4, bd.gradStops || 2)) - 1] || bd.fill2 || bd.fill), 1], eg: 'Gradient end' },
            { sel: 'OneD:0', value: ft === 'radial' ? 2 : 1 }] });
        }
        // Gradient effects fill the whole layer; Set Matte puts the box's own shape back.
        gradFx.push({ match: 'ADBE Set Matte3', name: 'TL Keep shape', params: [{ sel: 'LAYER_INDEX:0', self: true }] });
        main.forEach((g) => { if (g.fill.eg === 'Backdrop colour') g.fill.eg = null; });
        if (bd.gradAnim && bd.gradAnim !== 'none') warn('Animated gradients are exported as still gradients.');
        if ((ft === 'linear' || ft === 'radial') && (bd.gradStops || 2) > 2) warn('After Effects’ Gradient Ramp has two colours: the gradient goes from colour 1 to the last colour.');
      }
      if (bd.texture && bd.texture.enabled) warn('Texture overlays are not exported.');

      CFG.L.backdrop = { ...base, name: null };
      if (main.length) {
        const name = uniqueName('Backdrop');
        nameOf.backdrop = name; CFG.L.backdrop.name = name;
        layers.push({ id: 'backdrop', name, kind: 'shape', groups: main, ...common('backdrop'), effects: [...fx, ...gradFx, ...(sh ? [sh] : []), ...blurEffect('backdrop', mayBlur(bd, 'backdrop'))] });
      }
      if (accent.length) {
        const name = uniqueName('Backdrop accent');
        if (!main.length) { nameOf.backdrop = name; CFG.L.backdrop.name = name; }
        // The accent layer reads its animation values from the main backdrop layer.
        const accShadow = sh && (s === 'twoTone' || !main.length) ? [sh] : [];
        layers.push({ id: 'backdropAccent', name, kind: 'shape', groups: accent, ...common('backdrop'), effects: [...(main.length ? [] : fx), ...accShadow, ...blurEffect('backdrop', mayBlur(bd, 'backdrop'))] });
      }
    }

    // Extra layers ----------------------------------------------------------------------------------
    function extraLayer(id, ly) {
      const prefix = `layers.${id}`;
      const eb = L.extras[id];
      if (!eb) return;
      if (ly.kind === 'text') {
        textLayer(id, ly, prefix, eb.line, { kind: 'text', name: ly.name || 'Text', label: ly.name || 'Text' });
        Object.assign(CFG.L[id], { kind: 'text', attach: ly.attach, ax: ly.ax ?? 0, ay: ly.ay ?? 0, x: ly.x || 0, y: ly.y || 0, textH: eb.h, ascent: eb.line.ascent });
        return;
      }
      const name = uniqueName(ly.name || (ly.kind === 'image' ? 'Logo' : 'Shape'));
      nameOf[id] = name;
      const vals = valuesFor(id, ly, prefix, { baseOpacity: ly.opacity ?? 1 });
      markHandled(prefix); handled.add(`${prefix}.opacity`);
      CFG.L[id] = { kind: ly.kind, name, anim: ly.anim, vals: vals.vals, keyed: vals.keyed, baseOpacity: ly.opacity ?? 1,
        attach: ly.attach, ax: ly.ax ?? 0, ay: ly.ay ?? 0, x: ly.x || 0, y: ly.y || 0, w: ly.kind === 'image' ? eb.w : ly.w || 0, h: ly.kind === 'image' ? eb.h : ly.h || 0,
        shape: ly.shape, radius: ly.radius || 0, imgW: 0, imgH: 0, maskShape: ly.mask && ly.mask.shape, bleed: Engine.bleed(ly) };
      const effects = [...vals.sliders.map(fxSlider)];
      if (ly.shadow && ly.shadow.on) effects.push(shadowFx('TL Shadow', ly.shadow));
      effects.push(...blurEffect(id, mayBlur(ly, prefix)));
      const base = { id, name, ...inOut(ly), props: transformProps(id), masks: masksFor(id, ly, { clip: hasClip(ly) }), effects, motionBlur: !!(st.comp.motionBlur && st.comp.motionBlur.enabled) };
      if (ly.kind === 'image') {
        if (!ly.src) return;
        images[id] = ly.src;
        layers.push({ ...base, kind: 'image', image: id, eg: [{ what: 'media', name }] });
        return;
      }
      const colKs = keys[`${prefix}.color`];
      if (colKs && colKs.length) handled.add(`${prefix}.color`);
      const color = colKs && colKs.length ? { value: hexRGB(colKs[0].v), keys: aeKeys(colKs.map((x) => ({ ...x })), fps, hexRGB) } : { value: hexRGB(ly.color) };
      const call = (w) => exprCall(`T.extraShape(${JSON.stringify(id)}, '${w}')`).expr;
      layers.push({ ...base, kind: 'shape', groups: [{
        name,
        items: [{ type: ly.shape === 'ellipse' ? 'ellipse' : 'rect', size: call('size'), pos: call('pos'), round: call('round') }],
        fill: { color, eg: `${name} colour` },
        stroke: ly.stroke && ly.stroke.on && ly.stroke.width > 0 ? { color: hexRGB(ly.stroke.color), width: ly.stroke.width } : null,
      }] });
    }

    // Build in stacking order (bottom → top) ---------------------------------------------------------
    for (const id of Engine.layerOrder(st)) {
      if (id === 'backdrop') backdropLayers();
      else if (id === 'title' || id === 'subtitle') {
        const ly = st[id];
        const line = L[id];
        if (ly.visible === false || line.empty) { CFG.L[id] = { kind: id, on: false, name: id, anim: ly.anim, vals: TR_DEFAULT }; continue; }
        textLayer(id, ly, id, line, { kind: id, name: id === 'title' ? 'Title' : 'Subtitle', label: id === 'title' ? 'Title' : 'Subtitle', clipToBox: ly.clipToBox && CFG.boxLayer !== null });
      } else {
        const ly = st.layers && st.layers[id];
        if (ly && ly.visible !== false) extraLayer(id, ly);
      }
    }
    // Text layers referenced by layout before they were built (e.g. hidden subtitle).
    for (const k of ['title', 'subtitle']) if (!CFG.L[k]) CFG.L[k] = { kind: k, on: false, name: k, anim: st[k].anim, vals: TR_DEFAULT };
    if (CFG.boxLayer && !CFG.L.backdrop) CFG.boxLayer = null;
    if (!CFG.boxLayer) CFG.L.backdrop = CFG.L.backdrop || { kind: 'backdrop', name: null, anim: bd.anim, vals: TR_DEFAULT };

    // Parenting (Engine parentChain): only between layers that made it into the comp.
    for (const id of Object.keys(CFG.L)) {
      const p = (Engine.getLayer(st, id) || {}).parent;
      if (p && CFG.L[p]) CFG.L[id].parent = p;
      else if (p) warn(`${id} is parented to a hidden layer; the parent link was left out.`);
    }

    // Fitted sizes: keep the export layout identical to the preview.
    if (fitted.title !== st.title && fitted.title.size !== st.title.size) warn('Auto-fit text is done with layer scale in After Effects.');

    // Keyframes we could not carry over.
    const skipped = Object.keys(keys).filter((p) => keys[p] && keys[p].length && !handled.has(p));
    if (skipped.length) warn(`These animated values were exported at their mid-hold value: ${skipped.join(', ')}.`);
    if (st.layout.align === 'justify') warn('Justified text keeps its letter spacing when edited; it won’t re-justify.');

    // Responsive time: protect the in and out animations so Premiere stretches only the hold.
    const spans = Engine.layerOrder(st).map((id) => Engine.getLayer(st, id)).filter((ly) => ly && ly.visible !== false).map((ly) => Engine.timingSpans(ly.anim, duration));
    const introEnd = Math.min(duration, Math.max(0, ...spans.map((s) => s.inEnd)));
    const outroStart = Math.max(0, Math.min(duration, ...spans.map((s) => s.outStart)));
    const markers = [];
    if (introEnd > 0 && introEnd < outroStart) markers.push({ t: 0, dur: introEnd, comment: 'Intro', protect: true });
    if (outroStart < duration && outroStart > introEnd) markers.push({ t: outroStart, dur: duration - outroStart, comment: 'Outro', protect: true });

    return {
      scene: {
        version: 1,
        name: doc.name || 'Lower third',
        width: W, height: H, fps, duration, holdTime: HT,
        motionBlur: st.comp.motionBlur && st.comp.motionBlur.enabled ? { shutter: st.comp.motionBlur.shutter, samples: st.comp.motionBlur.samples } : null,
        cfg: CFG,
        layers, markers, fonts, warnings,
      },
      images,
    };
  }

  global.Mogrt = { buildScene, tlrt, aeKeys, styleName, BEZ };
})(typeof window !== 'undefined' ? window : globalThis);
