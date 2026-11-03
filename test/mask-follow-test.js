// Moving the whole lower third moves its masks; moving only the backdrop leaves the mask in place.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.evaluate(() => { const s = window.__l3rd.state; s.backdrop.mask = { ...s.backdrop.mask, enabled: true, x: 100, y: 800, w: 600, h: 200 }; window.__l3rd.setTime(3); });
  const m = () => p.evaluate(() => { const s = window.__l3rd.state; return { mask: [s.backdrop.mask.x, s.backdrop.mask.y], layout: [s.layout.x, s.layout.y], bx: s.backdrop.transform.x }; });
  const m0 = await m();
  // Easy mode: drag the design in the preview
  let fr = await p.locator('#preview').boundingBox();
  const ly = await p.evaluate(() => window.__l3rd.state.layout);
  const toScr = (x, y) => [fr.x + (x / 1920) * fr.width, fr.y + (y / 1080) * fr.height];
  const [sx, sy] = toScr(ly.x + 100, ly.y - 60);
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 80, sy - 40, { steps: 5 }); await p.mouse.up();
  const m1 = await m();
  const dragOk = Math.abs((m1.mask[0] - m0.mask[0]) - (m1.layout[0] - m0.layout[0])) < 1 && Math.abs((m1.mask[1] - m0.mask[1]) - (m1.layout[1] - m0.layout[1])) < 1 && m1.layout[0] !== m0.layout[0];
  // Advanced: move only the backdrop
  await p.click('#modeAdv');
  await p.evaluate(() => window.__l3rd.selectLayer('backdrop'));
  await p.waitForTimeout(150);
  fr = await p.locator('#preview').boundingBox();
  const box = await p.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); return Engine.layoutAt(c, Engine.resolveAt(window.__l3rd.state, 3)).box; });
  const [bx, by] = toScr(box.x + box.w - 12, box.y + 6);
  console.log('selected before drag', await p.evaluate(([x, y]) => Engine.hitTest(Engine.layoutAt(document.createElement('canvas').getContext('2d'), Engine.resolveAt(window.__l3rd.state, 3)), x, y), [box.x + box.w - 12, box.y + 6]));
  await p.mouse.move(bx, by); await p.mouse.down(); await p.mouse.move(bx + 60, by, { steps: 5 }); await p.mouse.up();
  const m2 = await m();
  const layerOk = m2.bx !== 0 && m2.mask[0] === m1.mask[0] && m2.layout[0] === m1.layout[0];
  // Shift locks to the dominant axis
  const before = await m();
  await p.keyboard.down('Shift');
  await p.mouse.move(bx + 60, by); await p.mouse.down(); await p.mouse.move(bx + 60 + 70, by + 20, { steps: 6 }); await p.mouse.up();
  await p.keyboard.up('Shift');
  const after = await p.evaluate(() => window.__l3rd.state.backdrop.transform);
  const shiftOk = after.x !== before.bx && Math.abs(after.y - 0) < 1;
  console.log('shift', before.bx, after.x, after.y);
  // undo restores without double-shifting
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await p.waitForTimeout(500);
  console.log({ m0, m1, m2, dragOk, layerOk, errs });
  console.log(dragOk && layerOk && shiftOk && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
