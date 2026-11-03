// Electron main process: window, file dialogs, preset/font storage, ffmpeg export pipeline.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { createLiveServer } = require('./live-server');

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
  // Let the page list the fonts installed on this computer (Local Font Access).
  const ses = win.webContents.session;
  ses.setPermissionCheckHandler(() => true);
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
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
      { label: 'Export as .mogrt (via After Effects)…', click: send('mogrt') },
      ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ] },
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: send('duplicate') }, { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Group Layers', accelerator: 'CmdOrCtrl+G', click: send('group') },
      { label: 'Ungroup', accelerator: 'Shift+CmdOrCtrl+G', click: send('ungroup') },
    ] },
    { label: 'View', submenu: [{ label: 'Reset Panel Layout', click: send('resetLayout') }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
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
ipcMain.handle('fonts:openManager', async () => {
  if (process.platform === 'darwin') {
    for (const p of ['/System/Applications/Font Book.app', '/Applications/Font Book.app']) if (fs.existsSync(p)) return (await shell.openPath(p)) === '';
    return false;
  }
  if (process.platform === 'win32') return (await shell.openPath(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'))) === '';
  return false;
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

// Hardware encoders (Apple VideoToolbox). Each candidate is tested once with a tiny encode
// (and, for ProRes, a decode that checks the alpha survived) before it's trusted.
const HW = {
  prores: [
    ['-c:v', 'prores_videotoolbox', '-profile:v', '4444', '-pix_fmt', 'bgra'],
    ['-c:v', 'prores_videotoolbox', '-profile:v', '4444', '-pix_fmt', 'ayuv64le'],
  ],
  mp4: [['-c:v', 'h264_videotoolbox', '-b:v', '24M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']],
};
function ffmpegArgs(format, w, h, fps, out, hw) {
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-framerate', String(fps), '-i', 'pipe:0'];
  const bt709 = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  const yuvScale = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv'];
  if (hw) return [...input, ...hw, ...bt709, out];
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

const run = (args, input, timeout = 15000) => new Promise((resolve) => {
  let out = Buffer.alloc(0), p;
  try { p = spawn(ffmpegPath(), args, { stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return resolve(null); }
  const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, timeout);
  p.stdout.on('data', (d) => { out = Buffer.concat([out, d]); });
  p.stdin.on('error', () => {});
  p.on('error', () => { clearTimeout(t); resolve(null); });
  p.on('close', (code) => { clearTimeout(t); resolve(code === 0 ? out : null); });
  if (input) p.stdin.end(input); else p.stdin.end();
});
const hwCache = {};
async function probeHw(format) {
  if (format in hwCache) return hwCache[format];
  hwCache[format] = null;
  if (process.platform !== 'darwin' || !HW[format]) return null;
  const W = 64, H = 64, frame = Buffer.alloc(W * H * 4);
  for (let i = 0; i < frame.length; i += 4) { frame[i] = 200; frame[i + 1] = 60; frame[i + 2] = 30; frame[i + 3] = 128; }
  const tmp = path.join(app.getPath('temp'), `thirdline-probe-${process.pid}.${FORMATS[format].ext}`);
  for (const cand of HW[format]) {
    const ok = await run(ffmpegArgs(format, W, H, 30, tmp, cand), Buffer.concat([frame, frame]));
    if (!ok || !fs.existsSync(tmp)) continue;
    if (format === 'prores') {
      // Decode it again: the alpha has to come back, or the hardware path isn't usable.
      const dec = await run(['-hide_banner', '-loglevel', 'error', '-i', tmp, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
      if (!dec || dec.length < W * H * 4) continue;
      const a = dec[(32 * W + 32) * 4 + 3];
      if (Math.abs(a - 128) > 12) continue;
    }
    hwCache[format] = cand;
    break;
  }
  try { fs.rmSync(tmp, { force: true }); } catch {}
  return hwCache[format];
}
const ENCODER_NAME = { prores: 'ProRes (software)', webm: 'VP9 (software)', mp4: 'H.264 (software)', png: 'PNG' };
async function startJob({ format, out, width, height, fps, hw }) {
  if (format === 'png') fs.mkdirSync(out, { recursive: true });
  const hwArgs = hw ? await probeHw(format) : null;
  const args = ffmpegArgs(format, width, height, fps, out, hwArgs);
  const proc = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  const job = { proc, log: '', out, format, done: null, error: null, encoder: hwArgs ? `${hwArgs[1].replace('_videotoolbox', '').replace('prores', 'ProRes').replace('h264', 'H.264')} (Apple hardware)` : ENCODER_NAME[format] };
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
// Batch export: one folder, a file per row.
ipcMain.handle('export:chooseFolder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the exported files', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
ipcMain.handle('export:pathIn', (_e, dir, name, format) => {
  const f = FORMATS[format];
  if (!f) throw new Error('Unknown format');
  const safe = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim() || 'lower-third';
  return path.join(dir, f.ext ? `${safe}.${f.ext}` : safe);
});
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
  return { out: job.out, encoder: job.encoder };
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

module.exports = { ffmpegArgs, HW };

// ---------- Live output (OBS browser source) ----------
const live = createLiveServer({
  srcDir: path.join(__dirname, 'src'),
  fontsDir,
  onCue: (action) => win && win.webContents.send('live:cued', action),
});
const userFontList = () => { try { return fs.readdirSync(fontsDir()).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f)).map((file) => ({ file, family: fontEntry(file).family })); } catch { return []; } };
ipcMain.handle('live:start', async (_e, opts = {}) => live.start(opts.port || 7461));
ipcMain.handle('live:stop', () => { live.stop(); return true; });
ipcMain.handle('live:update', (_e, state) => { live.update(state, userFontList()); return live.clients; });
ipcMain.handle('live:cue', (_e, action) => { live.cue(action); return live.clients; });
ipcMain.handle('live:status', () => ({ running: live.running, clients: live.clients }));
app.on('before-quit', () => live.stop());

// ---------- Update check (GitHub releases) ----------
// The app is not signed with an Apple Developer ID, so it can't replace itself; instead it
// tells you a new version exists and opens the right download.
const RELEASES = 'https://api.github.com/repos/cvradu/Thirdline/releases/latest';
const newer = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); } return false; };
ipcMain.handle('update:check', async () => {
  try {
    const r = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Thirdline' } });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const rel = await r.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const ext = process.platform === 'darwin' ? '.dmg' : process.platform === 'win32' ? '.exe' : '.AppImage';
    const asset = (rel.assets || []).find((a) => a.name.endsWith(ext) && (process.platform !== 'darwin' || a.name.includes(arch)));
    return { current: app.getVersion(), latest, available: !!latest && newer(latest, app.getVersion()), url: asset ? asset.browser_download_url : rel.html_url, page: rel.html_url, notes: rel.body || '' };
  } catch (e) { return { error: String(e.message || e) }; }
});
ipcMain.handle('shell:openExternal', (_e, url) => { if (/^https:\/\/github\.com\/cvradu\/Thirdline\//.test(url)) shell.openExternal(url); });

// ---------- Export as .mogrt (via After Effects) ----------
// Thirdline can't write .mogrt files itself (only Adobe's apps can), so it rebuilds the design in
// After Effects with a script and lets After Effects export the template.
const os = require('os');
// The main After Effects app only: the Render Engine (and other helpers) can't run scripts.
const NOT_AE = /render engine|aerender|uninstall|helper|crash|plug-?in/i;
const aeChoiceFile = () => path.join(userDir(), 'after-effects.json');
function aeFromPath(p) {
  const name = path.basename(p).replace(/\.(app|exe)$/i, '');
  return { app: p, name: /afterfx/i.test(name) ? path.basename(path.dirname(path.dirname(p))) : name, chosen: true };
}
function findAfterEffects() {
  if (process.env.L3RD_AE_FAKE) return { app: process.env.L3RD_AE_FAKE, name: 'Adobe After Effects (test)', fake: true };
  // One the user picked by hand wins.
  try { const c = JSON.parse(fs.readFileSync(aeChoiceFile(), 'utf8')); if (c.app && fs.existsSync(c.app)) return aeFromPath(c.app); } catch {}
  const found = [];
  if (process.platform === 'darwin') {
    let dirs = [];
    try { dirs = fs.readdirSync('/Applications').filter((d) => /^Adobe After Effects/i.test(d)); } catch {}
    for (const d of dirs) {
      const dir = path.join('/Applications', d);
      try {
        for (const f of fs.readdirSync(dir)) if (/^Adobe After Effects.*\.app$/i.test(f) && !NOT_AE.test(f)) found.push({ app: path.join(dir, f), name: f.replace(/\.app$/i, '') });
      } catch {}
    }
    for (const d of dirs) if (/\.app$/i.test(d) && !NOT_AE.test(d)) found.push({ app: path.join('/Applications', d), name: d.replace(/\.app$/i, '') });
  } else if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramW6432']].filter(Boolean);
    for (const r of [...new Set(roots)]) {
      const adobe = path.join(r, 'Adobe');
      let dirs = [];
      try { dirs = fs.readdirSync(adobe).filter((d) => /^Adobe After Effects/i.test(d) && !NOT_AE.test(d)); } catch {}
      for (const d of dirs) {
        const exe = path.join(adobe, d, 'Support Files', 'AfterFX.exe');
        if (fs.existsSync(exe)) found.push({ app: exe, name: d });
      }
    }
  }
  // Newest first ("2025" > "2024" > "CC 2019"); betas after releases.
  const year = (n) => +((n.match(/(20\d\d)/) || [])[1] || 0);
  const beta = (n) => (/beta/i.test(n) ? 1 : 0);
  found.sort((a, b) => beta(a.name) - beta(b.name) || year(b.name) - year(a.name) || b.name.localeCompare(a.name));
  return found[0] || null;
}
ipcMain.handle('mogrt:findAE', () => findAfterEffects());
ipcMain.handle('mogrt:chooseAE', async () => {
  const mac = process.platform === 'darwin';
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose After Effects', defaultPath: mac ? '/Applications' : (process.env.ProgramFiles || 'C:\\Program Files') + '\\Adobe',
    properties: ['openFile'], filters: mac ? [{ name: 'Applications', extensions: ['app'] }] : [{ name: 'AfterFX.exe', extensions: ['exe'] }],
  });
  if (r.canceled || !r.filePaths[0]) return findAfterEffects();
  const p = r.filePaths[0];
  if (NOT_AE.test(path.basename(p))) return { error: `${path.basename(p)} can't run scripts. Pick “Adobe After Effects 20xx” itself.` };
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(aeChoiceFile(), JSON.stringify({ app: p }));
  return aeFromPath(p);
});

// PostScript name (name ID 6) of a .ttf / .otf file.
function fontPostScriptName(buf) {
  try {
    const n = buf.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const rec = 12 + i * 16;
      if (buf.toString('ascii', rec, rec + 4) !== 'name') continue;
      const off = buf.readUInt32BE(rec + 8);
      const count = buf.readUInt16BE(off + 2), strOff = off + buf.readUInt16BE(off + 4);
      let best = null;
      for (let j = 0; j < count; j++) {
        const r = off + 6 + j * 12;
        const platform = buf.readUInt16BE(r), id = buf.readUInt16BE(r + 6), len = buf.readUInt16BE(r + 8), o = strOff + buf.readUInt16BE(r + 10);
        if (id !== 6) continue;
        if (platform === 3 || platform === 0) {
          let s = ''; for (let k = 0; k < len; k += 2) s += String.fromCharCode(buf.readUInt16BE(o + k));
          return s;
        }
        if (platform === 1) best = buf.toString('latin1', o, o + len);
      }
      return best;
    }
  } catch {}
  return null;
}
// Families bundled with Thirdline (from src/fonts/fonts.css).
function bundledFamilies() {
  try { return [...new Set([...fs.readFileSync(path.join(__dirname, 'src', 'fonts', 'fonts.css'), 'utf8').matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]))]; } catch { return []; }
}
// Full desktop TTF of a bundled (Google) font, downloaded once and cached.
async function googleFontFile(family, weight, italic) {
  const dir = path.join(userDir(), 'ae-fonts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${family.replace(/\s+/g, '')}-${weight}${italic ? 'i' : ''}.ttf`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@${italic ? 1 : 0},${weight}`, { headers: { 'User-Agent': 'Mozilla/4.0' } })).text();
  const m = css.match(/url\((https:[^)]+\.ttf)\)/);
  if (!m) throw new Error(`Google Fonts has no file for ${family} ${weight}${italic ? ' italic' : ''}`);
  const r = await fetch(m[1]);
  if (!r.ok) throw new Error(`Font download failed (HTTP ${r.status})`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}
function userFontsFolder() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Fonts');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts');
  return path.join(os.homedir(), '.local', 'share', 'fonts');
}
// Resolves every font the design uses to a PostScript name, installing it when asked to.
async function prepareFonts(fonts, install) {
  const bundled = bundledFamilies();
  const notes = [];
  const installed = [];
  for (const f of Object.values(fonts)) {
    let file = null;
    try {
      if (f.userFile) {
        const p = path.join(fontsDir(), path.basename(f.userFile));
        if (/\.(ttf|otf)$/i.test(p) && fs.existsSync(p)) file = p;
        else notes.push(`“${f.family}” was uploaded as a web font (${path.extname(p)}), which After Effects can’t use. Install a .ttf/.otf of it.`);
      } else if (bundled.includes(f.family)) {
        file = await googleFontFile(f.family, f.weight, f.italic);
      }
    } catch (e) { notes.push(`Couldn’t get ${f.family} ${f.style}: ${e.message}`); }
    if (!file) continue;
    f.ps = fontPostScriptName(fs.readFileSync(file)) || null;
    if (install) {
      const dest = path.join(userFontsFolder(), path.basename(file));
      try {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(file, dest);
          installed.push(`${f.family} ${f.style}`);
        }
      } catch (e) { notes.push(`Couldn’t install ${f.family}: ${e.message}`); }
    }
  }
  if (process.platform === 'win32' && installed.length) notes.push('On Windows, newly installed fonts may need a restart of After Effects and Premiere to show up.');
  return { notes, installed };
}
// JSON with every non-ASCII character escaped, so the script reads the same in any encoding.
const asciiJSON = (v) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
function writeDataUrl(dataUrl, dir, base) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/webp': 'png' }[m[1]] || 'png';
  const file = path.join(dir, `${base}.${ext}`);
  fs.writeFileSync(file, m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])));
  return file;
}
function runInAfterEffects(ae, jsx) {
  return new Promise((resolve) => {
    if (ae.fake) return resolve({ ok: true });
    let child;
    if (process.platform === 'darwin') {
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      child = spawn('osascript', ['-e', 'with timeout of 3600 seconds', '-e', `tell application "${esc(ae.app)}"`, '-e', 'activate', '-e', `DoScriptFile "${esc(jsx)}"`, '-e', 'end tell', '-e', 'end timeout']);
    } else if (process.platform === 'win32') {
      child = spawn(ae.app, ['-r', jsx], { detached: true, stdio: 'ignore' });
      child.unref();
      return resolve({ ok: true });
    } else return resolve({ error: 'After Effects only runs on macOS and Windows.' });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    // osascript waits until the script finishes (it shows dialogs), so only report early failures.
    const timer = setTimeout(() => resolve({ ok: true }), 8000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code && err) {
        const denied = /-1743|not authori[sz]ed|Not allowed/i.test(err);
        const noScripts = /-2741|-1708|-1728|doesn.t understand/i.test(err);
        resolve({ error: denied ? 'macOS blocked Thirdline from controlling After Effects. Allow it in System Settings › Privacy & Security › Automation, then try again.'
          : noScripts ? `“${ae.name}” didn't accept the script. Use “Change…” to pick the After Effects app itself (not the Render Engine). (${err.trim()})` : err.trim() });
      } else resolve({ ok: true });
    });
  });
}
ipcMain.handle('mogrt:export', async (_e, { scene, images, installFonts }) => {
  const ae = findAfterEffects();
  if (!ae) return { error: 'no-ae' };
  const dir = path.join(userDir(), 'mogrt', String(Date.now()));
  fs.mkdirSync(dir, { recursive: true });
  scene.imageFiles = {};
  for (const [id, src] of Object.entries(images || {})) {
    const f = writeDataUrl(src, dir, id);
    if (f) scene.imageFiles[id] = f;
  }
  const fontInfo = await prepareFonts(scene.fonts, installFonts);
  scene.warnings = [...scene.warnings, ...fontInfo.notes];
  const template = fs.readFileSync(path.join(__dirname, 'src', 'ae', 'thirdline-build.jsx'), 'utf8');
  const jsx = path.join(dir, 'thirdline-build.jsx');
  fs.writeFileSync(jsx, `var SCENE = ${asciiJSON(scene)};\n${template}`);
  const r = await runInAfterEffects(ae, jsx);
  return { ...r, ae: ae.name, installed: fontInfo.installed, notes: fontInfo.notes, script: jsx };
});
ipcMain.handle('mogrt:revealScript', (_e, p) => { if (p && p.startsWith(path.join(userDir(), 'mogrt'))) shell.showItemInFolder(p); });
