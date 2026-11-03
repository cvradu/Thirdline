// Live output page (OBS browser source). Gets the design and cues from the Thirdline app over
// server-sent events, and plays the lower third in real time on a transparent background.
(function () {
  const cv = document.getElementById('out'), ctx = cv.getContext('2d');
  const statusEl = document.getElementById('status');
  const showStatus = new URLSearchParams(location.search).has('status');
  let state = null, mode = 'idle', t = 0, last = performance.now();
  const loaded = new Set();

  async function loadUserFonts(list) {
    for (const f of list || []) {
      if (loaded.has(f.file)) continue;
      loaded.add(f.file);
      try { const face = new FontFace(f.family, `url(/userfonts/${encodeURIComponent(f.file)})`); await face.load(); document.fonts.add(face); } catch {}
    }
  }
  async function ensureFonts(s) {
    const texts = [s.title, s.subtitle, ...Object.values(s.layers || {}).filter((l) => l.kind === 'text')].filter((x) => x && x.text);
    await Promise.all(texts.map((x) => document.fonts.load(`${x.italic ? 'italic ' : ''}${x.weight} ${x.size}px "${x.font}"`, x.text).catch(() => {})));
    await Engine.imagesReady(s);
  }
  // Key times: when every layer has finished animating in, and when the first one starts going out.
  function marks(s) {
    const D = s.comp.duration;
    const ids = Engine.layerOrder(s).filter((id) => { const l = Engine.getLayer(s, id); return l && l.anim && l.visible !== false; });
    let hold = 0, outS = D;
    for (const id of ids) {
      const sp = Engine.timingSpans(Engine.getLayer(s, id).anim, D);
      hold = Math.max(hold, sp.inEnd); outS = Math.min(outS, sp.outStart);
    }
    return { hold: Math.min(hold, D), outS: Math.max(outS, Math.min(hold, D)), D };
  }
  function cue(action) {
    if (!state) return;
    const m = marks(state);
    if (action === 'in') { mode = 'in'; t = 0; }
    else if (action === 'out') { if (mode === 'in' || mode === 'hold') { mode = 'out'; t = Math.max(t, m.outS); } }
    else if (action === 'play') { mode = 'full'; t = 0; }
    else if (action === 'cut') { mode = 'idle'; }
    else if (action === 'toggle') cue(mode === 'idle' || mode === 'out' ? 'in' : 'out');
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (state) {
      const m = marks(state);
      if (mode === 'in') { t += dt; if (t >= m.hold) { mode = 'hold'; t = m.hold; } }
      else if (mode === 'hold') {
        // While on air, keep looping the hold section so animated gradients and keyframes keep moving.
        t += dt; if (t >= m.outS - 1 / state.comp.fps) t = m.outS - m.hold > 0.2 ? m.hold : Math.min(t, m.outS);
      } else if (mode === 'out' || mode === 'full') { t += dt; if (t >= m.D) { mode = 'idle'; } }
      if (cv.width !== state.comp.width) { cv.width = state.comp.width; cv.height = state.comp.height; }
      if (mode === 'idle') ctx.clearRect(0, 0, cv.width, cv.height);
      else Engine.renderFrame(ctx, state, Math.min(t, m.D), { samples: 6 });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  Engine.onImageLoad = () => {};

  function connect() {
    const es = new EventSource('/events');
    es.onopen = () => { statusEl.hidden = !showStatus; statusEl.textContent = 'Connected'; };
    es.onerror = () => { statusEl.hidden = false; statusEl.textContent = 'Reconnecting to Thirdline…'; };
    es.addEventListener('state', async (e) => {
      const d = JSON.parse(e.data);
      await loadUserFonts(d.fonts);
      const s = Presets.normalize(d.state);
      await ensureFonts(s);
      state = s;
    });
    es.addEventListener('cue', (e) => { cue(JSON.parse(e.data).action); statusEl.textContent = `Cue: ${JSON.parse(e.data).action}`; });
  }
  connect();
  window.__live = { cue, get mode() { return mode; }, get t() { return t; } };
})();
