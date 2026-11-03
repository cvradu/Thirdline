// Engine: extra layers (text/shape/image), z-order, text stroke/glow, auto-fit.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    const s = Presets.defaultState();
    s.layers = {
      bar: Presets.newLayer('shape'),
      tag: Presets.newLayer('text', { text: 'LIVE', color: '#ef4444', size: 22, weight: 700 }),
      dot: Presets.newLayer('shape', { shape: 'ellipse', w: 40, h: 40, ax: 1, ay: 0.5, x: 60, color: '#22c55e' }),
    };
    s.order = ['bar', 'backdrop', 'title', 'subtitle', 'tag', 'dot'];
    s.title.stroke.on = true; s.title.stroke.width = 3; s.title.stroke.color = '#ef4444';
    s.subtitle.glow.on = true;
    s.title.text = 'A really very long name that will not fit in the box at all';
    s.title.fitWidth = 700;
    const n = Presets.normalize(JSON.parse(JSON.stringify(s)));
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    const L = Engine.render(c.getContext('2d'), n, 3, {});
    window.__shot = c.toDataURL();
    const px = (x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
    const bar = L.layers.bar, dot = L.layers.dot;
    return { order: L.order, bar, dot, tag: L.layers.tag, titleW: L.title.width, barPx: px(Math.round(bar.x + bar.w / 2), Math.round(bar.y + bar.h / 2)), dotPx: px(Math.round(dot.x + dot.w / 2), Math.round(dot.y + dot.h / 2)),
      hit: Engine.hitTest(L, dot.x + 20, dot.y + 20), hitBar: Engine.hitTest(L, bar.x + 4, bar.y + 10) };
  });
  console.log(JSON.stringify(r));
  const data = await p.evaluate(() => window.__shot);
  require('fs').writeFileSync(process.env.SHOT || 'layers.png', Buffer.from(data.split(',')[1], 'base64'));
  console.log('errors', errs); await b.close();
})();
