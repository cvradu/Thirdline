// Keyframes: Shift+click adds to the selection, box-drag selects several, dragging moves them all,
// Delete removes them all, and the easing picker applies to all.
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
      'title.transform.x': [{ t: 1, v: 0, e: 'easeInOutCubic' }, { t: 2, v: 50, e: 'easeInOutCubic' }],
      'title.transform.rotation': [{ t: 1, v: 0, e: 'easeInOutCubic' }, { t: 2.5, v: 10, e: 'easeInOutCubic' }],
    };
    window.__l3rd.selectLayer('title');
    window.__l3rd.render();
  });
  await p.waitForTimeout(300);
  const tl = p.locator('#timeline');
  // Geometry from the app: rows and time→x
  const geo = () => p.evaluate(() => window.__l3rd.tlDebug());
  let g = await geo();
  let fr = await tl.boundingBox();
  const at = (path, t) => { const r = g.rows.find((r) => r.path === path); return [fr.x + g.x(t), fr.y + r.y + r.h / 2]; };
  g.x = (t) => g.left + (t / g.span) * (g.w - g.left - g.right);
  // click first, shift-click second
  let [x, y] = at('title.transform.x', 2); await p.mouse.click(x, y);
  [x, y] = at('title.transform.rotation', 2.5);
  await p.keyboard.down('Shift'); await p.mouse.click(x, y); await p.keyboard.up('Shift');
  const n1 = await p.evaluate(() => window.__l3rd.selKeyCount());
  // drag the first one +0.5s: both move
  [x, y] = at('title.transform.x', 2);
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + (g.x(2.5) - g.x(2)), y, { steps: 6 }); await p.mouse.up();
  const k1 = await p.evaluate(() => JSON.parse(JSON.stringify(window.__l3rd.state.keys)));
  const moved = Math.abs(k1['title.transform.x'][1].t - 2.5) < 0.05 && Math.abs(k1['title.transform.rotation'][1].t - 3) < 0.05 && k1['title.transform.x'][0].t === 1;
  fr = await tl.boundingBox(); // the key bar may have shifted the timeline
  // box select the two keys at t=1 (start in empty space at t≈0.6 on the x row, drag to t≈1.3 on the rotation row)
  const [bx0, by0] = at('title.transform.x', 0.6); const [bx1, by1] = at('title.transform.rotation', 1.3);
  await p.mouse.move(bx0, by0 - 5); await p.mouse.down(); await p.mouse.move(bx1, by1 + 5, { steps: 6 }); await p.mouse.up();
  const n2 = await p.evaluate(() => window.__l3rd.selKeyCount());
  const boxT = await p.evaluate(() => window.__l3rd.selKeyTimes());
  // easing applies to both
  await p.selectOption('#kbEase', 'linear');
  const k2 = await p.evaluate(() => JSON.parse(JSON.stringify(window.__l3rd.state.keys)));
  const eased = k2['title.transform.x'][0].e === 'linear' && k2['title.transform.rotation'][0].e === 'linear' && k2['title.transform.x'][1].e !== 'linear';
  // delete both
  await p.keyboard.press('Delete');
  const k3 = await p.evaluate(() => JSON.parse(JSON.stringify(window.__l3rd.state.keys)));
  const deleted = k3['title.transform.x'].length === 1 && k3['title.transform.rotation'].length === 1 && k3['title.transform.x'][0].t > 2;
  await p.screenshot({ path: 'test/out/multikey.png' });
  console.log({ n1, moved, n2, boxT, eased, deleted, k1, errs });
  console.log(n1 === 2 && moved && n2 === 2 && eased && deleted && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
