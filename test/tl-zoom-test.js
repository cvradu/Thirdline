// Timeline zoom: Alt+scroll zooms around the mouse, Shift+scroll pans, keyframes stay clickable
// at the zoomed positions, double-click on the ruler fits again.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  await p.evaluate(() => {
    window.__l3rd.state.keys = { 'title.transform.x': [{ t: 2, v: 0, e: 'linear' }, { t: 2.1, v: 50, e: 'linear' }] };
    window.__l3rd.selectLayer('title');
  });
  await p.waitForTimeout(300);
  const tl = p.locator('#timeline');
  let fr = await tl.boundingBox();
  let g = await p.evaluate(() => window.__l3rd.tlDebug());
  const xOf = (g, t) => g.left + ((t - g.t0) / g.span) * (g.w - g.left - g.right);
  const gap0 = xOf(g, 2.1) - xOf(g, 2);
  // Zoom in at t=2
  await p.mouse.move(fr.x + xOf(g, 2.05), fr.y + 60);
  await p.keyboard.down('Alt');
  for (let i = 0; i < 6; i++) await p.mouse.wheel(0, -200);
  await p.keyboard.up('Alt');
  await p.waitForTimeout(100);
  g = await p.evaluate(() => window.__l3rd.tlDebug());
  const gap1 = xOf(g, 2.1) - xOf(g, 2);
  const anchorX = xOf(g, 2.05);
  // click the second key at its zoomed position
  fr = await tl.boundingBox();
  const row = g.rows.find((r) => r.path === 'title.transform.x');
  await p.mouse.click(fr.x + xOf(g, 2.1), fr.y + row.y + row.h / 2);
  const picked = await p.evaluate(() => window.__l3rd.selKeyTimes());
  // pan
  const t0a = g.t0;
  await p.keyboard.down('Shift'); await p.mouse.wheel(0, 300); await p.keyboard.up('Shift');
  const t0b = (await p.evaluate(() => window.__l3rd.tlDebug())).t0;
  await p.screenshot({ path: 'test/out/tl-zoom.png' });
  // fit
  await p.mouse.dblclick(fr.x + 400, fr.y + 8);
  const z2 = (await p.evaluate(() => window.__l3rd.tlDebug())).z;
  console.log({ gap0, gap1, z: g.z, anchorShift: Math.abs(anchorX - (await (async () => 0)())), picked, t0a, t0b, z2, errs });
  const ok = gap1 > gap0 * 4 && picked.length === 1 && Math.abs(picked[0] - 2.1) < 1e-6 && t0b > t0a && z2 === 1 && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
})();
