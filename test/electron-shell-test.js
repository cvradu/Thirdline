// Launch-readiness features in the real app: exact NTSC frame rates, fonts of every text layer in
// .l3rd files, missing-font warning, brand kit export/import, Free-plan watermark and gates.
// Run: xvfb-run npx electron --no-sandbox test/electron-shell-test.js
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out-shell');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'userdata'));
// Free plan: licensing on, trial started 30 days ago.
process.env.THIRDLINE_LICENSING = '1';
fs.mkdirSync(path.join(OUT, 'userdata'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'userdata', 'trial.json'), JSON.stringify({ started: Date.now() - 30 * 86400000 }));
// An uploaded font, as if imported earlier (family "Test Upload Font").
fs.mkdirSync(path.join(OUT, 'userdata', 'fonts'), { recursive: true });
const fontSrc = fs.readdirSync(path.join(__dirname, '..', 'src', 'fonts')).find((f) => f.startsWith('anton-latin-400'));
fs.copyFileSync(path.join(__dirname, '..', 'src', 'fonts', fontSrc), path.join(OUT, 'userdata', 'fonts', 'Test-Upload-Font.woff2'));
let nextOpen = null;
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(OUT, path.basename(o.defaultPath)) });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [nextOpen || OUT] });
require('../main.js');

