// Headless test: save a .l3rd project, change things, reopen it, and export a keyframed/gradient design.
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'out2');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'userdata'));
dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(OUT, path.basename(o.defaultPath)) });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [OUT] });
dialog.showMessageBoxSync = () => 0;
require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1800);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errs.push(msg); });
  await js(`(() => { const s = window.__l3rd.state; s.title.text = 'Round Trip'; s.backdrop.fillType = 'fourPoint'; s.backdrop.gradAnim = 'swirl';
    s.keys = { 'title.transform.rotation': [{ t: 1, v: 0, e: 'easeInOutCubic' }, { t: 2, v: 10, e: 'linear' }] }; s.comp.duration = 2; window.__l3rd.replaceState(s); })()`);
  await js(`document.querySelector('#btnSave').click()`);
  await sleep(800);
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.l3rd'));
  console.log('saved files:', files, 'title:', win.getTitle());
  await js('void (window.confirm = () => true)');
  await js(`(() => { const s = window.__l3rd.state; s.title.text = 'Changed'; window.__l3rd.replaceState(s); })()`);
  win.webContents.send('project:openPath', path.join(OUT, files[0]));
  await sleep(1000);
  console.log('after reopen:', await js(`JSON.stringify([window.__l3rd.state.title.text, window.__l3rd.state.backdrop.fillType, Object.keys(window.__l3rd.state.keys)])`), 'title:', win.getTitle());
  await js(`document.querySelector('#btnExport').click(); document.querySelector('input[value=prores]').checked = true; document.querySelector('#exportName').value = 'kf'; document.querySelector('#btnExportGo').click();`);
  for (let i = 0; i < 200; i++) {
    await sleep(300);
    const st = await js(`[document.querySelector('#exportProgress span').textContent, document.querySelector('#exportError').hidden ? '' : document.querySelector('#exportError').textContent]`);
    if (st[1]) { console.log('ERROR', st[1]); break; }
    if (st[0].startsWith('Done')) { console.log('export', st[0]); break; }
  }
  console.log('console errors:', errs);
  app.exit(0);
});
