const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: process.argv[2] || 'shot.png' });
  // walk all presets at hold frame
  const n = await p.evaluate(() => Presets.BUILTIN.length);
  for (let i = 0; i < n; i++) {
    await p.click(`.st:nth-child(${i + 1})`);
    await p.waitForTimeout(300);
    await p.locator('#frame').screenshot({ path: `preset-${i}.png` });
  }
  // frames through time for default
  await p.click('.st:nth-child(1)');
  for (const t of [0.2, 0.5, 0.8, 1.2, 5.6, 5.85]) {
    await p.evaluate((t) => window.__l3rd.setTime(t), t);
    await p.locator('#frame').screenshot({ path: `t-${t}.png` });
  }
  console.log('errors:', errs);
  await b.close();
})();
