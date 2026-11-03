// Preview zoom/pan, timeline ruler vs box-select, keyframe click, and the quick-align bar.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  const L = (f, ...a) => p.evaluate(f, ...a);
  const ok = {};
  // --- Preview zoom
  const fit = await L(() => window.__l3rd.viewScale());
  const vp = await p.locator('#viewport').boundingBox();
  await p.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
  await p.keyboard.down('Alt'); await p.mouse.wheel(0, -300); await p.keyboard.up('Alt');
  await p.waitForTimeout(100);
  const z1 = await L(() => window.__l3rd.viewScale());
  ok.altZoom = z1 > fit * 1.3;
  await p.selectOption('#zoomSel', '1');
  ok.menu100 = Math.abs((await L(() => window.__l3rd.viewScale())) - 1) < 1e-6;
  // Space+drag pans; a Space tap (no drag) plays
  const pv0 = await L(() => window.__l3rd.pview());
  await p.keyboard.down('Space');
  await p.mouse.move(vp.x + 300, vp.y + 200); await p.mouse.down(); await p.mouse.move(vp.x + 380, vp.y + 240, { steps: 4 }); await p.mouse.up();
  await p.keyboard.up('Space');
  const pv1 = await L(() => window.__l3rd.pview());
  ok.spacePan = Math.abs(pv1.px - pv0.px - 80) < 2 || Math.abs(pv1.py - pv0.py - 40) < 2; // clamps may limit one axis
  ok.noPlayAfterPan = !(await L(() => window.__l3rd.playing()));
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  ok.spaceTapPlays = await L(() => window.__l3rd.playing());
  await p.keyboard.press('Space');
  // Dragging a layer while zoomed at 100% moves it by the mouse distance in comp pixels
  await p.selectOption('#zoomSel', 'fit');
  await L(() => { window.__l3rd.setTime(2.5); window.__l3rd.selectLayer('title'); window.__l3rd.render(); });
  let r0 = (await L(() => window.__l3rd.rects())).title;
  let cv = await p.locator('#preview').boundingBox();
  { const s0 = cv.width / (await L(() => window.__l3rd.state.comp.width));
    await p.mouse.move(cv.x + (r0.x + r0.w / 2) * s0, cv.y + (r0.y + r0.h / 2) * s0);
    await p.keyboard.down('Alt'); await p.mouse.wheel(0, -350); await p.keyboard.up('Alt'); await p.waitForTimeout(100); }
  r0 = (await L(() => window.__l3rd.rects())).title;
  cv = await p.locator('#preview').boundingBox();
  const sc = cv.width / (await L(() => window.__l3rd.state.comp.width));
  const cx = cv.x + (r0.x + r0.w / 2) * sc, cy = cv.y + (r0.y + r0.h / 2) * sc;
  const vb = await p.locator('#viewport').boundingBox();
  if (cx > vb.x && cx < vb.x + vb.width && cy > vb.y && cy < vb.y + vb.height) {
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 40, cy, { steps: 5 }); await p.mouse.up();
    const r1 = (await L(() => window.__l3rd.rects())).title;
    ok.zoomDrag = Math.abs(r1.x - r0.x - 40 / sc) < 2;
  } else ok.zoomDrag = 'skipped (title off-screen at 200%)';
  await p.selectOption('#zoomSel', 'fit');
  // --- Quick align (Easy): centre puts title and subtitle on the backdrop's centre
  await L(() => { const s = window.__l3rd.state; s.title.transform.x = -60; s.subtitle.transform.x = 35; window.__l3rd.selectLayer(null); window.__l3rd.render(); });
  await p.click('#quickAlign [data-align="centerH"]'); await L(() => window.__l3rd.render());
  let R = await L(() => window.__l3rd.rects());
  const mid = (r) => r.x + r.w / 2;
  ok.alignCentre = Math.abs(mid(R.title) - mid(R.backdrop)) < 2 && Math.abs(mid(R.subtitle) - mid(R.backdrop)) < 2;
  await p.click('#quickAlign [data-align="left"]'); await L(() => window.__l3rd.render());
  R = await L(() => window.__l3rd.rects());
  ok.alignLeft = Math.abs(R.title.x - R.subtitle.x) < 2;
  await p.click('#quickAlign [data-align="right"]'); await L(() => window.__l3rd.render());
  R = await L(() => window.__l3rd.rects());
  ok.alignRight = Math.abs(R.title.x + R.title.w - R.subtitle.x - R.subtitle.w) < 2;
  // --- Timeline (Advanced)
  await p.click('#modeAdv');
  await L(() => { const s = window.__l3rd.state;
    s.keys = { 'title.transform.x': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: 50, e: 'linear' }], 'title.transform.y': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: 9, e: 'linear' }] };
    window.__l3rd.selectLayer('title'); window.__l3rd.setTime(0.2); window.__l3rd.render(); });
  await p.waitForTimeout(300);
  let g = await L(() => window.__l3rd.tlDebug()); let fr = await p.locator('#timeline').boundingBox();
  const X = (t) => fr.x + g.left + ((t - g.t0) / g.span) * (g.w - g.left - g.right);
  const Y = (path) => { const r = g.rows.find((r) => r.path === path); return fr.y + r.y + r.h / 2; };
  // Ruler click moves the playhead
  await p.mouse.click(X(3), fr.y + g.ruler / 2);
  ok.rulerMoves = Math.abs((await L(() => window.__l3rd.time())) - 3) < 0.05;
  // Empty body click does not move it
  await p.mouse.click(X(4), Y('title.transform.x'));
  ok.bodyKeeps = Math.abs((await L(() => window.__l3rd.time())) - 3) < 0.05;
  // Box across both rows around t=2
  await p.mouse.move(X(1.7), Y('title.transform.x') - 4); await p.mouse.down(); await p.mouse.move(X(2.3), Y('title.transform.y') + 4, { steps: 5 }); await p.mouse.up();
  ok.box = JSON.stringify(await L(() => window.__l3rd.selKeyTimes())) === '[2,2]';
  g = await L(() => window.__l3rd.tlDebug()); fr = await p.locator('#timeline').boundingBox();
  // Plain click on one of the selected keys, slightly off-centre: selects only it, doesn't move it
  await p.mouse.click(X(1) + 4, Y('title.transform.x'));
  await p.mouse.click(X(2) - 4, Y('title.transform.y'));
  const ks = await L(() => JSON.parse(JSON.stringify(window.__l3rd.state.keys)));
  ok.clickOne = JSON.stringify(await L(() => window.__l3rd.selKeyTimes())) === '[2]';
  ok.notNudged = ks['title.transform.x'].map((k) => k.t).join() === '1,2' && ks['title.transform.y'].map((k) => k.t).join() === '1,2';
  await p.screenshot({ path: 'test/out/view.png' });
  console.log(ok, errs);
  console.log(Object.values(ok).every((v) => v === true || String(v).startsWith('skipped')) && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
