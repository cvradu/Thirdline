// Electron: "Export as .mogrt" writes the After Effects script, downloads the fonts and reads
// their PostScript names. After Effects itself is faked (L3RD_AE_FAKE), so nothing is launched.
// Run: L3RD_AE_FAKE=1 xvfb-run npx electron --no-sandbox test/electron-mogrt-test.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.setPath('userData', path.join(__dirname, 'out5'));
process.env.L3RD_AE_FAKE = process.env.L3RD_AE_FAKE || '1';
require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('unhandledRejection', (e) => { console.log('FAIL', e); app.exit(1); });
app.whenReady().then(async () => {
  await sleep(1800);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  console.log('findAE', JSON.stringify(await js('window.api.mogrt.findAE()')));
  await js(`window.__l3rd.openMogrt()`);
  await sleep(300);
  await js(`document.querySelector('#mogrtFonts').checked = false; document.querySelector('#mogrtGo').click()`);
  let status = '';
  for (let i = 0; i < 60 && !/building|Error|error/.test(status); i++) { await sleep(500); status = await js(`document.querySelector('#mogrtStatus').textContent + ' ' + (document.querySelector('#mogrtError').hidden ? '' : 'Error: ' + document.querySelector('#mogrtError').textContent)`); }
  console.log('status:', status);
  const dir = path.join(__dirname, 'out5', 'mogrt');
  const last = fs.readdirSync(dir).sort().pop();
  const jsx = fs.readFileSync(path.join(dir, last, 'thirdline-build.jsx'), 'utf8');
  const scene = JSON.parse(jsx.slice('var SCENE = '.length, jsx.indexOf(';\n')));
  console.log('fonts:', JSON.stringify(Object.values(scene.fonts).map((f) => `${f.family} ${f.style} → ${f.ps}`)));
  console.log('ascii only:', /^[\x00-\x7f]*$/.test(jsx));
  console.log('warnings:', scene.warnings);
  const ok = Object.values(scene.fonts).every((f) => f.ps) && /^[\x00-\x7f]*$/.test(jsx);
  console.log(ok ? 'PASS' : 'FAIL');
  app.exit(0);
});
