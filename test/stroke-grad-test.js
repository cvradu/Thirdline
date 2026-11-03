// 0.13.4: backdrop/shape stroke + fill toggle, text gradients, parent tether before a parent's In starts.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  const res = await p.evaluate(() => {
    const out = {};
    const base = JSON.parse(JSON.stringify(window.__l3rd.state));
    const draw = (s, t = 2.5) => { const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d', { willReadFrequently: true }); Engine.renderFrame(g, s, t, { precise: true }); return (x, y) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data); };
    const mk = (o) => Presets.newLayer('shape', { shape: 'rect', attach: 'frame', ax: 0, ay: 0, w: 400, h: 200, x: 400, y: 400, color: '#ff0000', anim: { in: { type: 'none' }, out: { type: 'none' } }, ...o });
    const scene = (layers) => { const s = JSON.parse(JSON.stringify(base)); s.backdrop.type = 'none'; s.title.text = ''; s.subtitle.text = ''; s.layers = layers; s.order = ['backdrop', 'title', 'subtitle', ...Object.keys(layers)]; return Presets.normalize(s); };
    // Shape: stroke only (no fill) -> edge is stroke colour, centre transparent.
    const sh = draw(scene({ A: mk({ fill: false, stroke: { on: true, width: 10, color: '#00ff00' } }) }));
    out.shape = { edge: sh(400, 500), centre: sh(600, 500) };
    out.shape.ok = out.shape.edge[1] > 200 && out.shape.edge[0] < 50 && out.shape.centre[3] === 0;
    const sh2 = draw(scene({ A: mk({ stroke: { on: true, width: 10, color: '#00ff00' } }) }));
    out.shape2 = { edge: sh2(400, 500), centre: sh2(600, 500) }; out.shape2.ok = out.shape2.edge[1] > 200 && out.shape2.centre[0] > 200;
    // Backdrop: stroke + fill off.
    const s = Presets.normalize(JSON.parse(JSON.stringify(base)));
    s.backdrop.shape = 'rect'; s.backdrop.fillOn = false; s.backdrop.stroke = { on: true, width: 8, color: '#00ff00' }; s.backdrop.shadow.on = false; s.backdrop.texture.enabled = false; s.backdrop.opacity = 1;
    const L2 = Engine.layoutAt(document.createElement('canvas').getContext('2d'), s), bb = L2.box;
    const bd = draw(s);
    out.bd = { edge: bd(bb.x, bb.y + bb.h / 2), box: bb }; out.bd.ok = out.bd.edge[1] > 200 && out.bd.edge[0] < 60;
    // Text gradient: left vs right of the title differ in colour.
    const tg = Presets.normalize(JSON.parse(JSON.stringify(base)));
    tg.backdrop.type = 'none'; tg.subtitle.text = ''; tg.title.text = 'MMMMMMMMMM'; tg.title.color = '#ff0000'; tg.title.color2 = '#0000ff'; tg.title.fillType = 'linear'; tg.title.gradAngle = 0; tg.title.anim.in.type = 'none'; tg.title.anim.out.type = 'none';
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d', { willReadFrequently: true }); Engine.renderFrame(g, tg, 2.5, {});
    const d = g.getImageData(0, 0, 1920, 1080).data; let minX = 1e9, maxX = -1, lr = null, rr = null;
    for (let y = 0; y < 1080; y += 2) for (let x = 0; x < 1920; x++) { const i = (y * 1920 + x) * 4; if (d[i + 3] > 250) { if (x < minX) { minX = x; lr = [d[i], d[i + 2]]; } if (x > maxX) { maxX = x; rr = [d[i], d[i + 2]]; } } }
    out.grad = { lr, rr }; out.grad.ok = lr && rr && lr[0] > lr[1] && rr[1] > rr[0];
    // Tether before a parent's In starts: no throw.
    const tt = Presets.normalize(JSON.parse(JSON.stringify(base)));
    tt.backdrop.anim.in.delay = 0.5; tt.title.parent = 'backdrop'; tt.subtitle.parent = 'title';
    try { for (let t = 0; t < 1; t += 0.1) Engine.renderFrame(g, tt, t, { precise: true }); tt.backdrop.anim.out.offset = 0.5; Engine.renderFrame(g, tt, tt.comp.duration - 0.1, { precise: true }); out.tether = { ok: true }; } catch (e) { out.tether = { ok: false, e: e.message }; }
    return out;
  });
  console.log(JSON.stringify(res));
  const ok = Object.values(res).every((r) => r.ok) && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL', errs);
  await b.close(); process.exit(ok ? 0 : 1);
})();
