const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  await p.check('#optAdvanced');
  await p.click('.layer-chips button[data-layer=title]');
  // keyframe rotation and scale
  await p.evaluate(() => window.__l3rd.setTime(1.5));
  const rotRow = p.locator('[data-pane=anim-title] .row', { hasText: 'Rotation' });
  await rotRow.locator('.kf').click();
  await p.evaluate(() => window.__l3rd.setTime(3));
  await rotRow.locator('input[type=number]').fill('-8');
  const scRow = p.locator('[data-pane=anim-title] .row', { hasText: 'Scale' }).first();
  await scRow.locator('input[type=number]').fill('130');
  await scRow.locator('.kf').click(); // now keyed at 3s with 130? (toggle adds key with current value)
  await p.evaluate(() => window.__l3rd.setTime(4.5));
  await scRow.locator('input[type=number]').fill('100');
  await p.waitForTimeout(300);
  console.log(JSON.stringify(await p.evaluate(() => window.__l3rd.state.keys)));
  await p.evaluate(() => window.__l3rd.setTime(3.2));
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'kf.png' });
  console.log('errors', errs);
  await b.close();
})();
