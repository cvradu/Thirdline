// Right-click copy/paste: keyframes on the timeline, an In animation between layers, a layer from the
// layer list, and text animators.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeAdv');
  const L = (f, ...a) => p.evaluate(f, ...a);
  const ok = {};
  const menu = async (label) => { await p.locator('.ctxmenu:not([hidden]) button', { hasText: label }).first().click(); };
  await L(() => { const s = window.__l3rd.state;
    s.keys = { 'title.transform.x': [{ t: 1, v: 0, e: 'linear' }, { t: 2, v: 50, e: 'linear' }] };
    s.title.anim.in.type = 'fade'; s.subtitle.anim.in.type = 'slideLeft';
    window.__l3rd.selectLayer('title'); window.__l3rd.setTime(0); window.__l3rd.render(); });
  await p.waitForTimeout(300);
  let g = await L(() => window.__l3rd.tlDebug()); let fr = await p.locator('#timeline').boundingBox();
  const X = (t) => fr.x + g.left + ((t - g.t0) / g.span) * (g.w - g.left - g.right);
  const rowY = (f) => { const r = g.rows.find(f); return fr.y + r.y + r.h / 2; };
  // Right-click a keyframe → Copy, move playhead, right-click the subtitle row → Paste
  await p.mouse.click(X(1), rowY((r) => r.path === 'title.transform.x'), { button: 'right' });
  await menu('Copy keyframe');
  await L(() => window.__l3rd.setTime(3));
  g = await L(() => window.__l3rd.tlDebug()); fr = await p.locator('#timeline').boundingBox();
  await p.mouse.click(X(5.5), rowY((r) => r.type === 'bar' && r.key === 'subtitle') - 8, { button: 'right' });
  await menu('Paste 1 keyframe');
  const k1 = await L(() => JSON.parse(JSON.stringify(window.__l3rd.state.keys)));
  ok.keys = !!(k1['subtitle.transform.x'] && k1['subtitle.transform.x'][0].t === 3);
  // Right-click title's In ramp → Copy In animation; subtitle's In ramp → Paste
  g = await L(() => window.__l3rd.tlDebug()); fr = await p.locator('#timeline').boundingBox();
  const sp = await L(() => { const s = window.__l3rd.state; return [s.title.anim.in, s.subtitle.anim.in]; });
  await p.mouse.click(X(sp[0].delay + sp[0].duration / 2), rowY((r) => r.type === 'bar' && r.key === 'title'), { button: 'right' });
  await menu('Copy In animation');
  await p.mouse.click(X(sp[1].delay + sp[1].duration / 2), rowY((r) => r.type === 'bar' && r.key === 'subtitle'), { button: 'right' });
  await menu('Paste animation onto In');
  const a2 = await L(() => window.__l3rd.state.subtitle.anim.in);
  ok.anim = a2.type === 'fade' && a2.delay === sp[1].delay;
  // Layer list: right-click Subtitle → Copy layer, then Paste layer
  await p.locator('.layer-row[data-layer="subtitle"]:visible').first().click({ button: 'right' });
  await menu('Copy layer');
  await p.locator('.layer-row[data-layer="title"]:visible').first().click({ button: 'right' });
  await menu('Paste layer');
  const nLayers = await L(() => Object.keys(window.__l3rd.state.layers || {}).length);
  ok.layer = nLayers === 1;
  // Preview right-click opens the layer menu
  await L(() => { window.__l3rd.setTime(2.5); window.__l3rd.render(); });
  const r = (await L(() => window.__l3rd.rects())).title;
  const cv = await p.locator('#preview').boundingBox(); const sc = cv.width / 1920;
  await p.mouse.click(cv.x + (r.x + r.w / 2) * sc, cv.y + (r.y + r.h / 2) * sc, { button: 'right' });
  ok.previewMenu = await p.locator('.ctxmenu:not([hidden]) .ctx-title').textContent();
  await p.keyboard.press('Escape'); await p.mouse.click(5, 900);
  // Text animators: add one to the title, right-click it → Copy, paste onto subtitle's animator section
  await L(() => window.__l3rd.selectLayer('title'));
  await p.locator('#inspector > div:not([hidden]) [data-itab="motion"]').click(); const addSel = p.locator('.section:visible', { hasText: 'Text animators' }).locator('select').first();
  await addSel.evaluate((s) => { s.value = s.options[1].value; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await L(() => window.__l3rd.render());
  await p.locator('.section:visible', { hasText: 'Text animators' }).first().evaluate((sec) => { sec.classList.remove('collapsed', 'folded'); sec.querySelectorAll('[hidden]').forEach((x) => x.hidden = false); });
  const head = p.locator('.animator:visible').first();
  await head.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const hb = await head.boundingBox();
  await p.mouse.click(hb.x + 20, hb.y + 8, { button: 'right' });
  await menu('Copy this animator');
  await L(() => window.__l3rd.selectLayer('subtitle'));
  await p.waitForTimeout(200);
  await p.locator('.layer-row[data-layer="subtitle"]:visible').first().click({ button: 'right' });
  await menu('Paste 1 text animator');
  ok.animators = await L(() => (window.__l3rd.state.subtitle.animators || []).length === 1);
  console.log(ok, errs);
  console.log(ok.animators && ok.keys && ok.anim && ok.layer && /Title|Name/i.test(ok.previewMenu) && !errs.length ? 'PASS' : 'FAIL');
  await b.close();
})();
