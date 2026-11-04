// Checks the After Effects export without After Effects: builds the scene, evaluates every
// expression the way AE would (time, thisComp, textIndex…), draws the result on a canvas and
// compares it with Thirdline's own render, frame by frame. Also edits the text the way an editor
// would in Premiere and checks that the backdrop still wraps it.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(1000);
  if (process.env.DUMP) await p.evaluate((d) => { window.__dump = d; }, process.env.DUMP);
  const results = await p.evaluate(async () => {
    await document.fonts.ready;
    const base = window.__l3rd.state;
    const W = base.comp.width, H = base.comp.height;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d', { willReadFrequently: true }); };
    const engCtx = mk(), simCtx = mk(), mctx = mk();

    // Shadows, glows, gradients, textures, outlines and torn edges are AE effects/strokes this
    // simulator doesn't draw (mogrt-jsx-test checks they're emitted); compare geometry.
    const plain = (s) => {
      s = JSON.parse(JSON.stringify(s));
      s.backdrop.shadow.on = false; s.backdrop.fillType = 'solid'; s.backdrop.gradient = false; s.backdrop.texture.enabled = false;
      if (s.backdrop.stroke) s.backdrop.stroke.on = false;
      s.backdrop.fillOn = true;
      if (s.backdrop.torn) s.backdrop.torn.on = false;
      for (const k of ['title', 'subtitle']) { s[k].shadow.on = false; s[k].glow.on = false; s[k].stroke.on = false; }
      for (const ly of Object.values(s.layers || {})) { if (ly.shadow) ly.shadow.on = false; if (ly.glow) ly.glow.on = false; if (ly.stroke) ly.stroke.on = false; }
      return s;
    };

    function simulate(scene, t, texts) {
      const cfg = JSON.parse(JSON.stringify(scene.cfg));
      // AE's sourceRect width differs from canvas advance width; pretend it's 5px wider.
      const measure = (id, txt) => { const ly = Engine.getLayer(sceneState, id); mctx.save(); const m = Engine.measureLine(mctx, { ...ly, text: txt }); mctx.restore(); return m.width + 5; };
      const byName = {};
      for (const L of scene.layers) byName[L.name] = L;
      const textNow = {};
      for (const L of scene.layers) if (L.kind === 'text') {
        textNow[L.name] = texts && texts[L.id] !== undefined ? texts[L.id] : L.text.text;
        cfg.L[L.id].R0 = measure(L.id, L.text.text);
      }
      const evalKeys = (spec, tt) => {
        if (!spec.keys || !spec.keys.length) return spec.value;
        const ks = spec.keys;
        if (tt <= ks[0].t) return ks[0].v;
        if (tt >= ks[ks.length - 1].t) return ks[ks.length - 1].v;
        let i = 0; while (ks[i + 1].t <= tt) i++;
        const a = ks[i], b2 = ks[i + 1];
        if (a.hold) return a.v;
        const f = (tt - a.t) / (b2.t - a.t);
        return typeof a.v === 'number' ? a.v + (b2.v - a.v) * f : a.v;
      };
      const layerObj = (name) => {
        const L = byName[name];
        if (!L) throw new Error('no layer ' + name);
        return {
          text: { sourceText: { value: textNow[name] } },
          sourceRectAtTime: () => ({ width: measure(L.id, textNow[name]) }),
          effect: (fxName) => {
            const F = (L.effects || []).find((f) => f.name === fxName);
            if (!F) throw new Error('no effect');
            return () => ({ value: evalKeys(F.params[0], t) });
          },
        };
      };
      const cfgSrc = 'var TLC = ' + JSON.stringify(cfg) + ';\n';
      const fnCache = new Map();
      const run = (expr, extra = {}) => {
        let fn = fnCache.get(expr);
        if (!fn) {
          const lines = expr.split('\n'); lines[lines.length - 1] = 'return ' + lines[lines.length - 1];
          fn = new Function('time', 'thisComp', 'createPath', 'textIndex', 'textTotal', cfgSrc + lines.join('\n'));
          fnCache.set(expr, fn);
        }
        return fn(t, { layer: layerObj }, (pts, ins, outs, closed) => ({ pts, ins, outs, closed }), extra.textIndex, extra.textTotal);
      };
      const ctx = simCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      for (const L of scene.layers) {
        if (t < L.inPoint || t >= L.outPoint) continue;
        const prop = (m) => L.props.find((q) => q.path[1] === m);
        const pos = run(prop('ADBE Position').expr), sc = run(prop('ADBE Scale').expr), rot = run(prop('ADBE Rotate Z').expr), op = run(prop('ADBE Opacity').expr);
        if (op <= 0) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, op / 100);
        ctx.translate(pos[0], pos[1]); ctx.rotate((rot * Math.PI) / 180); ctx.scale(Math.max(1e-6, sc[0] / 100), Math.max(1e-6, sc[1] / 100));
        // masks (content space)
        let first = true;
        for (const M of L.masks || []) {
          const path = run(M.expr);
          const p2 = new Path2D();
          path.pts.forEach((pt, i) => {
            if (i === 0) { p2.moveTo(pt[0], pt[1]); return; }
            const prev = path.pts[i - 1], o = path.outs[i - 1], n = path.ins[i];
            p2.bezierCurveTo(prev[0] + o[0], prev[1] + o[1], pt[0] + n[0], pt[1] + n[1], pt[0], pt[1]);
          });
          const last = path.pts[path.pts.length - 1], o = path.outs[path.pts.length - 1], n = path.ins[0], p0 = path.pts[0];
          p2.bezierCurveTo(last[0] + o[0], last[1] + o[1], p0[0] + n[0], p0[1] + n[1], p0[0], p0[1]);
          if (M.mode === 'subtract' || (first && M.inverted)) { const q = new Path2D(); q.rect(-1e5, -1e5, 2e5, 2e5); q.addPath(p2); ctx.clip(q, 'evenodd'); }
          else ctx.clip(p2);
          first = false;
        }
        const blurFx = (L.effects || []).find((f) => f.name === 'TL Blur');
        if (blurFx) { const bl = run(blurFx.params[0].expr) / scene.cfg.BLURK; if (bl > 0.05) ctx.filter = `blur(${bl}px)`; }
        if (L.kind === 'shape') {
          for (const G of L.groups) {
            const shapes = [];
            let merge = false;
            for (const it of G.items) {
              if (it.type === 'merge') { merge = true; continue; }
              const pth = new Path2D();
              if (it.type === 'path') { const pp = run(it.path); pth.moveTo(...pp.pts[0]); pp.pts.slice(1).forEach((q) => pth.lineTo(...q)); pth.closePath(); }
              else {
                const sz = run(it.size), ps = run(it.pos), rd = it.type === 'rect' ? run(it.round) : 0;
                if (it.type === 'ellipse') pth.ellipse(ps[0], ps[1], sz[0] / 2, sz[1] / 2, 0, 0, Math.PI * 2);
                else pth.roundRect(ps[0] - sz[0] / 2, ps[1] - sz[1] / 2, sz[0], sz[1], Math.min(rd, sz[0] / 2, sz[1] / 2));
              }
              shapes.push(pth);
            }
            const col = evalKeys(G.fill.color, t);
            ctx.fillStyle = `rgb(${col[0] * 255},${col[1] * 255},${col[2] * 255})`;
            if (merge) { ctx.save(); ctx.clip(shapes[0]); ctx.fill(shapes[1]); ctx.restore(); }
            else shapes.forEach((s2) => ctx.fill(s2));
          }
        } else if (L.kind === 'text') {
          const f = scene.fonts[L.text.font];
          const txt0 = textNow[L.name];
          const txt = L.text.caps ? txt0.toUpperCase() : txt0;
          ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${L.text.size}px "${f.family}", sans-serif`;
          const anims = L.animators;
          const colA = anims.find((a) => a.name === 'TL colour');
          const col = evalKeys(colA.props['ADBE Text Fill Color'], t);
          ctx.fillStyle = `rgb(${col[0] * 255},${col[1] * 255},${col[2] * 255})`;
          let ls = (L.text.tracking / 1000) * L.text.size;
          const trA = anims.find((a) => a.name === 'TL tracking');
          if (trA) ls += (run(trA.props['ADBE Text Tracking Amount'].expr) / 1000) * L.text.size;
          ctx.letterSpacing = `${ls}px`;
          const per = anims.filter((a) => a.selector && a.selector.type === 'expr');
          // AE draws the line as a whole; per-letter drawing only matters while letters are animating.
          const busy = per.length && Array.from(txt).some((ch, i) => per.some((A) => run(A.selector.expr, { textIndex: i + 1, textTotal: txt.length }) !== 0));
          if (!busy) ctx.fillText(txt, 0, 0);
          else {
            const chars = Array.from(txt), n = chars.length;
            const wordIdx = []; let w = -1, inW = false;
            for (const ch of chars) { const sp = /\s/.test(ch); if (!sp && !inW) w++; inW = !sp; wordIdx.push(Math.max(0, w)); }
            let pre = '';
            chars.forEach((ch, i) => {
              const x = pre ? ctx.measureText(pre).width : 0; pre += ch;
              if (/\s/.test(ch)) return;
              let alpha = 1, dy = 0, s2 = 1, bl = 0;
              for (const A of per) {
                const words = A.selector.basedOn === 3;
                const amt = run(A.selector.expr, { textIndex: (words ? wordIdx[i] : i) + 1, textTotal: words ? w + 1 : n }) / 100;
                const pr = A.props;
                if ('ADBE Text Opacity' in pr) alpha *= 1 - amt;
                if ('ADBE Text Position 3D' in pr) dy += amt * pr['ADBE Text Position 3D'][1];
                if ('ADBE Text Scale 3D' in pr) s2 *= 1 - amt;
                if ('ADBE Text Blur' in pr) bl += amt * pr['ADBE Text Blur'][0] / scene.cfg.BLURK;
              }
              if (alpha <= 0.0001 || s2 <= 0.0001) return;
              ctx.save(); ctx.globalAlpha *= alpha;
              if (bl > 0.05) ctx.filter = `blur(${bl}px)`;
              const cw = ctx.measureText(ch).width;
              ctx.translate(x + cw / 2, dy - L.text.size * 0.35); ctx.scale(s2, s2); ctx.translate(-(x + cw / 2), -(-L.text.size * 0.35));
              ctx.fillText(ch, x, 0); ctx.restore();
            });
          }
        }
        ctx.restore();
      }
    }
    let sceneState = null;
    function compare(state, label, times, texts) {
      const st = plain(state);
      sceneState = st;
      const { scene } = Mogrt.buildScene(st, mctx, { name: label });
      const edited = JSON.parse(JSON.stringify(st));
      if (texts) for (const [k, v] of Object.entries(texts)) Engine.getLayer(edited, k).text = v;
      const out = [];
      for (const t of times) {
        Engine.render(engCtx, edited, t);
        simulate(scene, t, texts);
        const a = engCtx.getImageData(0, 0, W, H).data, b2 = simCtx.getImageData(0, 0, W, H).data;
        let diff = 0, area = 0, big = 0;
        for (let i = 3; i < a.length; i += 4) {
          const d = Math.abs(a[i] - b2[i]);
          diff += d; if (a[i] > 20 || b2[i] > 20) area++;
          if (d > 128) big++;
        }
        if (window.__dump && window.__dump === label + '@' + t) { window.__imgs = [engCtx.canvas.toDataURL(), simCtx.canvas.toDataURL()]; }
        out.push({ t: +t.toFixed(2), pct: area ? +((100 * diff) / 255 / area).toFixed(2) : 0, bigPx: big, area });
      }
      return { label, warnings: scene.warnings, frames: out };
    }

    const res = [];
    const D = base.comp.duration;
    const times = [0.15, 0.4, 0.6, 0.9, 1.3, 2.5, D - 0.5, D - 0.3, D - 0.1];
    for (let i = 0; i < Presets.BUILTIN.length; i++) res.push(compare(Presets.builtin(i), Presets.BUILTIN[i].name, times));
    // Text edited the way an editor would in Premiere.
    res.push(compare(Presets.builtin(0), 'Edited text', [2.5], { title: 'Dr. Ioana Mărgineanu-Teodorescu', subtitle: 'CEO' }));
    res.push(compare(Presets.builtin(1), 'Edited text (centered pill)', [2.5], { title: 'Jo', subtitle: 'A much longer subtitle than before' }));
    // Advanced: user keyframes, extra layers, a text animator, right anchor.
    const adv = Presets.builtin(0);
    adv.layout.hAnchor = 'right'; adv.layout.x = 1776; adv.layout.align = 'right';
    adv.keys = {
      'title.transform.x': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: 40, e: 'linear' }],
      'backdrop.transform.rotation': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: -4, e: 'linear' }],
      'backdrop.transform.scale': [{ t: 1, v: 100, e: 'linear' }, { t: 2, v: 110, e: 'linear' }],
    };
    adv.layers = { bar: Presets.newLayer('shape', { name: 'Bar' }), tag: Presets.newLayer('text', { name: 'Tag', text: 'LIVE', size: 22, y: -30 }) };
    adv.order = ['bar', 'backdrop', 'title', 'subtitle', 'tag'];
    res.push(compare(adv, 'Advanced (keys, extras, right anchor)', [0.5, 1.5, 2.5, D - 0.2]));
    // Anchor points and parenting: title follows a rotating, scaling backdrop pivoting on its corner.
    const par = Presets.builtin(3);
    par.backdrop.transform.anchorX = 0; par.backdrop.transform.anchorY = 100;
    par.title.parent = 'backdrop'; par.subtitle.parent = 'backdrop';
    par.title.transform.anchorX = 100; par.title.transform.rotation = 3;
    par.keys = {
      'backdrop.transform.rotation': [{ t: 1, v: 0, e: 'linear' }, { t: 2.5, v: -6, e: 'linear' }],
      'backdrop.transform.scale': [{ t: 1, v: 100, e: 'linear' }, { t: 2.5, v: 115, e: 'linear' }],
      'backdrop.transform.x': [{ t: 1, v: 0, e: 'linear' }, { t: 2.5, v: 60, e: 'linear' }],
    };
    par.backdrop.anim.in.type = 'scale';
    res.push(compare(par, 'Anchor + parenting', [0.45, 0.6, 1.5, 2.5, D - 0.2]));
    // A group holding the title and subtitle, moved and scaled.
    const grp = Presets.builtin(0);
    const gl = Presets.newLayer('shape', { name: 'Group 1' }); gl.kind = 'group'; gl.anim.in.type = 'none'; gl.anim.out.type = 'none';
    gl.transform.x = 60; gl.transform.y = -30; gl.transform.scale = 110;
    grp.layers = { g1: gl }; grp.order = ['backdrop', 'title', 'subtitle', 'g1'];
    grp.title.parent = 'g1'; grp.subtitle.parent = 'g1';
    res.push(compare(grp, 'Group (moved + scaled)', [1.3, 2.5]));
    return res;
  });
  if (process.env.DUMP) { const imgs = await p.evaluate(() => window.__imgs); if (imgs) imgs.forEach((d, i) => require('fs').writeFileSync(`${process.env.DUMPDIR || '.'}/dump-${i}.png`, Buffer.from(d.split(',')[1], 'base64'))); }
  let worst = 0;
  for (const r of results) {
    const w = Math.max(...r.frames.map((f) => f.pct));
    worst = Math.max(worst, w);
    console.log(`${w < 2 ? 'ok  ' : 'BAD '} ${r.label.padEnd(40)} worst ${w}%  ` + r.frames.map((f) => `${f.t}:${f.pct}(${f.area})`).join(' '));
    if (r.warnings.length) console.log('      notes:', r.warnings.join(' | '));
  }
  console.log('errors:', errs);
  console.log(worst < 2 && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
