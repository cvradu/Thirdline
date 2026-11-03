// Idle loops: nothing moves before the In ends, the layer moves during the hold without jumps,
// and "together" keeps all layers in step.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  // Easy mode: pick Float for the whole design
  await p.locator('#easyRight select[title^="A gentle movement"]').selectOption('float');
  const r = await p.evaluate(() => {
    const s = window.__l3rd.state;
    const top = (t) => { const c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height; const g = c.getContext('2d', { willReadFrequently: true }); const st = JSON.parse(JSON.stringify(s)); st.backdrop.shadow.on = false; Engine.render(g, st, t); const d = g.getImageData(0, 0, c.width, c.height).data; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x += 3) if (d[(y * c.width + x) * 4 + 3] > 128) return y; return -1; };
    const sp = Engine.layerOrder(s).map((k) => Engine.timingSpans(Engine.getLayer(s, k).anim, s.comp.duration));
    const inEnd = Math.max(...sp.map((x) => x.inEnd)), outStart = Math.min(...sp.map((x) => x.outStart));
    const ys = []; for (let t = inEnd + 0.02; t < outStart; t += 1 / 30) ys.push(top(t));
    let maxStep = 0; for (let i = 1; i < ys.length; i++) maxStep = Math.max(maxStep, Math.abs(ys[i] - ys[i - 1]));
    return { types: ['backdrop', 'title', 'subtitle'].map((k) => s[k].anim.loop.type), range: Math.max(...ys) - Math.min(...ys), maxStep, rest: top(inEnd - 0.01) - top(inEnd + 0.02) };
  });
  console.log(r, errs);
  console.log(r.types.every((t) => t === 'float') && r.range >= 6 && r.maxStep <= 2 && Math.abs(r.rest) <= 1 && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
