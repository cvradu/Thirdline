// The backdrop shadow must not pop in when a wipe finishes (it used to be clipped until the hold).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  const res = await p.evaluate(() => {
    const st = window.__l3rd.state;
    const c = document.createElement('canvas'); c.width = st.comp.width; c.height = st.comp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const out = {};
    for (const [label, anim] of [['wipeRight', 'wipeRight'], ['wipeUp', 'wipeUp'], ['wipeCenter', 'wipeCenter']]) {
      const s = JSON.parse(JSON.stringify(st));
      s.backdrop.anim.in.type = anim; s.backdrop.shadow = { on: true, color: '#000000', opacity: 0.8, blur: 24, offsetX: 12, offsetY: 12 };
      s.title.visible = false; s.subtitle.visible = false;
      const sp = Engine.timingSpans(s.backdrop.anim, s.comp.duration), f = 1 / s.comp.fps;
      const alphaSum = (t) => { const L = Engine.render(ctx, s, t); const d = ctx.getImageData(0, 0, c.width, c.height).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return { a, L }; };
      const before = alphaSum(sp.inEnd - f * 0.25), after = alphaSum(sp.inEnd + f);
      out[label] = { before: before.a, after: after.a, jump: +((after.a - before.a) / after.a * 100).toFixed(2) };
    }
    return out;
  });
  console.log(res, errs);
  const bad = Object.values(res).filter((r) => Math.abs(r.jump) > 1.5);
  console.log(bad.length ? 'FAIL' : 'PASS');
  await b.close();
})();
