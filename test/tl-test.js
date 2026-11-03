const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  const box = await p.locator('#timeline').boundingBox();
  const geo = await p.evaluate(() => { const s = window.__l3rd.state; return { D: s.comp.duration, a: s.title.anim }; });
  const W = box.width, L = 86, R = 16;
  const sx = (t) => box.x + L + (t / geo.D) * (W - L - R);
  const y = box.y + 22 + 6 + 28 * 1 + 10; // title row
  const inMid = sx(geo.a.in.delay + geo.a.in.duration * 0.6);
  const before = JSON.stringify(geo.a.in);
  await p.mouse.move(inMid, y); await p.mouse.down(); await p.mouse.move(inMid + 60, y, { steps: 5 }); await p.mouse.up();
  const after1 = await p.evaluate(() => JSON.stringify(window.__l3rd.state.title.anim.in));
  const x0 = sx(geo.a.in.delay);
  await p.mouse.move(x0, y); await p.mouse.down(); await p.mouse.move(x0 + 30, y, { steps: 5 }); await p.mouse.up();
  const after2 = await p.evaluate(() => JSON.stringify(window.__l3rd.state.title.anim.in));
  console.log(before, '\n', after1, '\n', after2);
  await p.locator('#timeline').screenshot({ path: 'tl.png' });
  console.log('errors', errs); await b.close();
})();
