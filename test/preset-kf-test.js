// Advanced mode: preset in/out animations show as editable keyframes; keyframe rows sit under their layer.
const { chromium } = require('playwright');
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
  const L = 150, R = 16, W = box.width;
  const sx = (t) => box.x + L + (t / (st.comp.duration * 1.15)) * (W - L - R);
  const rowY = (i) => box.y + 22 + 6 + 28 * i + 11;
  // 1. click the title's in ramp → keybar shows the preset
  const a = st.title.anim;
  await p.mouse.click(sx(a.in.delay + a.in.duration * 0.5), rowY(1));
  console.log('label:', await p.textContent('#kbLabel'), '| type:', await p.inputValue('#kpType'), '| dur:', await p.inputValue('#kpDur'));
  // 2. change duration from the bar
  await p.fill('#kpDur', '1.2'); await p.waitForTimeout(100);
  st = await S(); console.log('in duration now', st.title.anim.in.duration);
  // 3. convert the title "in" to keyframes (default title in = ? )
  console.log('title in type', st.title.anim.in.type, 'convert disabled?', await p.isDisabled('#kpConvert'));
  if (await p.isDisabled('#kpConvert')) { await p.selectOption('#kpType', 'slideUp'); }
  await p.click('#kpConvert'); await p.waitForTimeout(200);
  st = await S(); console.log('after convert: type', st.title.anim.in.type, 'keys', JSON.stringify(st.keys));
  // 4. keyframe rows should be right under Title bar (row 1) → y of first key row = rowY(2)-11
  await p.locator('#timeline').screenshot({ path: '/tmp/claude-0/-home-claude/d19f8194-2735-5d21-936e-97ff9400c04c/scratchpad/tl-adv.png' });
  // 5. subtitle bar is now pushed down; click subtitle out ramp and delete it with the Delete key
  const nKeys = Object.keys(st.keys).length; box = await p.locator('#timeline').boundingBox();
  const subY = box.y + 22 + 6 + 11; // subtitle is the top row (top layer first)
  const so = st.subtitle.anim; const D = st.comp.duration;
  const cx = sx(D - so.out.offset - so.out.duration * 0.5);
  await p.mouse.click(cx, subY);
  console.log('selected:', await p.textContent('#kbLabel'));
  await p.keyboard.press('Delete'); await p.waitForTimeout(100);
  st = await S(); console.log('subtitle out type after delete', st.subtitle.anim.out.type, 'keybar hidden', await p.isHidden('#keyBar'));
  // 6. collapse title keyframes
  const h1 = (await p.locator('#timeline').boundingBox()).height;
  box = await p.locator('#timeline').boundingBox(); await p.mouse.click(box.x + 6, rowY(1)); await p.waitForTimeout(100);
  const h2 = (await p.locator('#timeline').boundingBox()).height;
  console.log('height expanded', h1, 'collapsed', h2);
  // 7. render check: frame mid-in has title partially visible
  box = await p.locator('#timeline').boundingBox(); await p.mouse.click(box.x + 6, rowY(1));
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/d19f8194-2735-5d21-936e-97ff9400c04c/scratchpad/full.png' });
  console.log('errors', errs); await b.close();
})();
