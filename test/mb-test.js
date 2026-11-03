const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  const out = await p.evaluate(async () => {
    const s = Presets.builtin(2); // Sport slant: fast slides
    s.comp.motionBlur = { enabled: true, shutter: 360, samples: 16, preview: false };
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    const g = c.getContext('2d');
    const res = [];
    for (const mb of [false, true]) {
      s.comp.motionBlur.enabled = mb;
      Engine.renderFrame(g, s, 0.12, { precise: true });
      res.push(c.toDataURL());
    }
    return res;
  });
  const fs = require('fs');
  out.forEach((d, i) => fs.writeFileSync(`mb${i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log('errors', errs);
  await b.close();
})();
