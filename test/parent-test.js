// Parenting: title follows the backdrop's position/rotation/scale; picking a parent keeps the
// title in place; hit-testing and dragging work in the parent's space.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  await p.evaluate(() => { window.__l3rd.setTime(3); window.__l3rd.selectLayer('title'); });
  await p.waitForTimeout(200);
  // Render only the title and measure its pixel bounds
  const bbox = (only = 'title') => p.evaluate((only) => {
    const s = window.__l3rd.state, c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const st = JSON.parse(JSON.stringify(s));
    for (const k of ['backdrop', 'title', 'subtitle']) if (k !== only) st[k].visible = false;
    if (only !== 'backdrop') st.backdrop.type = 'none';
    st.title.shadow = { ...(st.title.shadow || {}), on: false };
    Engine.render(ctx, st, 3);
    const d = ctx.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  }, only);
  // Move the backdrop first, then parent: title must not jump
  await p.evaluate(() => { const t = window.__l3rd.state.backdrop.transform; t.x = 120; t.y = -40; window.__l3rd.render(); });
  const t0 = await bbox();
  const picker = p.locator('select[title^="Follow another"]:visible');
  console.log('parent options', await picker.locator('option').allTextContents());
  await picker.selectOption('backdrop');
  await p.waitForTimeout(100);
  const t1 = await bbox();
  const tr1 = await p.evaluate(() => ({ parent: window.__l3rd.state.title.parent, x: window.__l3rd.state.title.transform.x, y: window.__l3rd.state.title.transform.y }));
  const stayed = t0.every((v, i) => Math.abs(v - t1[i]) <= 2);
  // Now moving the backdrop moves the title by the same amount
  await p.evaluate(() => { window.__l3rd.state.backdrop.transform.x += 200; window.__l3rd.render(); });
  const t2 = await bbox();
  const follows = Math.abs((t2[0] - t1[0]) - 200) <= 2 && Math.abs(t2[1] - t1[1]) <= 2;
  // Rotating the backdrop rotates the title with it (bounding box grows, centre orbits)
  await p.evaluate(() => { window.__l3rd.state.backdrop.transform.rotation = 20; window.__l3rd.render(); });
  const t3 = await bbox();
  const rot = (t3[3] - t3[1]) > (t2[3] - t2[1]) + 20;
  // Hit-test on the rotated title centre selects the title
  const hit = await p.evaluate(([x, y]) => Engine.hitTest(Engine.layoutAt(document.createElement('canvas').getContext('2d'), Engine.resolveAt(window.__l3rd.state, 3)), x, y), [(t3[0] + t3[2]) / 2, (t3[1] + t3[3]) / 2]);
  // Loop protection: backdrop's parent list doesn't offer the title
  await p.evaluate(() => window.__l3rd.selectLayer('backdrop'));
  await p.waitForTimeout(100);
  const bdOpts = await p.locator('select[title^="Follow another"]:visible').first().locator('option').allTextContents();
  const noLoop = !bdOpts.includes('Title');
  // Un-parent keeps it in place too
  await p.evaluate(() => window.__l3rd.selectLayer('title'));
  await p.waitForTimeout(100);
  await p.locator('select[title^="Follow another"]:visible').first().selectOption('');
  const t4 = await bbox();
  console.log({ t0, t1, tr1, t2, t3, t4, stayed, follows, rot, hit, bdOpts, noLoop, errs });
  console.log(stayed && follows && rot && hit === 'title' && noLoop && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
