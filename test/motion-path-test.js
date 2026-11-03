// Motion path: drawn for a layer with position keyframes; dragging a keyframe square moves that key.
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
    const s = window.__l3rd.state;
    s.keys = {
      'title.transform.x': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: 300, e: 'linear' }],
      'title.transform.y': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: -200, e: 'linear' }],
    };
    window.__l3rd.selectLayer('title'); window.__l3rd.setTime(1.5);
  });
  await p.waitForTimeout(300);
  const mp = await p.evaluate(() => window.__l3rd.motionPath());
  const fr = await p.locator('#preview').boundingBox();
  const toScr = ([x, y]) => [fr.x + (x / 1920) * fr.width, fr.y + (y / 1080) * fr.height];
  const [sx, sy] = toScr(mp.keys[1].p);
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 50, sy + 25, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(150);
  const k = await p.evaluate(() => [window.__l3rd.state.keys['title.transform.x'][1].v, window.__l3rd.state.keys['title.transform.y'][1].v, window.__l3rd.state.title.transform.x]);
  const fr2 = await p.locator('#preview').boundingBox(); const scale = 1920 / fr2.width; console.log('fr', fr.width, fr2.width);
  await p.screenshot({ path: 'test/out/motion-path.png' });
  console.log({ n: mp.pts.length, keys: mp.keys.map((x) => x.p.map(Math.round)), k, errs });
  const ok = mp.pts.length > 20 && mp.keys.length === 2 && Math.abs(k[0] - (300 + 50 * scale)) < 3 && Math.abs(k[1] - (-200 + 25 * scale)) < 3 && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
})();