let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'BAD '} ${msg}`); if (!cond) fails++; };

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errs.push(msg); });
  const waitExport = async () => {
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const st = await js(`[document.querySelector('#exportProgress span').textContent, document.querySelector('#exportError').hidden ? '' : document.querySelector('#exportError').textContent]`);
      if (st[1]) return 'ERROR ' + st[1];
      if (st[0].startsWith('Done')) return st[0];
    }
    return 'timeout';
  };

  // Start screen shows on launch (not a webdriver browser).
  check(await js(`!!document.querySelector('#startScreen')`), 'start screen shows on launch');
  await js(`document.querySelector('#startScreen').remove()`);

  // ---- Free plan ----
  const plan = await js(`Shell.refreshPlan().then((p) => p.plan)`);
  check(plan === 'free', `plan after trial is free (${plan})`);
  await js(`document.querySelector('#modeAdv').click()`);
  check(await js(`!document.body.classList.contains('advanced') && !!document.querySelector('#upgradeDialog[open]')`), 'Free: Advanced asks to upgrade');
  await js(`document.querySelector('#upgradeDialog').close()`);
  await js(`window.__l3rd.openBatch()`);
  check(await js(`!document.querySelector('#batchDialog').open && !!document.querySelector('#upgradeDialog[open]')`), 'Free: batch export asks to upgrade');
  await js(`document.querySelector('#upgradeDialog').close()`);
  const live = await js(`window.api.live.start({})`);
  check(live && live.error === 'plan', 'Free: main process refuses live output');

  // Watermark on a Free export, ProRes at 29.97 = 30000/1001.
  await js(`window.__l3rd.state.comp.duration = 1; window.__l3rd.state.comp.fps = 29.97; window.__l3rd.replaceState(window.__l3rd.state)`);
  await js(`document.querySelector('#btnExport').click(); document.querySelector('input[value=png]').checked = true; document.querySelector('#exportName').value = 'free'; document.querySelector('#exportGpu').checked = false; document.querySelector('#btnExportGo').click();`);
  let r = await waitExport(); check(r.startsWith('Done'), `Free PNG export: ${r}`);
  await js(`document.querySelector('#exportDialog').close()`);
  const png = path.join(OUT, 'free', 'frame_00015.png');
  const W = 1920, H = 1080;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', `crop=320:60:${W - 340}:${H - 80}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
  let opaque = 0; for (let i = 3; i < raw.length; i += 4) if (raw[i] > 100) opaque++;
  check(opaque > 200, `watermark drawn in the bottom-right corner (${opaque} px)`);

  // ---- Studio for the rest: a licence checked just now ----
  fs.writeFileSync(path.join(OUT, 'userdata', 'license.json'), JSON.stringify({ key: 'TEST-KEY-0000', plan: 'studio', checkedAt: Date.now(), valid: true }));
  check(await js(`Shell.refreshPlan().then((p) => p.plan + (p.licensed ? ' licensed' : ''))`) === 'studio licensed', 'Studio licence picked up');

  for (const [fps, want] of [['29.97', '30000/1001'], ['23.976', '24000/1001'], ['59.94', '60000/1001'], ['25', '25/1']]) {
    await js(`window.__l3rd.state.comp.fps = ${fps}; window.__l3rd.replaceState(window.__l3rd.state);
      document.querySelector('#btnExport').click(); document.querySelector('input[value=prores]').checked = true;
      document.querySelector('#exportFps').value = '${fps}'; document.querySelector('#exportName').value = 'fps-${fps}';
      document.querySelector('#exportGpu').checked = false; document.querySelector('#btnExportGo').click();`);
    r = await waitExport();
    await js(`document.querySelector('#exportDialog').close()`);
    const rate = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', path.join(OUT, `fps-${fps}.mov`)]).toString().trim();
    check(rate === want, `${fps} fps exports as ${rate} (want ${want})`);
  }

  // Fonts of extra text layers are embedded; missing fonts are reported on open.
  await js(`(() => {
    const st = window.__l3rd.state;
    st.layers.extra1 = Presets.newLayer('text', { text: 'Extra', font: 'Test Upload Font' }); st.order = [...st.order, 'extra1'];
    window.__l3rd.replaceState(st); return true;
  })()`);
  await js(`document.querySelector('#btnSaveAs').click()`);
  await new Promise((r2) => setTimeout(r2, 1500));
  const saved = fs.readdirSync(OUT).find((f) => f.endsWith('.l3rd'));
  const data = saved && JSON.parse(fs.readFileSync(path.join(OUT, saved), 'utf8'));
  check(!!data, `project saved (${saved})`);
  const embedded = data ? data.fonts.map((f) => f.family) : [];
  check(embedded.includes('Test Upload Font'), `extra layer font embedded: [${embedded.join(', ')}]`);

  // A project that uses a font this computer doesn't have.
  data.state.layers.extra1.font = 'Nonexistent Font Family 123';
  data.fonts = [];
  const missingPath = path.join(OUT, 'missing.l3rd');
  fs.writeFileSync(missingPath, JSON.stringify(data));
  nextOpen = missingPath;
  await js(`window.__l3rd.state && (document.title = document.title)`);
  await js(`document.querySelector('#btnOpen').click()`);
  await new Promise((r2) => setTimeout(r2, 1500));
  const toast = await js(`document.querySelector('#toast').textContent`);
  check(/Missing font: Nonexistent Font Family 123/.test(toast), `missing font reported: "${toast}"`);

  // Recent projects list.
  const recent = await js(`Shell.readRecent().map((r) => r.name)`);
  check(recent.includes('missing'), `recent projects: [${recent.join(', ')}]`);

  // Brand kit export → import.
  await js(`localStorage.setItem('thirdline:brands', JSON.stringify([{ id: 'b1', name: 'Acme', bg: '#112233', text: '#ffffff', accent: '#ff0000', fonts: [{ family: 'Test Upload Font', file: 'Test-Upload-Font.woff2' }] }])); true`);
  win.webContents.reload();
  await new Promise((r2) => setTimeout(r2, 2500));
  await js(`document.querySelector('#startScreen')?.remove(); document.querySelector('#btnBrand').click();`);
  await js(`[...document.querySelectorAll('#brandMenu button')].find((b) => /Export brand kit/.test(b.textContent)).click()`);
  await new Promise((r2) => setTimeout(r2, 800));
  const kitFile = path.join(OUT, 'Acme.thirdline-brand');
  const kit = fs.existsSync(kitFile) && JSON.parse(fs.readFileSync(kitFile, 'utf8'));
  check(kit && kit.format === 'thirdline-brand' && kit.brands[0].name === 'Acme', 'brand kit exported');
  check(kit && kit.brands[0].fonts.length === 1 && kit.brands[0].fonts[0].data.length > 1000, `brand kit carries its font (${kit && kit.brands[0].fonts.length})`);
  await js(`localStorage.setItem('thirdline:brands', '[]'); true`);
  win.webContents.reload();
  await new Promise((r2) => setTimeout(r2, 2500));
  nextOpen = kitFile;
  await js(`document.querySelector('#startScreen')?.remove(); document.querySelector('#btnBrand').click();`);
  await js(`[...document.querySelectorAll('#brandMenu button')].find((b) => /Import brand kits/.test(b.textContent)).click()`);
  await new Promise((r2) => setTimeout(r2, 1000));
  const brands = await js(`JSON.parse(localStorage.getItem('thirdline:brands')).map((b) => b.name)`);
  check(brands.includes('Acme'), `brand kit imported: [${brands.join(', ')}]`);

  // About, shortcuts, settings, report open without errors.
  for (const f of ['showAbout', 'showShortcuts', 'showPrefs', 'showReport', 'showLicense']) {
    await js(`Shell.${f}()`); await new Promise((r2) => setTimeout(r2, 400));
    check(await js(`document.querySelectorAll('dialog[open]').length === 1`), `${f} opens`);
    await js(`document.querySelectorAll('dialog[open]').forEach((d) => d.close())`);
  }
  const diag = await js(`window.api.diagnostics()`);
  check(diag.app && diag.ffmpeg && diag.ffmpeg !== 'not found', `diagnostics: app ${diag.app}, ffmpeg ${diag.ffmpeg}`);

  console.log('console errors:', errs.filter((e) => !/Could not load font|Autofill/.test(e)));
  console.log(fails ? `FAIL (${fails})` : 'PASS');
  app.exit(fails ? 1 : 0);
});
