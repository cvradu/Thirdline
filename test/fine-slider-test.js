// Shift-drag on a slider moves it at a tenth of the speed, with finer steps than the slider's own.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  const r = p.locator('input[type=range]:visible').first();
  const bb = await r.boundingBox();
  await r.evaluate((i) => { window.__last = null; i.addEventListener('input', () => { window.__last = +i.value; }); });
  const v0 = +(await r.inputValue());
  const y = bb.y + bb.height / 2, x0 = bb.x + bb.width * ((v0 - +(await r.getAttribute('min'))) / (+(await r.getAttribute('max')) - +(await r.getAttribute('min'))));
  await p.keyboard.down('Shift');
  await p.mouse.move(x0, y); await p.mouse.down(); await p.mouse.move(x0 + 50, y, { steps: 10 }); await p.mouse.up();
  await p.keyboard.up('Shift');
  const v1 = await p.evaluate(() => window.__last);
  const per = (+(await r.getAttribute('max')) - +(await r.getAttribute('min'))) / bb.width;
  const want = v0 + 50 * per / 10;
  console.log({ v0, v1, want, step: await r.getAttribute('step'), errs });
  console.log(Math.abs(v1 - want) < Math.max(0.2, per) && v1 !== v0 && (await r.getAttribute('step')) !== 'any' && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
