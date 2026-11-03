const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(1000);
  await p.click('#modeAdv'); await p.waitForTimeout(300);
  const box = await p.locator('#preview').boundingBox();
  const L = await p.evaluate(() => { const s = window.__l3rd.state; return null; });
  // click on subtitle: compute from layout
  const pt = await p.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    const L = Engine.computeLayout(c, window.__l3rd.state);
    return { sub: [L.subtitle.x + 20, L.subtitle.top + 10], bd: [L.box.x + L.box.w - 10, L.box.y + 5], W: window.__l3rd.state.comp.width, H: window.__l3rd.state.comp.height };
  });
  const click = async ([x, y]) => p.mouse.click(box.x + (x / pt.W) * box.width, box.y + (y / pt.H) * box.height);
  await click(pt.sub);
  await p.waitForTimeout(600);
  console.log('after sub click: inspector', await p.locator('#inspector > div:not([hidden]) .insp-head').textContent(), 'layer row', await p.locator('.layer-row.on').textContent());
  await p.screenshot({ path: 'sel-sub.png' });
  await click(pt.bd);
  await p.waitForTimeout(400);
  console.log('after bd click: inspector', await p.locator('#inspector > div:not([hidden]) .insp-head').textContent());
  await p.evaluate(() => { const s = window.__l3rd.state; s.layout.align = 'justify'; s.backdrop.minWidth = 760; window.__l3rd.replaceState(s); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'sel-justify.png' });
  console.log('errors', errs);
  await b.close();
})();
