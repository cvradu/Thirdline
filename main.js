// Electron main process: window, file dialogs, preset/font storage, ffmpeg export pipeline.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function ffmpegPath() {
  if (process.env.L3RD_FFMPEG) return process.env.L3RD_FFMPEG;
  let p = require('ffmpeg-static');
  // In a packaged app the binary lives outside the asar archive.
  return p.replace('app.asar', 'app.asar.unpacked');
}

const userDir = () => app.getPath('userData');
const presetsFile = () => path.join(userDir(), 'presets.json');
const fontsDir = () => path.join(userDir(), 'fonts');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0d12',
    title: 'Thirdline',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    rendererReady = true;
    for (const p of pendingOpen.splice(0)) win.webContents.send('project:openPath', p);
  });
  // The page blocks unload when there are unsaved changes; ask before discarding them.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Discard changes', 'Cancel'], defaultId: 1, cancelId: 1,
      message: 'You have unsaved changes.', detail: 'Close without saving your project?',
    });
    if (choice === 0) e.preventDefault();
  });
  if (process.env.L3RD_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
}

// ---------- Opening .l3rd files (double-click / drag onto the app icon) ----------
let rendererReady = false;
const pendingOpen = [];
function requestOpen(p) {
  if (!p || !/\.(l3rd|json)$/i.test(p)) return;
  if (win && rendererReady) { win.webContents.send('project:openPath', p); win.show(); }
  else pendingOpen.push(p);
}
app.on('open-file', (e, p) => { e.preventDefault(); requestOpen(p); });
process.argv.slice(1).forEach(requestOpen);
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => { argv.slice(1).forEach(requestOpen); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function buildMenu() {
  const send = (cmd) => () => win && win.webContents.send('menu', cmd);
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: send('new') },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
      { role: 'recentDocuments', visible: isMac, submenu: [{ role: 'clearRecentDocuments' }] },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
      { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: send('saveAs') },
      { type: 'separator' },
      { label: 'Export Video…', accelerator: 'CmdOrCtrl+E', click: send('export') },
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- Presets ----------
function readPresets() {
  try { return JSON.parse(fs.readFileSync(presetsFile(), 'utf8')); } catch { return []; }
}
function writePresets(list) {
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(presetsFile(), JSON.stringify(list, null, 2));
}
ipcMain.handle('presets:list', () => readPresets());
ipcMain.handle('presets:save', (_e, name, state) => {
  const list = readPresets().filter((p) => p.name !== name);
  list.push({ name, state, savedAt: new Date().toISOString() });
  list.sort((a, b) => a.name.localeCompare(b.name));
  writePresets(list);
  return list;
});
ipcMain.handle('presets:delete', (_e, name) => {
  const list = readPresets().filter((p) => p.name !== name);
  writePresets(list);
  return list;
});
ipcMain.handle('presets:exportFile', async (_e, name, state) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: `${name || 'lower-third'}.l3rd.json`, filters: [{ name: 'Lower third preset', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, JSON.stringify({ name, state }, null, 2));
  return r.filePath;
});
ipcMain.handle('presets:importFile', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Lower third preset', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
});

// ---------- User fonts (persisted in userData/fonts) ----------
function fontEntry(file) {
  const full = path.join(fontsDir(), file);
  const family = path.basename(file, path.extname(file)).replace(/[-_]+/g, ' ').trim();
  return { family, file, data: fs.readFileSync(full) };
}
ipcMain.handle('fonts:list', () => {
  try {
    return fs.readdirSync(fontsDir()).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f)).map(fontEntry);
  } catch { return []; }
});
ipcMain.handle('fonts:import', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }] });
  if (r.canceled) return [];
  fs.mkdirSync(fontsDir(), { recursive: true });
  return r.filePaths.map((src) => {
    const file = path.basename(src);
    fs.copyFileSync(src, path.join(fontsDir(), file));
    return fontEntry(file);
  });
});
ipcMain.handle('fonts:remove', (_e, file) => {
  try { fs.unlinkSync(path.join(fontsDir(), path.basename(file))); return true; } catch { return false; }
});

// ---------- Export ----------
const FORMATS = {
  prores: { ext: 'mov', label: 'QuickTime MOV · ProRes 4444 (alpha)' },
  webm: { ext: 'webm', label: 'WebM · VP9 (alpha)' },
  png: { ext: null, label: 'PNG sequence (alpha)' },
  mp4: { ext: 'mp4', label: 'MP4 · H.264 (no alpha)' },
};

