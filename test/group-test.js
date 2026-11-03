// Groups: grouping keeps everything in place, moving/scaling the group moves its layers, the
// group's In animation animates them all, hiding the group hides them, ungroup keeps positions.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  const bbox = (t = 3) => p.evaluate((t) => {
    const s = window.__l3rd.state, c = document.createElement('canvas'); c.width = s.comp.width; c.height = s.comp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    const st = JSON.parse(JSON.stringify(s)); st.backdrop.shadow.on = false; st.title.shadow.on = false; st.subtitle.shadow.on = false;
    Engine.render(g, st, t);
    const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const a = d[(y * c.width + x) * 4 + 3]; if (a > 128) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    return [x0, y0, x1, y1, n];
  }, t);
  const b0 = await bbox();
  // Select all three, group
  await p.evaluate(() => window.__l3rd.selectLayer('title'));
  await p.locator('.layer-row[data-layer=subtitle]').click({ modifiers: ['Shift'] });
  await p.locator('.layer-row[data-layer=backdrop]').click({ modifiers: ['Shift'] });
  await p.keyboard.press('Control+g');
  await p.waitForTimeout(150);
  const g = await p.evaluate(() => { const s = window.__l3rd.state; const id = Object.keys(s.layers).find((k) => s.layers[k].kind === 'group'); return { id, kids: ['backdrop', 'title', 'subtitle'].map((k) => s[k].parent) }; });
  const b1 = await bbox();
  const stayed = b0.slice(0, 4).every((v, i) => Math.abs(v - b1[i]) <= 2);
  const rows = await p.locator('#layerList .layer-row').evaluateAll((rs) => rs.map((r) => [r.dataset.layer, r.style.paddingLeft]));
  // Move the group
  await p.evaluate((id) => { window.__l3rd.state.layers[id].transform.x = 100; window.__l3rd.render(); }, g.id);
  const b2 = await bbox();
  const moved = Math.abs(b2[0] - b1[0] - 100) <= 2;
  // Group In animation: slide from left, at t=0.1 everything is shifted / faded
  await p.evaluate((id) => { const a = window.__l3rd.state.layers[id].anim; a.in = { ...a.in, type: 'slideLeft', delay: 2.5, duration: 1, easing: 'linear' }; a.distance = 300; }, g.id);
  const early = await bbox(3);
  const animated = early[0] < b2[0] - 100 && early[4] > 0;
  // Hide group
  await p.evaluate((id) => { window.__l3rd.state.layers[id].visible = false; }, g.id);
  const hid = (await bbox())[4] === 0;
  await p.evaluate((id) => { window.__l3rd.state.layers[id].visible = true; window.__l3rd.state.layers[id].anim.in.type = 'none'; window.__l3rd.selectLayer(id); }, g.id);
  await p.waitForTimeout(150);
  await p.screenshot({ path: 'test/out/group.png' });
  // Ungroup keeps positions
  await p.keyboard.press('Control+Shift+g');
  await p.waitForTimeout(150);
  const b3 = await bbox();
  const after = await p.evaluate(() => { const s = window.__l3rd.state; return { groups: Object.values(s.layers || {}).filter((l) => l.kind === 'group').length, parents: ['backdrop', 'title', 'subtitle'].map((k) => s[k].parent || null) }; });
  const kept = b2.slice(0, 4).every((v, i) => Math.abs(v - b3[i]) <= 2);
  console.log({ b0, b1, b2, early, g, rows, stayed, moved, animated, hid, b3, after, kept, errs });
  console.log(stayed && moved && animated && hid && kept && after.groups === 0 && g.kids.every((k) => k === g.id) && rows[0][0] === g.id && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
