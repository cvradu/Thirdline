// Vertical / square versions: the design stays whole, inside the frame margins, in the same corner.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  const res = await p.evaluate(async () => {
    await document.fonts.ready;
    const out = [];
    for (let i = 0; i < Presets.BUILTIN.length; i++) {
      const st = Presets.builtin(i); st.ui.pos = i % 2 ? 'br' : 'bl';
      for (const [w, h] of [[1080, 1920], [1080, 1080]]) {
        const v = window.__l3rd.variantState(st, w, h);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true });
        Engine.render(g, v, 3);
        const d = g.getImageData(0, 0, w, h).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        out.push({ name: Presets.BUILTIN[i].name, w, h, ds: v.comp.designScale, box: [x0, y0, x1, y1], pos: st.ui.pos });
      }
    }
    return out;
  });
  let ok = !errs.length;
  for (const r of res) {
    const [x0, y0, x1, y1] = r.box;
    const inside = x0 >= r.w * 0.02 && x1 <= r.w * 0.98 && y0 >= 0 && y1 <= r.h * (r.h > r.w ? 0.86 : 0.97) && x1 > x0;
    const side = r.pos === 'bl' ? x0 < r.w * 0.2 : x1 > r.w * 0.8;
    const lower = y1 > r.h * 0.5;
    if (!(inside && side && lower)) ok = false;
    console.log(`${inside && side && lower ? 'ok ' : 'BAD'} ${r.name.padEnd(26)} ${r.w}x${r.h} ds=${r.ds} box=${r.box.join(',')}`);
  }
  // Export dialog thumbnails
  await p.evaluate(() => document.querySelector('#exportDialog').showModal());
  await p.check('#varVertical'); await p.check('#varSquare');
  await p.waitForTimeout(300);
  const thumbs = await p.locator('#varThumbs img').count();
  await p.locator('dialog[open]').screenshot({ path: 'test/out/variants.png' });
  console.log({ thumbs, errs });
  console.log(ok && thumbs === 2 ? 'PASS' : 'FAIL');
  await b.close();
})();
