// Panels: drag the edges to resize (left, right, timeline), drag grips to swap sides / move the
// timeline on top, the layout survives a reload, and Reset puts it back.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 940 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const url = 'file://' + require('path').resolve(__dirname, '../src/index.html');
  await p.goto(url);
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  await p.waitForTimeout(200);
  const box = (sel) => p.locator(sel).boundingBox();
  const drag = async (x, y, dx, dy) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(100); };
  const L0 = await box('#leftPanel'), R0 = await box('#rightPanel'), T0 = await box('#tlWrap');
  // left edge gutter: right side of left panel
  await drag(L0.x + L0.width - 1, L0.y + 300, 80, 0);
  // right panel gutter: its left edge
  await drag(R0.x + 1, R0.y + 300, -60, 0);
  // timeline top edge
  await drag(T0.x + 300, T0.y + 1, 0, -150);
  const L1 = await box('#leftPanel'), R1 = await box('#rightPanel'), T1 = await box('#tlWrap');
  const resized = Math.abs(L1.width - L0.width - 80) <= 3 && Math.abs(R1.width - R0.width - 60) <= 3 && Math.abs(T1.height - T0.height - 150) <= 3;
  const canvasH = await p.evaluate(() => document.querySelector('#timeline').clientHeight);
  // Swap sides: drag the left panel's grip to the right zone
  const g = await box('#leftPanel > .dock-grip');
  await drag(g.x + 5, g.y + 5, 1450 - g.x, 300);
  const L2 = await box('#leftPanel'), R2 = await box('#rightPanel');
  const swapped = L2.x > R2.x && Math.abs(L2.width - L1.width) <= 3;
  // Timeline on top
  const tg = await box('#tlWrap .dock-grip');
  const V = await box('#viewport');
  await drag(tg.x + 20, tg.y + 5, 0, V.y + 40 - tg.y);
  const T2 = await box('#tlWrap'), V2 = await box('#viewport');
  const top = T2.y < V2.y;
  await p.screenshot({ path: 'test/out/layout.png' });
  // Survives reload
  await p.reload(); await p.waitForTimeout(900);
  const L3 = await box('#leftPanel'), R3 = await box('#rightPanel'), T3 = await box('#tlWrap'), V3 = await box('#viewport');
  const kept = L3.x > R3.x && T3.y < V3.y && Math.abs(L3.width - L1.width) <= 3;
  // Reset
  await p.click('#btnFile'); await p.click('#btnResetLayout');
  await p.waitForTimeout(150);
  const L4 = await box('#leftPanel'), R4 = await box('#rightPanel'), T4 = await box('#tlWrap'), V4 = await box('#viewport');
  const reset = L4.x < R4.x && T4.y > V4.y && Math.abs(L4.width - L0.width) <= 3;
  console.log({ L0: L0.width, L1: L1.width, R0: R0.width, R1: R1.width, T0: T0.height, T1: T1.height, canvasH, swapped, top, kept, reset, errs });
  console.log(resized && swapped && top && kept && reset && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
