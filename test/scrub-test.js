const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file:///home/claude/l3rd-creator/src/index.html');
  await p.waitForTimeout(1200);
  const box = await p.locator('#scrub').boundingBox();
  await p.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  const t1 = await p.evaluate(() => document.querySelector('#timecode').textContent);
  // drag the playhead on the phase bar through the hold
  const pb = await p.locator('#phaseBar').boundingBox();
  const head = await p.locator('.ph-head').boundingBox();
  await p.mouse.move(head.x + 1, pb.y + 15); await p.mouse.down();
  await p.mouse.move(pb.x + pb.width * 0.7, pb.y + 15, { steps: 5 }); await p.mouse.up();
  const t2 = await p.evaluate(() => document.querySelector('#timecode').textContent);
  const dur = await p.evaluate(() => window.__l3rd.state.comp.duration);
  await p.locator('.transport').screenshot({ path: process.argv[2] });
  console.log({ t1, t2, dur, errs });
  await b.close();
})();
