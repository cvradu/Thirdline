// Copy/paste/duplicate for keyframes and layers; Shift-click multi-select; align and distribute.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 940 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const S = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__l3rd.state)));
  // --- keyframes: copy two keys from title.x, paste at 4s
  await p.evaluate(() => {
    window.__l3rd.state.keys = { 'title.transform.x': [{ t: 1, v: 0, e: 'linear' }, { t: 1.5, v: 80, e: 'easeOutCubic' }] };
    window.__l3rd.selectLayer('title'); window.__l3rd.render();
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__l3rd.selectAllKeysOf('title.transform.x'));
  await p.keyboard.press(`${mod}+c`);
  await p.evaluate(() => window.__l3rd.setTime(4));
  await p.keyboard.press(`${mod}+v`);
  let s = await S();
  const pastedKeys = s.keys['title.transform.x'].map((k) => [k.t, k.v, k.e]);
  // paste onto the subtitle (same property, other layer)
  await p.evaluate(() => { window.__l3rd.selectLayer('subtitle'); window.__l3rd.setTime(2); });
  await p.keyboard.press(`${mod}+v`);
  s = await S();
  const subKeys = (s.keys['subtitle.transform.x'] || []).map((k) => [k.t, k.v]);
  // --- layers: copy the title → becomes a text layer; duplicate it with Cmd+D
  await p.evaluate(() => window.__l3rd.selectLayer('title'));
  await p.keyboard.press('Escape'); await p.evaluate(() => window.__l3rd.selectLayer('title'));
  await p.keyboard.press(`${mod}+c`);
  await p.keyboard.press(`${mod}+v`);
  s = await S();
  const copies = Object.values(s.layers || {}).filter((l) => l.kind === 'text');
  const copyKeys = Object.keys(s.keys).filter((k) => k.startsWith('layers.'));
  await p.keyboard.press(`${mod}+d`);
  s = await S();
  const copies2 = Object.values(s.layers || {}).filter((l) => l.kind === 'text').length;
  // --- align: title + subtitle + backdrop, align left edges to each other
  await p.evaluate(() => {
    const st = JSON.parse(JSON.stringify(window.__l3rd.state)); st.keys = {}; st.layers = {}; st.order = ['backdrop', 'title', 'subtitle'];
    st.title.transform.x = 40; st.subtitle.transform.x = -20; st.layout.align = 'left';
    window.__l3rd.replaceState(st); window.__l3rd.selectLayer('title'); window.__l3rd.render();
  });
  await p.waitForTimeout(200);
  await p.locator('.layer-row[data-layer=subtitle]').click({ modifiers: ['Shift'] });
  const multi = await p.evaluate(() => window.__l3rd.multiSel());
  await p.waitForTimeout(150);
  await p.locator('#inspector > div:not([hidden]) [data-itab="position"]').click(); await p.locator('#inspector > div:not([hidden]) .align-row button[title="Align left edges"]').click();
  await p.waitForTimeout(150);
  const rects = await p.evaluate(() => ['title', 'subtitle'].map((k) => { const L = Engine.layoutAt(document.createElement('canvas').getContext('2d'), Engine.resolveAt(window.__l3rd.state, 3)); return Engine.screenRect(L.layers[k]).x; }));
  // distribute needs 3
  await p.locator('.layer-row[data-layer=backdrop]').click({ modifiers: ['Shift'] });
  await p.locator('#inspector > div:not([hidden]) .align-row button[title^="Distribute vertically"]').click();
  await p.screenshot({ path: 'test/out/clip-align.png' });
  console.log({ pastedKeys, subKeys, copies: copies.map((c) => c.name), copyKeys, copies2, multi, rects, errs });
  const ok = pastedKeys.length === 4 && pastedKeys[2][0] === 4 && pastedKeys[3][0] === 4.5 && pastedKeys[3][2] === 'easeOutCubic'
    && subKeys.length === 2 && subKeys[0][0] === 2 && copies.length === 1 && /Title copy/.test(copies[0].name) && copyKeys.length >= 1 && copies2 === 2
    && multi.length === 2 && Math.abs(rects[0] - rects[1]) < 1 && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
})();
