// Advanced timeline: dragging the end handle on the ruler changes the length.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  await p.waitForTimeout(200);
  const tl = await p.locator('#timeline').boundingBox();
  const D0 = await p.evaluate(() => window.__l3rd.state.comp.duration);
  const left = await p.evaluate(() => (window.__l3rd.tlLeft ? window.__l3rd.tlLeft() : 150));
  const xEnd = tl.x + left + (1 / 1.15) * (tl.width - left - 16);
  await p.mouse.move(xEnd, tl.y + 10); await p.mouse.down();
  await p.mouse.move(xEnd + 60, tl.y + 10, { steps: 6 }); await p.mouse.up();
  const D1 = await p.evaluate(() => window.__l3rd.state.comp.duration);
  await p.mouse.move(xEnd, tl.y + 10); await p.mouse.down();
  await p.mouse.move(xEnd - 150, tl.y + 10, { steps: 6 }); await p.mouse.up();
  const D2 = await p.evaluate(() => window.__l3rd.state.comp.duration);
  await p.locator('#timeline').screenshot({ path: process.argv[2] || 'end-handle.png' });
  console.log({ D0, D1, D2, errs });
  console.log(D1 > D0 && D2 < D1 && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
