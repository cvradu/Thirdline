// Anchor point: moving it keeps the layer in place (pan-behind), scaling pivots on it, and the
// preset "scale" animation grows from it.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv'); await p.evaluate(() => { document.querySelector('#inspector').dataset.tab = 'all'; });
  await p.evaluate(() => { window.__l3rd.selectLayer('backdrop'); window.__l3rd.setTime(3); });
  await p.waitForTimeout(200);
  const bbox = () => p.evaluate(() => {
    const s = window.__l3rd.state, c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const only = JSON.parse(JSON.stringify(s)); only.title.visible = false; only.subtitle.visible = false; only.backdrop.shadow.on = false;
    Engine.render(ctx, only, window.__t ?? 3);
    const d = ctx.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  });
  await p.evaluate(() => { window.__l3rd.state.backdrop.transform.scale = 150; window.__l3rd.state.backdrop.transform.rotation = 10; window.__l3rd.render(); });
  const before = await bbox();
  // 9-point picker: top-left
  const cells = p.locator('.anchor9 button');
  console.log('picker cells', await cells.count());
  await cells.first().click();
  const tr = await p.evaluate(() => window.__l3rd.state.backdrop.transform);
  const after = await bbox();
  console.log({ before, after, anchor: [tr.anchorX, tr.anchorY], pos: [tr.x, tr.y] });
  const still = before.every((v, i) => Math.abs(v - after[i]) <= 2);
  // scale up now pivots on the top-left corner
  await p.evaluate(() => { const t = window.__l3rd.state.backdrop.transform; t.rotation = 0; t.x = 0; t.y = 0; t.scale = 100; });
  const s100 = await bbox();
  await p.evaluate(() => { window.__l3rd.state.backdrop.transform.scale = 130; });
  const s130 = await bbox();
  const pivotOk = Math.abs(s100[0] - s130[0]) <= 1 && Math.abs(s100[1] - s130[1]) <= 1 && s130[2] > s100[2] + 20;
  // preset "scale" animation grows from the anchor too
  await p.evaluate(() => { const s = window.__l3rd.state; s.backdrop.transform.scale = 100; s.backdrop.anim.in = { ...s.backdrop.anim.in, type: 'scale', delay: 0, duration: 1 }; window.__t = 0.5; });
  const mid = await bbox();
  const presetOk = Math.abs(mid[0] - s100[0]) <= 1 && Math.abs(mid[1] - s100[1]) <= 1 && mid[2] < s100[2] - 20;
  // anchor marker drag on the preview
  await p.evaluate(() => { window.__t = 3; window.__l3rd.setTime(3); });
  console.log({ still, pivotOk, presetOk, s100, s130, mid, errs });
  console.log(still && pivotOk && presetOk && !errs.length ? 'PASS' : 'FAIL');
  await p.locator('#frame').screenshot({ path: process.argv[2] || 'anchor.png' });
  await b.close();
})();
