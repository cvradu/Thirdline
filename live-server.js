// Local HTTP server for live output: an OBS browser source loads /live, the app pushes the design
// and cues (in / out / play / cut) to it over server-sent events. Cues can also be triggered by
// plain HTTP requests, e.g. from a Stream Deck: GET /cue/in, /cue/out, /cue/toggle.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

function createLiveServer({ srcDir, fontsDir, onCue }) {
  let server = null, port = 0, lastState = null, lastFonts = [];
  const clients = new Set();
  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const broadcast = (event, data) => { for (const c of clients) send(c, event, data); };
  function serveFile(res, file) {
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }
  // Resolve a URL path inside a base folder, refusing anything that escapes it.
  const inside = (base, rel) => { const p = path.resolve(base, '.' + path.sep + rel); return p.startsWith(path.resolve(base) + path.sep) ? p : null; };
  function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '/live' || p === '/live/') return serveFile(res, path.join(srcDir, 'live', 'index.html'));
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      if (lastState) send(res, 'state', { state: lastState, fonts: lastFonts });
      req.on('close', () => clients.delete(res));
      return;
    }
    const cueM = p.match(/^\/cue\/(in|out|play|cut|toggle)$/);
    if (cueM) { broadcast('cue', { action: cueM[1] }); onCue && onCue(cueM[1]); res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    let f = null;
    if (p.startsWith('/app/')) f = inside(srcDir, p.slice(5));
    else if (p.startsWith('/live/')) f = inside(path.join(srcDir, 'live'), p.slice(6));
    else if (p.startsWith('/fonts/')) f = inside(path.join(srcDir, 'fonts'), p.slice(7));
    else if (p.startsWith('/userfonts/')) f = inside(fontsDir(), p.slice(11));
    if (f) return serveFile(res, f);
    res.writeHead(404); res.end('Not found');
  }
  return {
    start(wantPort = 7461, host = '127.0.0.1') {
      if (server) return Promise.resolve({ port, url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/live` });
      return new Promise((resolve, reject) => {
        const s = http.createServer(handle);
        s.on('error', (e) => {
          if (e.code === 'EADDRINUSE' && wantPort < 7480) { resolve(this.start(wantPort + 1, host)); } else reject(e);
        });
        s.listen(wantPort, host, () => { server = s; port = wantPort; resolve({ port, url: `http://127.0.0.1:${port}/live` }); });
      });
    },
    stop() {
      for (const c of clients) c.end();
      clients.clear();
      if (server) server.close();
      server = null;
    },
    update(state, fonts) { lastState = state; lastFonts = fonts || []; broadcast('state', { state, fonts: lastFonts }); },
    cue(action) { broadcast('cue', { action }); },
    get running() { return !!server; },
    get clients() { return clients.size; },
  };
}
module.exports = { createLiveServer };
