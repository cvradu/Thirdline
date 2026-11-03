const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  const shots = [];
  for (let i = 0; i < 7; i++) {
    await p.evaluate((i) => { const s = window.__l3rd.state; s.backdrop.shape = 'rounded'; s.backdrop.opacity = 1; Object.assign(s.backdrop, Presets.GRADIENTS[i].patch); window.__l3rd.replaceState(s); window.__l3rd.setTime(2 + i * 0.37); }, i);
    await p.waitForTimeout(150);
    await p.locator('#frame').screenshot({ path: `g${i}.png` });
  }
  // texture
  await p.click('#modeAdv'); await p.click('.layer-row[data-layer=backdrop]'); await p.evaluate(() => document.querySelectorAll('#inspector .section.collapsed').forEach((x) => x.classList.remove('collapsed')));
  await p.selectOption('#inspector .row:has-text("Fill") select >> nth=0', 'linear').catch((e) => errs.push('sel ' + e.message));
  const sel = p.locator('#inspector select').filter({ has: p.locator('option[value=halftone]') });
  await sel.selectOption('halftone');
  await p.waitForTimeout(300);
  await p.evaluate(() => { const s = window.__l3rd.state; s.backdrop.texture.blend = 'soft-light'; s.backdrop.texture.opacity = 0.8; window.__l3rd.replaceState(s); window.__l3rd.setTime(3); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'tex.png' });
  console.log('errors', errs);
  await b.close();
})();
