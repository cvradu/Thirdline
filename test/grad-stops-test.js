// Gradient colours: Easy and Advanced show a picker for every colour (2–4 for linear/radial,
// 4 corners for 4-point), and a 3-colour linear gradient really passes through colour 2.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1400 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  const labels = (root) => p.locator(`${root} .row:visible`).evaluateAll((rs) => rs.filter((r) => r.querySelector('input[type=color]')).map((r) => r.querySelector('label').textContent.replace(/[◆⌖]/g, '').trim()));
  await p.locator('#easyRight details.more').last().evaluate((d) => { d.open = true; });
  const fillSel = p.locator('#easyRight .row:visible', { hasText: 'Fill' }).locator('select').first();
  await fillSel.selectOption('linear');
  await p.locator('#easyRight .row:visible', { hasText: 'Colours' }).locator('select').selectOption('3');
  const easyLin = await labels('#easyRight');
  await fillSel.selectOption('fourPoint');
  const easy4 = await labels('#easyRight');
  // Advanced
  await p.click('#modeAdv');
  await p.evaluate(() => window.__l3rd.selectLayer('backdrop'));
  await p.waitForTimeout(300);
  const adv = '#inspector > div:not([hidden])';
  await p.locator(`${adv} .row:visible`, { hasText: 'Fill' }).locator('select').first().selectOption('linear');
  await p.locator(`${adv} .row:visible`, { hasText: 'Colours' }).locator('select').selectOption('4');
  const advLin = (await labels('#inspector > div:not([hidden])')).filter((l) => /^Colour \d/.test(l));
  // set colour 3 via its picker
  const c3 = p.locator('#inspector > div:not([hidden]) .row:visible', { hasText: 'Colour 3' }).locator('input[type=color]').first();
  await c3.evaluate((i) => { i.value = '#00ff00'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  const fill3 = await p.evaluate(() => window.__l3rd.state.backdrop.fill3);
  // Render: 3 colours red → green → blue, middle of the box should be green
  const mid = await p.evaluate(() => {
    const s = JSON.parse(JSON.stringify(window.__l3rd.state));
    Object.assign(s.backdrop, { fillType: 'linear', gradStops: 3, fill: '#ff0000', fill2: '#00ff00', fill3: '#0000ff', gradientAngle: 0, gradAnim: 'none', shape: 'rect', opacity: 1, texture: { ...s.backdrop.texture, enabled: false } });
    s.backdrop.shadow.on = false; s.title.visible = false; s.subtitle.visible = false; s.keys = {};
    const c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    const L = Engine.render(g, s, 3);
    const px = (fx) => Array.from(g.getImageData(Math.round(L.box.x + L.box.w * fx), Math.round(L.box.y + L.box.h / 2), 1, 1).data.slice(0, 3));
    return [px(0.03), px(0.5), px(0.97)];
  });
  const midOk = mid[0][0] > 200 && mid[1][1] > 200 && mid[1][0] < 60 && mid[2][2] > 200;
  console.log({ easyLin, easy4, advLin, fill3, mid, errs });
  const ok = easyLin.join() === 'Colour 1,Colour 2,Colour 3' && easy4.join() === 'Top left,Top right,Bottom right,Bottom left'
    && advLin.join() === 'Colour 1,Colour 2,Colour 3,Colour 4' && fill3 === '#00ff00' && midOk && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
})();
