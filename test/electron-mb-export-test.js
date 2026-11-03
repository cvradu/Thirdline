// Export a design with nested parents, motion blur (one layer switched off), torn paper,
// a controller and a track matte: it must finish without errors.
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'out-mb');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'userdata'));
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(OUT, path.basename(o.defaultPath)) });
require('../main.js');
app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errs.push(msg); });
  await js(`(() => { const s = JSON.parse(JSON.stringify(window.__l3rd.state));
    s.comp.duration = 2; s.backdrop.torn = { on: true, amount: 14, size: 36, edge: 6, paperColor: '#f4efe6', seed: 4 };
    s.title.parent = 'backdrop'; s.subtitle.parent = 'title'; s.subtitle.motionBlur = false;
    s.comp.motionBlur = { enabled: true, shutter: 180, samples: 12, preview: true };
    window.__l3rd.replaceState(s); })()`);
  await js(`window.__l3rd.addLayer('controller')`);
  await js(`window.__l3rd.addLayer('rect')`);
  await js(`(() => { const s = window.__l3rd.state; const ids = Object.keys(s.layers); s.layers[ids[1]].matte = { src: 'title' }; s.backdrop.parent = ids[0]; window.__l3rd.replaceState(JSON.parse(JSON.stringify(s))); })()`);
  let result = '';
  for (const fmt of ['prores', 'mp4']) {
    await js(`document.querySelector('#btnExport').click();
      document.querySelector('input[value=${fmt}]').checked = true;
      document.querySelector('#exportName').value = 'mb-${fmt}';
      document.querySelector('#btnExportGo').click();`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 300));
      const st = await js(`[document.querySelector('#exportProgress span').textContent, document.querySelector('#exportError').hidden ? '' : document.querySelector('#exportError').textContent]`);
      if (st[1]) { console.log(fmt, 'ERROR', st[1]); result = 'FAIL'; break; }
      if (st[0].startsWith('Done')) { console.log(fmt, st[0]); break; }
    }
    await js(`document.querySelector('#exportDialog').close()`);
  }
  console.log('console errors:', errs);
  console.log(result || (errs.length ? 'FAIL' : 'PASS'));
  app.exit(0);
});
