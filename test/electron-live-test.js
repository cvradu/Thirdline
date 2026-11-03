// Electron: live server starts from the app and the update check answers.
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.setPath('userData', path.join(__dirname, 'out3'));
require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await sleep(1800);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(code);
  const r = await js(`window.api.live.start({}).then(async (r) => { await window.api.live.update(window.__l3rd.state); return r; })`);
  console.log('live', JSON.stringify(r));
  const html = await (await fetch(r.url)).text();
  console.log('live page served', html.includes('Thirdline live'));
  console.log('cue', await js(`window.api.live.cue('in')`));
  console.log('update', JSON.stringify(await js(`window.api.updates.check()`)).slice(0, 300));
  app.exit(0);
});
