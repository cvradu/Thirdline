// 0.13: torn paper, track mattes, per-layer motion blur, controllers, parent tether, clean preview,
// resize handles, hand tool vs. tool rail, sub-pixel text in exports.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv'); await p.waitForTimeout(200);
  const res = await p.evaluate(() => {
    const out = {};
    const base = JSON.parse(JSON.stringify(window.__l3rd.state));
    const mk = (o) => Presets.newLayer('shape', { shape: 'rect', attach: 'frame', ax: 0, ay: 0, anim: { in: { type: 'none' }, out: { type: 'none' } }, ...o });
    const scene = (layers, extra = {}) => { const s = JSON.parse(JSON.stringify(base)); s.backdrop.type = 'none'; s.title.text = ''; s.subtitle.text = ''; s.layers = layers; s.order = ['backdrop', 'title', 'subtitle', ...Object.keys(layers)]; Object.assign(s, extra); return Presets.normalize(s); };
    const draw = (s, t = 3, opts = {}) => { const c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height; const g = c.getContext('2d', { willReadFrequently: true }); Engine.renderFrame(g, s, t, opts); return (x, y) => g.getImageData(x, y, 1, 1).data[3]; };
    const count = (s, x0, y0, x1, y1, t = 3) => { const c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height; const g = c.getContext('2d', { willReadFrequently: true }); Engine.renderFrame(g, s, t, {}); const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n; };
    // Torn paper: edges eaten away, interior kept, paper rim drawn in its colour.
    const plain = scene({ A: mk({ w: 400, h: 200, x: 400, y: 400, color: '#ff0000' }) });
    const torn = scene({ A: mk({ w: 400, h: 200, x: 400, y: 400, color: '#ff0000', torn: { on: true, amount: 20, size: 30, edge: 0, seed: 3 } }) });
    const nP = count(plain, 380, 380, 820, 620), nT = count(torn, 380, 380, 820, 620);
    out.torn = { plain: nP, torn: nT, interior: draw(torn)(600, 500), ok: nT < nP * 0.97 && nT > nP * 0.75 && draw(torn)(600, 500) === 255 };
    // Track matte: B shows only where A is; A itself is not drawn.
    const matte = scene({ A: mk({ w: 100, h: 100, x: 500, y: 500 }), B: mk({ w: 400, h: 400, x: 400, y: 400, matte: { src: 'A' } }) });
    const m = draw(matte);
    const inv = scene({ A: mk({ w: 100, h: 100, x: 500, y: 500 }), B: mk({ w: 400, h: 400, x: 400, y: 400, matte: { src: 'A', invert: true } }) });
    const mi = draw(inv);
    out.matte = { inside: m(550, 550), outside: m(450, 450), invInside: mi(550, 550), invOutside: mi(450, 450) };
    out.matte.ok = out.matte.inside === 255 && out.matte.outside === 0 && out.matte.invInside === 0 && out.matte.invOutside === 255;
    // Per-layer motion blur: a fast layer with its switch off stays sharp, the other blurs.
    const fast = (o) => mk({ w: 100, h: 100, y: 300, anim: { in: { type: 'slideLeft', duration: 0.5, delay: 0, easing: 'linear' }, out: { type: 'none' } }, ...o });
    const mbs = scene({ A: { ...fast({ x: 400 }), motionBlur: false }, B: fast({ x: 1200, y: 600 }) });
    mbs.layers.A.anim.distance = 600; mbs.layers.B.anim.distance = 600;
    mbs.comp.motionBlur = { enabled: true, shutter: 360, samples: 12, preview: true };
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d', { willReadFrequently: true });
    Engine.renderFrame(g, mbs, 0.25, { precise: true });
    const partial = (y) => { const d = g.getImageData(0, y, 1920, 1).data; let n = 0, half = 0; for (let x = 0; x < 1920; x++) { const a = d[x * 4 + 3]; if (a > 250) n++; else if (a > 5) half++; } return { solid: n, soft: half }; };
    out.mb = { sharp: partial(350), blurred: partial(650) };
    out.mb.ok = out.mb.sharp.soft <= 4 && out.mb.blurred.soft > 40;
    // Controller: never drawn; a layer parented to it follows its transform, and a child follows
    // its parent's In animation (tethered).
    const ctl = scene({ N: Object.assign(mk({ w: 80, h: 80, x: 900, y: 500 }), { kind: 'controller' }), A: mk({ w: 50, h: 50, x: 300, y: 300, parent: 'N' }) });
    ctl.layers.N.transform.x = 200;
    out.ctl = { nullDrawn: draw(ctl)(940, 540), childMoved: draw(ctl)(525, 325), childOld: draw(ctl)(325, 325) };
    out.ctl.ok = out.ctl.nullDrawn === 0 && out.ctl.childMoved === 255 && out.ctl.childOld === 0;
    const teth = scene({ P: mk({ w: 50, h: 50, x: 300, y: 300, anim: { in: { type: 'slideLeft', duration: 1, delay: 0, easing: 'linear' }, out: { type: 'none' }, distance: 300 } }), C: mk({ w: 50, h: 50, x: 800, y: 300, parent: 'P' }) });
    out.tether = { early: draw(teth, 0.5)(675, 325), late: draw(teth, 2)(825, 325) };
    out.tether.ok = out.tether.early === 255 && out.tether.late === 255 && draw(teth, 0.5)(825, 325) === 0;
    return out;
  });
  // Clean preview hides guides: the dashed selection box disappears.
  await p.evaluate(() => window.__l3rd.selectLayer('title')); await p.waitForTimeout(100);
  const guideAt = () => p.evaluate(() => { const L = window.__l3rd.rects().title, c = document.getElementById('preview'), g = c.getContext('2d'); const d = g.getImageData(Math.round(L.x - 3), Math.round(L.y - 25), 40, 30).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 120 && d[i + 2] < 60) n++; return n; });
  const before = await guideAt();
  await p.click('#btnClean'); await p.waitForTimeout(100);
  const clean = await guideAt();
  await p.keyboard.press('`'); await p.waitForTimeout(100);
  const back = await guideAt();
  res.clean = { before, clean, back, ok: before > 20 && clean === 0 && back > 20 };
  // Hand tool: the tool rail still works while it is active.
  await p.click('#toolRail [data-tool="hand"]');
  await p.click('#toolRail [data-tool="select"]');
  res.hand = { tool: await p.evaluate(() => window.__l3rd.tool()), ok: (await p.evaluate(() => window.__l3rd.tool())) === 'select' };
  // Resize handle: drag the right edge of a shape, its left edge stays.
  await p.evaluate(() => { const s = window.__l3rd.state; s.layers = { R: Presets.newLayer('shape', { shape: 'rect', w: 120, h: 120, attach: 'frame', ax: 0, ay: 0, x: 200, y: 200, anim: { in: { type: 'none' }, out: { type: 'none' } } }) }; s.order = [...Engine.layerOrder(s)]; window.__l3rd.render(); window.__l3rd.selectLayer('R'); });
  await p.waitForTimeout(150);
  const rr = await p.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return [r.left, r.top, r.width / window.__l3rd.state.comp.width]; });
  const X = rr[0] + 320 * rr[2], Y = rr[1] + 260 * rr[2];
  await p.mouse.move(X, Y); await p.mouse.down(); await p.mouse.move(X + 40, Y, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(100);
  const R = await p.evaluate(() => window.__l3rd.rects().R);
  res.resize = { R, ok: Math.abs(R.x - 200) < 1 && R.w > 180 };
  console.log(JSON.stringify(res, null, 1));
  console.log('errs', errs);
  const ok = Object.values(res).every((r) => r.ok) && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