function ffmpegArgs(format, w, h, fps, out) {
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-framerate', String(fps), '-i', 'pipe:0'];
  const bt709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  const yuvScale = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv'];
  switch (format) {
    case 'prores':
      return [...input, ...yuvScale, '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', ...bt709, out];
    case 'webm':
      return [...input, ...yuvScale, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '18', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-auto-alt-ref', '0', ...bt709, out];
    case 'mp4':
      return [...input, ...yuvScale, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', '-movflags', '+faststart', ...bt709, out];
    case 'png':
      return [...input, '-c:v', 'png', '-pix_fmt', 'rgba', '-start_number', '0', path.join(out, 'frame_%05d.png')];
    default:
      throw new Error('Unknown format ' + format);
  }
}

ipcMain.handle('export:chooseDest', async (_e, format, baseName) => {
  const f = FORMATS[format];
  if (!f) throw new Error('Unknown format');
  if (!f.ext) {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the PNG sequence', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return path.join(r.filePaths[0], baseName || 'lower-third');
  }
  const r = await dialog.showSaveDialog(win, { defaultPath: `${baseName || 'lower-third'}.${f.ext}`, filters: [{ name: f.label, extensions: [f.ext] }] });
  return r.canceled ? null : r.filePath;
});

const jobs = new Map();
let jobSeq = 0;

function startJob({ format, out, width, height, fps }) {
  if (format === 'png') fs.mkdirSync(out, { recursive: true });
  const args = ffmpegArgs(format, width, height, fps, out);
  const proc = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  const job = { proc, log: '', out, format, done: null, error: null };
  proc.stderr.on('data', (d) => { job.log += d.toString(); });
  proc.stdin.on('error', (err) => { job.error = err; });
  job.done = new Promise((resolve) => {
    proc.on('error', (err) => { job.error = err; resolve(-1); });
    proc.on('close', (code) => resolve(code));
  });
  const id = ++jobSeq;
  jobs.set(id, job);
  return id;
}
ipcMain.handle('export:start', (_e, opts) => startJob(opts));
ipcMain.handle('export:frame', (_e, id, data) => {
  const job = jobs.get(id);
  if (!job) throw new Error('No such export job');
  if (job.error) throw new Error('ffmpeg failed: ' + (job.log || job.error.message));
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return new Promise((resolve, reject) => {
    const ok = job.proc.stdin.write(buf, (err) => (err ? reject(new Error('ffmpeg failed: ' + (job.log || err.message))) : null));
    if (ok) resolve(true);
    else job.proc.stdin.once('drain', () => resolve(true));
  });
});
ipcMain.handle('export:finish', async (_e, id) => {
  const job = jobs.get(id);
  if (!job) throw new Error('No such export job');
  job.proc.stdin.end();
  const code = await job.done;
  jobs.delete(id);
  if (code !== 0) throw new Error(`ffmpeg exited with code ${code}\n${job.log}`);
  return { out: job.out };
});
ipcMain.handle('export:cancel', async (_e, id) => {
  const job = jobs.get(id);
  if (!job) return;
  try { job.proc.stdin.destroy(); job.proc.kill('SIGKILL'); } catch {}
  await job.done;
  jobs.delete(id);
  try { if (job.format === 'png') fs.rmSync(job.out, { recursive: true, force: true }); else fs.rmSync(job.out, { force: true }); } catch {}
});
// ---------- Project files (.l3rd) ----------
const PROJECT_FILTERS = [{ name: 'Thirdline project', extensions: ['l3rd'] }];
ipcMain.handle('project:save', async (_e, filePath, json, suggestedName) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, { title: 'Save project', defaultPath: `${suggestedName || 'Untitled'}.l3rd`, filters: PROJECT_FILTERS });
    if (r.canceled || !r.filePath) return null;
    target = /\.l3rd$/i.test(r.filePath) ? r.filePath : `${r.filePath}.l3rd`;
  }
  fs.writeFileSync(target, json);
  app.addRecentDocument(target);
  return target;
});
ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open project', properties: ['openFile'], filters: [{ name: 'Thirdline project', extensions: ['l3rd', 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  app.addRecentDocument(r.filePaths[0]);
  return { path: r.filePaths[0], text: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('project:read', (_e, p) => { app.addRecentDocument(p); return { path: p, text: fs.readFileSync(p, 'utf8') }; });
ipcMain.handle('fonts:installData', (_e, file, data) => {
  fs.mkdirSync(fontsDir(), { recursive: true });
  const dest = path.join(fontsDir(), path.basename(file));
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, Buffer.from(data));
  return true;
});
ipcMain.handle('fonts:read', (_e, file) => {
  try { return fs.readFileSync(path.join(fontsDir(), path.basename(file))); } catch { return null; }
});

ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), ffmpeg: ffmpegPath(), platform: process.platform }));

module.exports = { ffmpegArgs };
