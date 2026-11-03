// Right-click easing menu and graph editor (Advanced mode).
const { chromium } = require('playwright');
const SHOT = process.env.SHOT || '.';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  await p.click('#modeAdv'); await p.waitForTimeout(200);
  const S = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__l3rd.state)));
  let st = await S();
  let box = await p.locator('#timeline').boundingBox();
  const sx = (t) => box.x + 150 + (t / st.comp.duration) * (box.width - 166);
  const rowY = (i) => box.y + 22 + 6 + 28 * i + 11;
  // 1. right-click the backdrop in ramp → menu → Overshoot
  const a = st.backdrop.anim;
  await p.mouse.click(sx(a.in.delay + a.in.duration * 0.5), rowY(2), { button: 'right' });
  console.log('menu visible', await p.isVisible('.ctxmenu'), 'title', await p.textContent('.ctx-title'));
  await p.screenshot({ path: `${SHOT}/ctx.png` });
  await p.click('.ctxmenu button:has-text("Overshoot")');
  st = await S(); console.log('backdrop in easing', st.backdrop.anim.in.easing, 'menu hidden', await p.isHidden('.ctxmenu'));
  // 2. double-click the same ramp → graph editor; drag handle 2
  await p.mouse.dblclick(sx(a.in.delay + a.in.duration * 0.5), rowY(2));
  console.log('graph open', await p.evaluate(() => document.querySelector('#graphDialog').open), await p.inputValue('#gEase'), await p.inputValue('#gX2'), await p.inputValue('#gY2'));
  const gb = await p.locator('#graphCanvas').boundingBox();
  // find handle 2 position via inputs is hard; drag from where it is: compute using same geometry in page
  const h2 = await p.evaluate(() => {
    const c = document.querySelector('#graphCanvas'); const w = c.clientWidth, h = c.clientHeight;
    return { w, h };
  });
  // handle 2 for easeOutBack is (0.64,1); grab it by scanning for the yellow pixel nearest
  await p.screenshot({ path: `${SHOT}/graph.png` });
  const pos = await p.evaluate(() => {
    const c = document.querySelector('#graphCanvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
    const dpr = window.devicePixelRatio || 1; let best = null;
    for (let y = 0; y < c.height; y += 2) for (let x = Math.round(c.width * 0.5); x < c.width; x += 2) { const i = (y * c.width + x) * 4; if (d[i] > 240 && d[i + 1] > 150 && d[i + 1] < 170 && d[i + 2] < 20) { best = { x: x / dpr, y: y / dpr }; } }
    return best;
  });
  console.log('handle px', pos);
  await p.mouse.move(gb.x + pos.x, gb.y + pos.y); await p.mouse.down();
  await p.mouse.move(gb.x + pos.x - 80, gb.y + pos.y + 60, { steps: 6 }); await p.mouse.up();
  st = await S(); console.log('after drag', st.backdrop.anim.in.easing, JSON.stringify(st.backdrop.anim.in.bezier), await p.inputValue('#gEase'));
  await p.screenshot({ path: `${SHOT}/graph2.png` });
  await p.click('#gClose');
  // 3. keyframe: add two keys via API then right-click → Hold, dblclick → graph shows values
  await p.evaluate(() => { const L = window.__l3rd; const s = JSON.parse(JSON.stringify(L.state)); s.keys = { 'title.transform.x': [{ t: 1, v: 0, e: 'easeInOutCubic' }, { t: 3, v: 200, e: 'easeInOutCubic' }] }; L.replaceState(s); });
  await p.waitForTimeout(200);
  box = await p.locator('#timeline').boundingBox();
  await p.mouse.click(sx(1), rowY(2) - 11 + 9, { button: 'right' });
  console.log('key menu', await p.textContent('.ctx-title'));
  await p.click('.ctxmenu button:has-text("Hold")');
  st = await S(); console.log('key e', st.keys['title.transform.x'][0].e);
  await p.mouse.dblclick(sx(3), rowY(2) - 11 + 9);   // last key → edits incoming segment
  console.log('graph for key', await p.textContent('#gTitle'), await p.inputValue('#gEase'));
  await p.selectOption('#gEase', 'easeOutBack');
  st = await S(); console.log('key0 e now', st.keys['title.transform.x'][0].e);
  await p.screenshot({ path: `${SHOT}/graph3.png` });
  await p.keyboard.press('Escape');
  console.log('closed', !(await p.evaluate(() => document.querySelector('#graphDialog').open)));
  console.log('errors', errs); await b.close();
})();
