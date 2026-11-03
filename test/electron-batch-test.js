// Electron: batch export from CSV (one ProRes per row, with alpha) and live output toggle.
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const OUT = path.join(__dirname, 'out4');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'userdata'));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [OUT] });
require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', (e) => { console.log('ERR', e); app.exit(1); });
app.whenReady().then(async () => {
  await sleep(2000);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  const errs = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) errs.push(msg); });
  await js(`(() => { const s = window.__l3rd.state; s.comp.duration = 1; s.comp.width = 640; s.comp.height = 360; s.layout.x = 48; s.layout.y = 324; window.__l3rd.replaceState(s); })()`);
  await js(`window.__l3rd.openBatch(); window.__l3rd.loadCSV('Name,Role\\nAna Pop,Producer\\n"Ion, Jr.",Editor\\n', 'people.csv')`);
  console.log('mapped rows', await js(`document.querySelectorAll('#batchList div').length`));
  await js(`document.querySelector('#batchFmt').value = 'prores'; document.querySelector('#batchGo').click()`);
  for (let i = 0; i < 60 && !(await js(`document.querySelector('#batchProgress span').textContent`)).startsWith('Done'); i++) await sleep(500);
  console.log('batch:', await js(`document.querySelector('#batchProgress span').textContent`));
  const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.mov'));
  console.log('files', files);
  console.log('sizes', files.map((f) => fs.statSync(path.join(OUT, f)).size));
  // live
  await js(`document.querySelector('#batchDialog').close(); document.querySelector('#btnLive').click(); document.querySelector('#liveStart').click()`);
  await sleep(800);
  const url = await js(`document.querySelector('#liveUrl').textContent`);
  console.log('live url', url, 'button', await js(`document.querySelector('#btnLive').textContent`));
  const r = await fetch(url.replace('/live', '/cue/in'));
  console.log('cue status', r.status);
  console.log('console errors', errs);
  app.exit(0);
});
