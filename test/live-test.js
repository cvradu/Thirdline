// Live output: server + OBS page. Pushes a design, cues in/out, checks the page draws then clears.
const { chromium } = require('playwright');
const path = require('path');
const { createLiveServer } = require('../live-server');
(async () => {
  const srv = createLiveServer({ srcDir: path.join(__dirname, '../src'), fontsDir: () => '/nonexistent' });
  const { url } = await srv.start(7461);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(500);
  // the default design, built in a page context
  const st = await p.evaluate(() => Presets.defaultState());
  srv.update(st, []);
  await p.waitForTimeout(500);
  const alpha = () => p.evaluate(() => { const c = document.getElementById('out'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i]) n++; return n; });
  console.log('idle pixels', await alpha());
  const r = await fetch(url.replace('/live', '/cue/in')); console.log('cue via http', r.status);
  await p.waitForTimeout(2000);
  console.log('after in: mode', await p.evaluate(() => window.__live.mode), 'pixels', await alpha());
  await p.waitForTimeout(3000);
  console.log('still holding:', await p.evaluate(() => [window.__live.mode, +window.__live.t.toFixed(2)]));
  srv.cue('out'); await p.waitForTimeout(1500);
  console.log('after out: mode', await p.evaluate(() => window.__live.mode), 'pixels', await alpha());
  const traversal = await fetch(url.replace('/live', '/app/..%2F..%2Fpackage.json')); console.log('traversal blocked', traversal.status);
  console.log('errors', errs);
  await b.close(); srv.stop();
})();
