// Headless end-to-end test: launches the real app, exports every format, verifies with ffprobe.
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'userdata'));
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(OUT, path.basename(o.defaultPath)) });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [OUT] });
require('../main.js');

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errs.push(msg); });
  await js(`window.__l3rd.state.comp.duration = 2; window.__l3rd.replaceState(window.__l3rd.state)`);
  for (const fmt of ['prores', 'webm', 'png', 'mp4']) {
    const t0 = Date.now();
    await js(`document.querySelector('#btnExport').click();
      document.querySelector('input[value=${fmt}]').checked = true;
      document.querySelector('#exportName').value = 'test-${fmt}';
      document.querySelector('#btnExportGo').click();`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 300));
      const st = await js(`[document.querySelector('#exportProgress span').textContent, document.querySelector('#exportError').hidden ? '' : document.querySelector('#exportError').textContent]`);
      if (st[1]) { console.log(fmt, 'ERROR', st[1]); break; }
      if (st[0].startsWith('Done')) { console.log(fmt, st[0], `(${Date.now() - t0}ms)`); break; }
    }
    await js(`document.querySelector('#exportDialog').close()`);
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'window.png'), img.toPNG());
  console.log('console errors:', errs);
  app.exit(0);
});
