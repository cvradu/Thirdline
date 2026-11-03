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
  await p.evaluate(() => window.__l3rd.setTime(0.5));
  await p.locator('[data-pane=anim-title] select').filter({ has: p.locator('option[value=rise]') }).selectOption('rise');
  await p.click('.layer-chips button[data-layer=subtitle]');
  await p.locator('[data-pane=anim-subtitle] select').filter({ has: p.locator('option[value=sweep]') }).selectOption('sweep');
  await p.click('.layer-chips button[data-layer=backdrop]');
  await p.locator('[data-pane=anim-backdrop] button', { hasText: 'Iris reveal' }).click();
  await p.waitForTimeout(300);
  console.log(Object.keys(await p.evaluate(() => window.__l3rd.state.keys)).join(', '));
  for (const t of [0.7, 0.9, 1.1, 1.6]) {
    await p.evaluate((t) => window.__l3rd.setTime(t), t);
    await p.locator('#frame').screenshot({ path: `an-${t}.png` });
  }
  await p.evaluate(() => window.__l3rd.setTime(0.9));
  await p.click('.layer-chips button[data-layer=title]');
  await p.screenshot({ path: 'an-ui.png' });
  // delete animator and check keys renumber
  await p.locator('[data-pane=anim-title] .animator-head button').first().click();
  console.log('after delete:', Object.keys(await p.evaluate(() => window.__l3rd.state.keys)).join(', '));
  console.log('errors', errs);
  await b.close();
})();
