// Pen tool: draw a closed shape, edit a point, round one corner, draw-on trim, a pen-drawn mask,
// and a path keyframe morph.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  const L = (f, ...a) => p.evaluate(f, ...a);
  const ok = {};
  await L(() => { window.__l3rd.setTime(2.5); window.__l3rd.render(); });
  let cv = await p.locator('#preview').boundingBox(), sc = cv.width / 1920;
  const at = (x, y) => [cv.x + x * sc, cv.y + y * sc];
  const re = async () => { cv = await p.locator('#preview').boundingBox(); sc = cv.width / 1920; };
  const pix = (x, y) => L(([x, y]) => Array.from(document.querySelector('#preview').getContext('2d').getImageData(x, y, 1, 1).data), [x, y]);
  // Draw a square 1200..1500 x 200..500, then click the first point to close.
  await p.mouse.click(10, 10); await p.keyboard.press('p');
  ok.penOn = (await L(() => window.__l3rd.tool())) === 'pen';
  for (const [x, y] of [[1200, 200], [1500, 200], [1500, 500], [1200, 500], [1200, 200]]) { await re(); await p.mouse.click(...at(x, y)); await p.waitForTimeout(60); }
  let st = await L(() => JSON.parse(JSON.stringify(window.__l3rd.state.layers)));
  const id = Object.keys(st).find((k) => st[k].shape === 'path');
  ok.drawn = !!id && st[id].points.length === 4 && st[id].closed === true && st[id].fill === true;
  await L(() => window.__l3rd.render());
  let px = await pix(1350, 350);
  ok.filled = px[3] > 200 && px[0] > 120 && px[2] > 200; // purple fill
  // Select tool, drag the top-right point 100px right
  await p.keyboard.press('v');
  await L((id) => { window.__l3rd.selectLayer(id); window.__l3rd.render(); }, id);
  await p.waitForTimeout(100); await re();
  await p.mouse.move(...at(1500, 200)); await p.mouse.down(); await p.mouse.move(...at(1600, 200), { steps: 5 }); await p.mouse.up();
  st = await L(() => JSON.parse(JSON.stringify(window.__l3rd.state.layers)));
  ok.dragPoint = Math.abs(st[id].points[1].x - 1600) < 3 && Math.abs(st[id].points[1].y - 200) < 3;
  ok.selPoint = (await L(() => window.__l3rd.selPoint()))?.i === 1;
  if (0) console.log('so far', ok, errs.slice(0,2), await L(() => window.__l3rd.tool()), JSON.stringify(Object.values(await L(() => window.__l3rd.state.layers || {})).map((l) => l.transform)), JSON.stringify(Object.values(await L(() => window.__l3rd.state.layers || {})).map((l) => [l.shape, l.points, l.closed])));
  // Round that one corner via the "Point corner" control
  const corner = p.locator('.row:visible', { hasText: 'Point corner' }).locator('input[type=number]');
  await corner.fill('80'); await corner.dispatchEvent('input');
  await L(() => { window.__l3rd.selectLayer(null); window.__l3rd.render(); });
  st = await L(() => JSON.parse(JSON.stringify(window.__l3rd.state.layers)));
  ok.oneCorner = st[id].points[1].r === 80 && st[id].points[0].r === 0;
  px = await pix(1596, 202); // the very corner is now outside the rounded shape
  const px2 = await pix(1203, 203); // the sharp corner is still filled
  ok.roundedPixels = px[3] < 50 && px2[3] > 200;
  // Draw-on: trim end 0 → nothing drawn
  await L((id) => { const s = window.__l3rd.state; s.layers[id].fill = false; s.layers[id].stroke.on = true; s.layers[id].trim.end = 50; window.__l3rd.selectLayer(null); window.__l3rd.render(); }, id);
  const top = await pix(1300, 200); console.log('trim px', top, await pix(1300, 500)), bottom = await pix(1300, 500);
  ok.trim = top[3] > 150 && bottom[3] < 30;
  // Path keyframes morph
  await L((id) => { const s = window.__l3rd.state; const P = `layers.${id}.points`; const a = JSON.parse(JSON.stringify(s.layers[id].points)); const b2 = a.map((q) => ({ ...q, y: q.y + 100 }));
    s.keys = { [P]: [{ t: 1, v: a, e: 'linear' }, { t: 2, v: b2, e: 'linear' }] }; window.__l3rd.setTime(1.5); window.__l3rd.render(); }, id);
  const rects = await L(() => window.__l3rd.rects());
  ok.morph = Math.abs(rects[id].y - (200 + 50 - 3)) < 3;
  // Pen-drawn mask on the title (Shift+P), a triangle
  await L(() => { window.__l3rd.state.keys = {}; window.__l3rd.selectLayer('title'); window.__l3rd.setTime(2.5); window.__l3rd.render(); });
  await p.mouse.click(10, 10);
  await L(() => window.__l3rd.selectLayer('title'));
  await p.keyboard.press('Shift+P');
  ok.maskTool = (await L(() => window.__l3rd.tool())) === 'penMask';
  for (const [x, y] of [[100, 700], [700, 700], [400, 1000], [100, 700]]) { await re(); await p.mouse.click(...at(x, y)); await p.waitForTimeout(60); }
  const m = await L(() => JSON.parse(JSON.stringify(window.__l3rd.state.title.mask)));
  ok.mask = m.enabled && m.shape === 'path' && m.points.length === 3 && m.x === 100 && m.y === 700;
  await p.keyboard.press('Escape');
  await p.screenshot({ path: 'test/out/pen.png' });
  console.log(ok, errs);
  console.log(Object.values(ok).every(Boolean) && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
