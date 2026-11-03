/* Thirdline — editor UI. Depends on Easing, Engine, Presets globals. */
(function () {
  'use strict';
  const { EASING_LABELS, getEasing } = window.Easing;
  const { BACKDROP_ANIMS, TEXT_ANIMS, SHAPES } = window.Engine;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const setPath = (obj, path, val) => {
    const ks = path.split('.'); const last = ks.pop();
    const target = ks.reduce((o, k) => (o[k] ??= {}), obj);
    target[last] = val;
  };

  // ---------- Platform API (Electron preload) with a browser fallback ----------
  const api = window.api || browserStub();
  function browserStub() {
    const KEY = 'l3rd:presets';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
    const write = (l) => (localStorage.setItem(KEY, JSON.stringify(l)), l);
    return {
      browser: true,
      presets: {
        list: async () => read(),
        save: async (name, state) => write([...read().filter((p) => p.name !== name), { name, state }].sort((a, b) => a.name.localeCompare(b.name))),
        remove: async (name) => write(read().filter((p) => p.name !== name)),
        exportFile: async (name, state) => { download(`${name}.l3rd.json`, new Blob([JSON.stringify({ name, state }, null, 2)])); return name; },
        importFile: () => pickFile('.json').then(async (f) => (f ? JSON.parse(await f.text()) : null)),
      },
      fonts: {
        list: async () => [],
        import: () => pickFile('.ttf,.otf,.woff,.woff2').then(async (f) => (f ? [{ family: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), file: f.name, data: await f.arrayBuffer() }] : [])),
        remove: async () => true,
      },
      exporter: null,
      project: {
        save: async (_p, json, name) => { download(`${name || 'Untitled'}.l3rd`, new Blob([json], { type: 'application/json' })); return `${name || 'Untitled'}.l3rd`; },
        open: () => pickFile('.l3rd,.json').then(async (f) => (f ? { path: f.name, text: await f.text() } : null)),
        read: async () => null,
        onOpenPath: () => {},
      },
      onMenu: () => {},
      reveal: async () => {},
      info: async () => ({ platform: 'browser' }),
    };
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const i = el('input', { type: 'file', accept });
      i.onchange = () => resolve(i.files[0] || null);
      i.click();
    });
  }
  function download(name, blob) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Fonts ----------
  const BUILTIN_FONTS = {
    Inter: [400, 500, 600, 700, 800, 900],
    Montserrat: [400, 500, 600, 700, 800, 900],
    Poppins: [400, 500, 600, 700, 800, 900],
    'Space Grotesk': [400, 500, 600, 700],
    Lato: [400, 700, 900],
    'Roboto Condensed': [400, 500, 600, 700, 800, 900],
    'Barlow Condensed': [400, 500, 600, 700, 800, 900],
    Oswald: [400, 500, 600, 700],
    'Bebas Neue': [400],
    Anton: [400],
    'Playfair Display': [400, 500, 600, 700, 800, 900],
    'DM Serif Display': [400],
  };
  const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Impact', 'Courier New'];
  const userFonts = []; // {family, file}

  async function addUserFont(f) {
    if (userFonts.some((u) => u.family === f.family)) return f.family;
    try {
      const face = new FontFace(f.family, f.data);
      await face.load();
      document.fonts.add(face);
      userFonts.push({ family: f.family, file: f.file, data: f.data });
    } catch (e) {
      toast(`Could not load font ${f.file}: ${e.message}`);
      return null;
    }
    return f.family;
  }
  async function ensureFonts(s = state) {
    const loads = [s.title, s.subtitle].filter((t) => t.text).map((t) =>
      document.fonts.load(`${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px "${t.font}"`, t.text + 'Hgjpqy').catch(() => {}));
    await Promise.all(loads);
  }

  // ---------- State, history, autosave ----------
  let state = loadAutosave() || Presets.defaultState();
  let history = [JSON.stringify(state)], histIndex = 0, histTimer = null, saveTimer = null;
  function loadAutosave() {
    try { const s = localStorage.getItem('l3rd:last'); return s ? Presets.normalize(JSON.parse(s)) : null; } catch { return null; }
  }
  function changed({ sync = false, record = true } = {}) {
    if (sync) syncControls();
    refreshVisibility();
    ensureFonts().then(drawPreview);
    drawPreview();
    resizeTimeline();
    updateKeyBar();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem('l3rd:last', JSON.stringify(state)); } catch {} }, 400);
    if (record) {
      setDirty(true);
      clearTimeout(histTimer);
      histTimer = setTimeout(pushHistory, 350);
    }
  }
  function pushHistory() {
    const snap = JSON.stringify(state);
    if (snap === history[histIndex]) return;
    history = history.slice(0, histIndex + 1);
    history.push(snap);
    if (history.length > 200) history.shift();
    histIndex = history.length - 1;
  }
  function undo() { clearTimeout(histTimer); pushHistory(); if (histIndex > 0) { state = JSON.parse(history[--histIndex]); changed({ sync: true, record: false }); } }
  function redo() { if (histIndex < history.length - 1) { state = JSON.parse(history[++histIndex]); changed({ sync: true, record: false }); } }
  function replaceState(next) { state = Presets.normalize(next); changed({ sync: true }); setTime(Math.min(time, state.comp.duration)); }

  // ---------- Keyframes ----------
  const LAYER_NAMES = { backdrop: 'Backdrop', title: 'Title', subtitle: 'Subtitle', layout: 'Position', comp: 'Canvas' };
  const keyLabels = {};
  let selKey = null; // { path, k } (k = keyframe object)
  const fpsT = (t) => Math.round(t * state.comp.fps) / state.comp.fps;
  const keysOf = (path) => (state.keys && state.keys[path]) || null;
  const isKeyed = (path) => !!(keysOf(path) && keysOf(path).length);
  const keyIndexAt = (path, t) => (keysOf(path) || []).findIndex((k) => Math.abs(k.t - t) < 0.5 / state.comp.fps);
  function valueNow(path) { return isKeyed(path) ? Engine.valueAtKeys(keysOf(path), time) : getPath(state, path); }
  function sortKeys(path) { keysOf(path)?.sort((a, b) => a.t - b.t); }
  function setKey(path, t, v) {
    state.keys ??= {};
    const ks = (state.keys[path] ??= []);
    const i = keyIndexAt(path, t);
    if (i >= 0) ks[i].v = v; else ks.push({ t: fpsT(t), v, e: 'easeInOutCubic' });
    sortKeys(path);
  }
  function removeKey(path, k) {
    const ks = keysOf(path); if (!ks) return;
    const v = Engine.valueAtKeys(ks, k.t);
    ks.splice(ks.indexOf(k), 1);
    if (!ks.length) { delete state.keys[path]; setPath(state, path, v); }
    if (selKey && selKey.k === k) selKey = null;
  }
  // Writes a value, keyframing it at the playhead if that property is animated.
  function setValue(path, v) {
    if (isKeyed(path)) setKey(path, time, v); else setPath(state, path, v);
  }
  function toggleKey(path) {
    if (!isKeyed(path)) { setKey(path, time, getPath(state, path)); toast(`Keyframe added · ${keyLabels[path] || path}`); }
    else {
      const i = keyIndexAt(path, time);
      if (i >= 0) removeKey(path, keysOf(path)[i]);
      else setKey(path, time, valueNow(path));
    }
    changed({ sync: true });
  }
  function clearKeys(prefix) {
    for (const p of Object.keys(state.keys || {})) if (p.startsWith(prefix)) { const v = valueNow(p); delete state.keys[p]; setPath(state, p, v); }
    selKey = null;
  }
  let advanced = false;
  try { advanced = localStorage.getItem('thirdline:advanced') === '1'; } catch {}
  function setAdvanced(on) {
    advanced = on; document.body.classList.toggle('advanced', on);
    $('#optAdvanced').checked = on;
    try { localStorage.setItem('thirdline:advanced', on ? '1' : '0'); } catch {}
    resizeTimeline();
  }

  // Recently used colours (shared by every colour control)
  let recentColors = [];
  try { recentColors = JSON.parse(localStorage.getItem('thirdline:recentColors')) || []; } catch {}
  const recentSwatchSets = [];
  function rememberColor(c) {
    if (!/^#[0-9a-f]{6}$/i.test(c)) return;
    recentColors = [c, ...recentColors.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 12);
    try { localStorage.setItem('thirdline:recentColors', JSON.stringify(recentColors)); } catch {}
    recentSwatchSets.forEach((f) => f());
  }

  // ---------- Generic control rows ----------
  const controls = []; // {sync(), def, rowEl}
  const optionsFor = (o) => (typeof o === 'function' ? o() : o);

  function fillSelect(sel, options) {
    const cur = sel.value;
    sel.innerHTML = '';
    const add = (parent, value, label) => parent.append(el('option', { value }, label));
    if (Array.isArray(options)) {
      for (const g of options) {
        if (g.group) { const og = el('optgroup', { label: g.group }); for (const [v, l] of g.items) add(og, v, l); sel.append(og); }
        else add(sel, g[0], g[1]);
      }
    } else for (const [v, l] of Object.entries(options)) add(sel, v, l);
    sel.value = cur;
  }

  function row(def) {
    const ctl = el('div', { class: 'ctl' });
    let kf = null;
    if (def.key) {
      const layer = def.path.split('.')[0];
      keyLabels[def.path] = `${LAYER_NAMES[layer] || layer} · ${def.keyLabel || def.label}`;
      kf = el('button', { type: 'button', class: 'kf', title: 'Keyframe: add/remove a keyframe at the playhead', onclick: () => toggleKey(def.path) });
    }
    const r = el('div', { class: 'row' + (def.key ? ' keyable' : '') }, el('label', {}, kf, def.label), ctl);
    let sync = () => {};
    const val = () => (def.key ? valueNow(def.path) : getPath(state, def.path));
    const set = (v) => { if (def.key) setValue(def.path, v); else setPath(state, def.path, v); def.onSet?.(v); changed(); };
    switch (def.type) {
      case 'text': {
        const i = el('input', { type: 'text', placeholder: def.placeholder || '' });
        i.addEventListener('input', () => set(i.value));
        ctl.append(i); sync = () => { if (document.activeElement !== i) i.value = val() ?? ''; };
        break;
      }
      case 'range': {
        const i = el('input', { type: 'range', min: def.min, max: def.max, step: def.step ?? 1 });
        const n = el('input', { type: 'number', min: def.min, max: def.max, step: def.step ?? 1 });
        const scale = def.scale || 1; // UI value = state * scale (e.g. opacity as %)
        i.addEventListener('input', () => { n.value = i.value; set(+i.value / scale); });
        n.addEventListener('input', () => { if (n.value !== '' && !isNaN(+n.value)) { i.value = n.value; set(+n.value / scale); } });
        ctl.append(i, n, ...(def.unit ? [el('span', { class: 'unit' }, def.unit)] : []));
        sync = () => { const v = +((val() ?? 0) * scale).toFixed(4); i.value = v; if (document.activeElement !== n) n.value = v; };
        break;
      }
      case 'number': {
        const n = el('input', { type: 'number', min: def.min, max: def.max, step: def.step ?? 1 });
        n.addEventListener('input', () => { if (n.value !== '' && !isNaN(+n.value)) set(+n.value); });
        ctl.append(n, ...(def.unit ? [el('span', { class: 'unit' }, def.unit)] : []));
        sync = () => { if (document.activeElement !== n) n.value = val(); };
        break;
      }
      case 'color': {
        const i = el('input', { type: 'color' });
        const hex = el('input', { type: 'text', style: 'width:84px;flex:none' });
        i.addEventListener('input', () => { hex.value = i.value; set(i.value); });
        hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { i.value = hex.value; set(hex.value); } });
        const sw = el('div', { class: 'swatches' });
        for (const c of ['#ffffff', '#111827', '#0f172a', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#22d3ee', '#d4af37', '#cbd5e1']) {
          sw.append(el('span', { style: `background:${c}`, title: c, onclick: () => { i.value = c; hex.value = c; set(c); } }));
        }
        const tools = [];
        if (window.EyeDropper) {
          tools.push(el('button', { type: 'button', class: 'eyedrop', title: 'Pick a colour from anywhere on screen', onclick: async () => {
            try { const r = await new window.EyeDropper().open(); i.value = r.sRGBHex.slice(0, 7); hex.value = i.value; set(i.value); rememberColor(i.value); } catch {}
          } }, '⌖'));
        }
        i.addEventListener('change', () => rememberColor(i.value));
        const recent = el('div', { class: 'swatches recent', title: 'Recent colours' });
        recentSwatchSets.push(() => {
          recent.innerHTML = '';
          for (const c of recentColors) recent.append(el('span', { style: `background:${c}`, title: c, onclick: () => { i.value = c; hex.value = c; set(c); } }));
        });
        recentSwatchSets[recentSwatchSets.length - 1]();
        const wrap = el('div', { style: 'flex:1' }, el('div', { class: 'ctl' }, i, hex, ...tools), def.swatches === false ? null : sw, def.swatches === false ? null : recent);
        ctl.append(wrap);
        sync = () => { i.value = val() || '#000000'; if (document.activeElement !== hex) hex.value = val() || ''; };
        break;
      }
      case 'checkbox': {
        const i = el('input', { type: 'checkbox' });
        i.addEventListener('change', () => set(i.checked));
        ctl.append(el('label', { class: 'chk' }, i, def.text || ''));
        sync = () => { i.checked = !!val(); };
        break;
      }
      case 'select': {
        const s = el('select');
        s.addEventListener('change', () => set(def.numeric ? +s.value : s.value));
        ctl.append(s, ...(def.extra ? def.extra() : []));
        sync = () => { fillSelect(s, optionsFor(def.options)); s.value = String(val()); };
        break;
      }
      case 'buttons': {
        const b = el('div', { class: 'btnrow' });
        for (const [label, fn, title] of def.buttons) b.append(el('button', { type: 'button', title, onclick: fn }, label));
        ctl.append(b);
        break;
      }
      case 'custom': {
        sync = def.render(ctl) || (() => {});
        break;
      }
    }
    if (kf) {
      const inner = sync;
      sync = () => {
        inner();
        const keyed = isKeyed(def.path);
        kf.classList.toggle('animated', keyed);
        kf.classList.toggle('onkey', keyed && keyIndexAt(def.path, time) >= 0);
      };
    }
    const entry = { sync, def, rowEl: r, owner: currentOwner };
    controls.push(entry);
    sync();
    return r;
  }
  function section(title, rows, headerExtra) {
    return el('div', { class: 'section' }, el('h3', {}, title, headerExtra || null), ...rows);
  }
  let currentOwner = null;
  const structureSyncs = [];
  function syncControls() { for (const f of structureSyncs) f(); for (const c of controls) c.sync(); }
  function dropControls(owner) { for (let i = controls.length - 1; i >= 0; i--) if (controls[i].owner === owner) controls.splice(i, 1); }
  function syncKeyable() { for (const c of controls) if (c.def.key) c.sync(); }
  function refreshVisibility() {
    for (const c of controls) if (c.def.show) c.rowEl.classList.toggle('hidden', !c.def.show(state));
  }

  // ---------- Panels ----------
  const fontOptions = () => [
    { group: 'Built-in', items: Object.keys(BUILTIN_FONTS).map((f) => [f, f]) },
    ...(userFonts.length ? [{ group: 'My fonts', items: userFonts.map((f) => [f.family, f.family]) }] : []),
    { group: 'System', items: SYSTEM_FONTS.map((f) => [f, f]) },
  ];
  const weightOptions = (key) => () => {
    const fam = state[key].font;
    const ws = BUILTIN_FONTS[fam] || [100, 200, 300, 400, 500, 600, 700, 800, 900];
    const names = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
    const list = ws.map((w) => [String(w), `${w} · ${names[w]}`]);
    if (!ws.includes(+state[key].weight)) list.push([String(state[key].weight), String(state[key].weight)]);
    return list;
  };

  async function uploadFont(key) {
    const fonts = await api.fonts.import();
    let last = null;
    for (const f of fonts) last = (await addUserFont(f)) || last;
    if (last) {
      state[key].font = last;
      state[key].weight = 400;
      changed({ sync: true });
      toast(`Font “${last}” added`);
    }
  }

  function alignSection() {
    return section('Alignment', [
      row({ label: 'Text align', type: 'custom', render: (ctl) => {
        const opts = [['left', '⟸ Left'], ['center', '≡ Center'], ['right', 'Right ⟹'], ['justify', '☰ Justify']];
        const wrap = el('div', { class: 'seg' });
        const btns = opts.map(([v, l]) => {
          const b = el('button', { type: 'button', title: v, onclick: () => { state.layout.align = v; changed({ sync: true }); } }, l);
          wrap.append(b); return [v, b];
        });
        ctl.append(wrap);
        return () => btns.forEach(([v, b]) => b.classList.toggle('on', state.layout.align === v));
      } }),
      el('div', { class: 'sub' }, 'Justify spreads the letters of each line to fill the box. Set a Fixed or Min width on the Backdrop tab to control how wide.'),
    ]);
  }
  const sectionRefs = {};
  function textSection(key, title) {
    sectionRefs[key] = null;
    const p = (k) => `${key}.${k}`;
    const textual = key === 'title';
    return section(title, [
      row({ label: 'Text', type: 'text', path: p('text'), placeholder: textual ? 'Name' : 'Role / description' }),
      row({ label: 'Font', type: 'select', path: p('font'), options: fontOptions,
        onSet: () => { const ws = BUILTIN_FONTS[state[key].font]; if (ws && !ws.includes(+state[key].weight)) state[key].weight = ws.reduce((a, b) => (Math.abs(b - state[key].weight) < Math.abs(a - state[key].weight) ? b : a)); syncControls(); },
        extra: () => [el('button', { type: 'button', title: 'Upload a .ttf/.otf/.woff font', onclick: () => uploadFont(key) }, 'Upload…')] }),
      row({ label: 'Weight', type: 'select', path: p('weight'), options: weightOptions(key), numeric: true }),
      row({ label: 'Size', type: 'range', path: p('size'), key: true, min: 8, max: 220, unit: 'px' }),
      row({ label: 'Color', type: 'color', path: p('color'), key: true }),
      row({ label: 'Letter spacing', type: 'range', path: p('letterSpacing'), key: true, min: -10, max: 40, step: 0.5, unit: 'px' }),
      row({ label: 'Style', type: 'checkbox', path: p('uppercase'), text: 'UPPERCASE' }),
      row({ label: '', type: 'checkbox', path: p('italic'), text: 'Italic' }),
      row({ label: 'Mask to box', type: 'checkbox', path: p('clipToBox'), text: 'Clip text to backdrop' }),
      row({ label: 'Text shadow', type: 'checkbox', path: p('shadow.on'), text: 'On' }),
      row({ label: 'Shadow color', type: 'color', path: p('shadow.color'), key: true, swatches: false, show: (s) => s[key].shadow.on }),
      row({ label: 'Shadow opacity', type: 'range', path: p('shadow.opacity'), key: true, min: 0, max: 100, scale: 100, unit: '%', show: (s) => s[key].shadow.on }),
      row({ label: 'Shadow blur', type: 'range', path: p('shadow.blur'), key: true, min: 0, max: 60, show: (s) => s[key].shadow.on }),
      row({ label: 'Shadow Y', type: 'range', path: p('shadow.offsetY'), min: -30, max: 30, show: (s) => s[key].shadow.on }),
    ]);
  }

  const isShape = (s) => s.backdrop.type === 'shape';
  const shapeIn = (...names) => (s) => isShape(s) && names.includes(s.backdrop.shape);
  const usesAccent = shapeIn('accent', 'twoTone', 'underline', 'sideBar', 'corners');
  const usesFill = (s) => isShape(s) && !['underline', 'sideBar', 'corners'].includes(s.backdrop.shape);
  const ft = (s) => s.backdrop.fillType || (s.backdrop.gradient ? 'linear' : 'solid');

  // Built-in procedural textures (generated once, stored as PNG data URLs)
  const BUILTIN_TEXTURES = {
    grain: ['Film grain', (g, W, H) => { const d = g.createImageData(W, H); for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 160; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); }],
    paper: ['Paper fibres', (g, W, H) => { g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); for (let i = 0; i < 1600; i++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.18})`; g.lineWidth = Math.random() * 1.5; const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI, l = 4 + Math.random() * 18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }],
    scanlines: ['Scanlines', (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000000'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2); }],
    halftone: ['Halftone dots', (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000000'; for (let y = 0; y < H; y += 10) for (let x = (y / 10) % 2 ? 5 : 0; x < W; x += 10) { const r = 1 + 3.2 * (x / W); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } }],
    stripes: ['Diagonal stripes', (g, W, H) => { g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); g.strokeStyle = '#ffffff'; g.lineWidth = 6; for (let i = -H; i < W + H; i += 18) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); } }],
    brushed: ['Brushed metal', (g, W, H) => { const d = g.createImageData(W, H); for (let y = 0; y < H; y++) { let v = 128; for (let x = 0; x < W; x++) { v += (Math.random() - 0.5) * 18; v = v * 0.96 + 128 * 0.04; const i = (y * W + x) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = v + (Math.random() - 0.5) * 20; d.data[i + 3] = 255; } } g.putImageData(d, 0, 0); }],
  };
  function builtinTexture(key) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    BUILTIN_TEXTURES[key][1](c.getContext('2d'), 256, 256);
    return c.toDataURL('image/png');
  }
  function textureSection() {
    const tx = 'backdrop.texture';
    const has = (s) => s.backdrop.type !== 'none' && !!s.backdrop.texture.src;
    const input = el('input', { type: 'file', accept: 'image/*', hidden: true });
    input.addEventListener('change', () => {
      const f = input.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { Object.assign(state.backdrop.texture, { src: rd.result, name: f.name, enabled: true }); changed({ sync: true }); };
      rd.readAsDataURL(f); input.value = '';
    });
    return section('Texture overlay', [
      el('div', { class: 'sub' }, 'An image blended on top of the backdrop and clipped to its shape (works with shapes, gradients and image backdrops).'),
      row({ label: 'Texture', type: 'custom', show: (s) => s.backdrop.type !== 'none', render: (ctl) => {
        const thumb = el('img', { class: 'thumb', alt: '' });
        const name = el('span', { class: 'sub' });
        const pick = el('select');
        fillSelect(pick, [['', 'Built-in…'], ...Object.entries(BUILTIN_TEXTURES).map(([k, v]) => [k, v[0]])]);
        pick.addEventListener('change', () => {
          if (!pick.value) return;
          Object.assign(state.backdrop.texture, { src: builtinTexture(pick.value), name: BUILTIN_TEXTURES[pick.value][0], enabled: true, fit: 'tile' });
          pick.value = ''; changed({ sync: true });
        });
        ctl.append(el('div', { style: 'flex:1;min-width:0' },
          el('div', { class: 'btnrow' },
            el('button', { type: 'button', onclick: () => input.click() }, 'Upload…'), pick,
            el('button', { type: 'button', onclick: () => { Object.assign(state.backdrop.texture, { src: '', name: '', enabled: false }); changed({ sync: true }); } }, 'Clear')),
          thumb, name), input);
        return () => { const t = state.backdrop.texture; thumb.src = t.src || ''; thumb.hidden = !t.src; name.textContent = t.name || 'No texture'; };
      } }),
      row({ label: 'Show', type: 'checkbox', path: `${tx}.enabled`, text: 'Texture on', show: has }),
      row({ label: 'Blend mode', type: 'select', path: `${tx}.blend`, options: Engine.BLEND_MODES, show: has }),
      row({ label: 'Opacity', type: 'range', path: `${tx}.opacity`, key: true, keyLabel: 'Texture opacity', min: 0, max: 100, scale: 100, unit: '%', show: has }),
      row({ label: 'Fit', type: 'select', path: `${tx}.fit`, options: { cover: 'Cover the backdrop', tile: 'Tile (repeat)', stretch: 'Stretch' }, show: has }),
      row({ label: 'Scale', type: 'range', path: `${tx}.scale`, key: true, keyLabel: 'Texture scale', min: 0.1, max: 4, step: 0.01, show: has }),
      row({ label: 'Offset X', type: 'range', path: `${tx}.offsetX`, key: true, keyLabel: 'Texture offset X', min: -1000, max: 1000, unit: 'px', show: has }),
      row({ label: 'Offset Y', type: 'range', path: `${tx}.offsetY`, key: true, keyLabel: 'Texture offset Y', min: -1000, max: 1000, unit: 'px', show: has }),
      row({ label: 'Drift X', type: 'range', path: `${tx}.driftX`, min: -400, max: 400, unit: 'px/s', show: has }),
      row({ label: 'Drift Y', type: 'range', path: `${tx}.driftY`, min: -400, max: 400, unit: 'px/s', show: has }),
    ]);
  }

  function backdropPanel() {
    const imgThumb = el('img', { class: 'thumb', alt: '' });
    const imgInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', hidden: true });
    imgInput.addEventListener('change', () => {
      const f = imgInput.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        state.backdrop.type = 'image';
        state.backdrop.image.src = rd.result;
        state.backdrop.image.name = f.name;
        changed({ sync: true });
      };
      rd.readAsDataURL(f);
      imgInput.value = '';
    });
    return [
      section('Backdrop', [
        row({ label: 'Type', type: 'select', path: 'backdrop.type', options: { shape: 'Shape', image: 'Image', none: 'None (text only)' } }),
        row({ label: 'Shape', type: 'select', path: 'backdrop.shape', options: SHAPES, show: isShape }),
        row({ label: 'Fill', type: 'select', path: 'backdrop.fillType', options: Engine.GRADIENT_TYPES, show: usesFill }),
        row({ label: 'Colour', type: 'color', path: 'backdrop.fill', key: true, show: (s) => usesFill(s) && ft(s) === 'solid' }),
        row({ label: 'Gradient look', type: 'custom', show: (s) => usesFill(s) && ft(s) !== 'solid', render: (ctl) => {
          const sel = el('select');
          fillSelect(sel, [['', 'Apply a sample…'], ...Presets.GRADIENTS.map((g, i) => [String(i), g.name])]);
          sel.addEventListener('change', () => {
            if (sel.value === '') return;
            Object.assign(state.backdrop, Presets.GRADIENTS[+sel.value].patch);
            for (const k of ['fill', 'fill2', 'fill3', 'fill4', 'gradientAngle']) if (isKeyed(`backdrop.${k}`)) clearKeys(`backdrop.${k}`);
            sel.value = ''; changed({ sync: true });
          });
          ctl.append(sel);
        } }),
        row({ label: 'Colour 1', type: 'color', path: 'backdrop.fill', key: true, keyLabel: 'Gradient colour 1', show: (s) => usesFill(s) && ft(s) !== 'solid' && ft(s) !== 'fourPoint' }),
        row({ label: 'Colour 2', type: 'color', path: 'backdrop.fill2', key: true, keyLabel: 'Gradient colour 2', show: (s) => usesFill(s) && ft(s) !== 'solid' && ft(s) !== 'fourPoint' }),
        row({ label: 'Top left', type: 'color', path: 'backdrop.fill', key: true, keyLabel: 'Corner colour TL', show: (s) => usesFill(s) && ft(s) === 'fourPoint' }),
        row({ label: 'Top right', type: 'color', path: 'backdrop.fill2', key: true, keyLabel: 'Corner colour TR', show: (s) => usesFill(s) && ft(s) === 'fourPoint' }),
        row({ label: 'Bottom right', type: 'color', path: 'backdrop.fill3', key: true, keyLabel: 'Corner colour BR', show: (s) => usesFill(s) && ft(s) === 'fourPoint' }),
        row({ label: 'Bottom left', type: 'color', path: 'backdrop.fill4', key: true, keyLabel: 'Corner colour BL', show: (s) => usesFill(s) && ft(s) === 'fourPoint' }),
        row({ label: 'Angle', type: 'range', path: 'backdrop.gradientAngle', key: true, min: 0, max: 360, unit: '°', show: (s) => usesFill(s) && ft(s) === 'linear' }),
        row({ label: 'Center X', type: 'range', path: 'backdrop.gradCX', key: true, min: -50, max: 150, unit: '%', show: (s) => usesFill(s) && ft(s) === 'radial' }),
        row({ label: 'Center Y', type: 'range', path: 'backdrop.gradCY', key: true, min: -50, max: 150, unit: '%', show: (s) => usesFill(s) && ft(s) === 'radial' }),
        row({ label: 'Radius', type: 'range', path: 'backdrop.gradRadius', key: true, min: 5, max: 300, unit: '%', show: (s) => usesFill(s) && ft(s) === 'radial' }),
        row({ label: 'Animate', type: 'select', path: 'backdrop.gradAnim', show: (s) => usesFill(s) && ft(s) !== 'solid', options: () => {
          const t = ft(state);
          const ok = { linear: ['rotate', 'slide'], radial: ['pulse', 'orbit'], fourPoint: ['swirl', 'breathe'] }[t] || [];
          return Object.entries(Engine.GRADIENT_ANIMS).filter(([k]) => k === 'none' || k === 'shimmer' || ok.includes(k) || k === state.backdrop.gradAnim);
        } }),
        row({ label: 'Loop length', type: 'range', path: 'backdrop.gradSpeed', min: 0.5, max: 20, step: 0.1, unit: 's', show: (s) => usesFill(s) && ft(s) !== 'solid' && s.backdrop.gradAnim !== 'none' }),
        row({ label: 'Shimmer colour', type: 'color', path: 'backdrop.shimmerColor', swatches: false, show: (s) => usesFill(s) && ft(s) !== 'solid' && s.backdrop.gradAnim === 'shimmer' }),
        row({ label: 'Shimmer strength', type: 'range', path: 'backdrop.shimmerOpacity', min: 0, max: 100, scale: 100, unit: '%', show: (s) => usesFill(s) && ft(s) !== 'solid' && s.backdrop.gradAnim === 'shimmer' }),
        row({ label: 'Accent', type: 'color', path: 'backdrop.accentColor', key: true, show: usesAccent }),
        row({ label: 'Accent size', type: 'range', path: 'backdrop.accentWidth', key: true, min: 1, max: 60, unit: 'px', show: shapeIn('accent', 'underline', 'sideBar', 'corners') }),
        row({ label: 'Accent gap', type: 'range', path: 'backdrop.accentGap', min: 0, max: 80, unit: 'px', show: shapeIn('accent', 'underline', 'sideBar') }),
        row({ label: 'Opacity', type: 'range', path: 'backdrop.opacity', key: true, min: 0, max: 100, scale: 100, unit: '%', show: (s) => s.backdrop.type !== 'none' }),
        row({ label: 'Corner radius', type: 'range', path: 'backdrop.radius', key: true, min: 0, max: 80, unit: 'px', show: shapeIn('rounded', 'accent', 'twoTone') }),
        row({ label: 'Slant', type: 'range', path: 'backdrop.skew', key: true, min: 0, max: 120, unit: 'px', show: shapeIn('slant') }),
      ]),
      section('Image backdrop', [
        row({ label: 'Image', type: 'custom', render: (ctl) => {
          const name = el('span', { class: 'sub' });
          ctl.append(el('div', { style: 'flex:1' },
            el('div', { class: 'btnrow' },
              el('button', { type: 'button', onclick: () => imgInput.click() }, 'Upload image…'),
              el('button', { type: 'button', onclick: () => { state.backdrop.image.src = ''; state.backdrop.image.name = ''; changed({ sync: true }); } }, 'Clear')),
            imgThumb, name), imgInput);
          return () => { const src = state.backdrop.image.src; imgThumb.src = src || ''; imgThumb.hidden = !src; name.textContent = state.backdrop.image.name || 'PNG with transparency works best.'; };
        } }),
        row({ label: 'Fit', type: 'select', path: 'backdrop.image.fit', options: { box: 'Stretch to text box', natural: 'Natural size (scaled)' }, show: (s) => s.backdrop.type === 'image' }),
        row({ label: 'Scale', type: 'range', path: 'backdrop.image.scale', key: true, min: 0.05, max: 4, step: 0.01, show: (s) => s.backdrop.type === 'image' && s.backdrop.image.fit === 'natural' }),
        row({ label: 'Text offset X', type: 'range', path: 'backdrop.image.textOffsetX', key: true, min: -400, max: 400, unit: 'px', show: (s) => s.backdrop.type === 'image' }),
        row({ label: 'Text offset Y', type: 'range', path: 'backdrop.image.textOffsetY', key: true, min: -300, max: 300, unit: 'px', show: (s) => s.backdrop.type === 'image' }),
      ]),
      textureSection(),
      section('Size & padding', [
        row({ label: 'Padding X', type: 'range', path: 'backdrop.padX', key: true, min: 0, max: 200, unit: 'px' }),
        row({ label: 'Padding Y', type: 'range', path: 'backdrop.padY', key: true, min: 0, max: 120, unit: 'px' }),
        row({ label: 'Min width', type: 'range', path: 'backdrop.minWidth', key: true, min: 0, max: 1920, unit: 'px' }),
        row({ label: 'Fixed width', type: 'range', path: 'backdrop.fixedWidth', key: true, min: 0, max: 1920, unit: 'px' }),
        el('div', { class: 'sub' }, 'Fixed width 0 = size to the text automatically.'),
      ]),
      section('Backdrop shadow', [
        row({ label: 'Shadow', type: 'checkbox', path: 'backdrop.shadow.on', text: 'On', show: (s) => s.backdrop.type !== 'none' }),
        row({ label: 'Color', type: 'color', path: 'backdrop.shadow.color', key: true, swatches: false, show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Opacity', type: 'range', path: 'backdrop.shadow.opacity', key: true, min: 0, max: 100, scale: 100, unit: '%', show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Blur', type: 'range', path: 'backdrop.shadow.blur', key: true, min: 0, max: 100, show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Offset X', type: 'range', path: 'backdrop.shadow.offsetX', key: true, min: -50, max: 50, show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Offset Y', type: 'range', path: 'backdrop.shadow.offsetY', key: true, min: -50, max: 50, show: (s) => s.backdrop.shadow.on }),
      ]),
    ];
  }

  const RESOLUTIONS = { '1920x1080': '1920 × 1080 (HD)', '3840x2160': '3840 × 2160 (4K UHD)', '2560x1440': '2560 × 1440 (QHD)', '1280x720': '1280 × 720', '1080x1920': '1080 × 1920 (vertical)', '1080x1350': '1080 × 1350 (4:5)', '1080x1080': '1080 × 1080 (square)' };

  function placeAt(where) {
    const { width: W, height: H } = state.comp;
    const L = state.layout;
    const m = 0.05; // title-safe margin
    const map = {
      bl: ['left', 'bottom', W * m, H * (1 - m) - H * 0.05],
      bc: ['center', 'bottom', W / 2, H * (1 - m) - H * 0.05],
      br: ['right', 'bottom', W * (1 - m), H * (1 - m) - H * 0.05],
      tl: ['left', 'top', W * m, H * m],
      tr: ['right', 'top', W * (1 - m), H * m],
      c: ['center', 'top', W / 2, H / 2],
    };
    const [h, v, x, y] = map[where];
    // Keep the box visually where it is when switching anchors, unless jumping to a preset spot.
    Object.assign(L, { hAnchor: h, vAnchor: v, x: Math.round(x), y: Math.round(y) });
    if (where === 'bc' || where === 'c') L.align = 'center';
    else if (where === 'br' || where === 'tr') L.align = 'right';
    else L.align = 'left';
    changed({ sync: true });
  }

  function layoutPanel() {
    return [
      section('Canvas', [
        row({ label: 'Resolution', type: 'custom', render: (ctl) => {
          const s = el('select');
          fillSelect(s, RESOLUTIONS);
          s.addEventListener('change', () => {
            const [w, h] = s.value.split('x').map(Number);
            const fx = w / state.comp.width, fy = h / state.comp.height;
            state.comp.width = w; state.comp.height = h;
            // Keep the lower third proportionally placed when resolution changes.
            state.layout.x = Math.round(state.layout.x * fx); state.layout.y = Math.round(state.layout.y * fy);
            resizeCanvas(); changed({ sync: true });
          });
          ctl.append(s);
          return () => { const k = `${state.comp.width}x${state.comp.height}`; if (!RESOLUTIONS[k]) fillSelect(s, { ...RESOLUTIONS, [k]: k.replace('x', ' × ') }); s.value = k; };
        } }),
        row({ label: 'Frame rate', type: 'select', path: 'comp.fps', numeric: true, options: { 23.976: '23.976', 24: '24', 25: '25', 29.97: '29.97', 30: '30', 50: '50', 59.94: '59.94', 60: '60' } }),
        row({ label: 'Motion blur', type: 'checkbox', path: 'comp.motionBlur.enabled', text: 'On (applied when exporting)' }),
        row({ label: 'Shutter angle', type: 'range', path: 'comp.motionBlur.shutter', min: 15, max: 720, step: 15, unit: '°', show: (s) => s.comp.motionBlur.enabled }),
        row({ label: 'Quality', type: 'select', path: 'comp.motionBlur.samples', numeric: true, options: { 4: 'Draft (4 samples)', 8: 'Good (8)', 12: 'High (12)', 16: 'Very high (16)', 24: 'Best (24, slow)' }, show: (s) => s.comp.motionBlur.enabled }),
        row({ label: 'Preview', type: 'checkbox', path: 'comp.motionBlur.preview', text: 'Show motion blur in the preview', show: (s) => s.comp.motionBlur.enabled }),
        el('div', { class: 'sub' }, '180° matches a normal film camera. Higher angles give longer smears.'),
        row({ label: 'Duration', type: 'range', path: 'comp.duration', min: 1, max: 30, step: 0.1, unit: 's', onSet: () => setTime(Math.min(time, state.comp.duration)) }),
      ]),
      section('Position', [
        row({ label: 'Quick place', type: 'buttons', buttons: [
          ['↙ Bottom L', () => placeAt('bl'), 'Bottom-left inside title safe'],
          ['↓ Bottom C', () => placeAt('bc'), 'Bottom-center'],
          ['↘ Bottom R', () => placeAt('br'), 'Bottom-right'],
          ['↖ Top L', () => placeAt('tl'), 'Top-left'],
          ['↗ Top R', () => placeAt('tr'), 'Top-right'],
        ] }),
        row({ label: 'X', type: 'number', path: 'layout.x', key: true, unit: 'px' }),
        row({ label: 'Y', type: 'number', path: 'layout.y', key: true, unit: 'px' }),
        row({ label: 'Anchor X', type: 'select', path: 'layout.hAnchor', options: { left: 'Left edge', center: 'Center', right: 'Right edge' } }),
        row({ label: 'Anchor Y', type: 'select', path: 'layout.vAnchor', options: { top: 'Top edge', bottom: 'Bottom edge (grows up)' } }),
        row({ label: 'Text align', type: 'select', path: 'layout.align', options: { left: 'Left', center: 'Center', right: 'Right', justify: 'Justified' } }),
        row({ label: 'Line gap', type: 'range', path: 'layout.lineGap', key: true, min: -20, max: 80, unit: 'px' }),
        el('div', { class: 'sub' }, 'Tip: drag in the preview to move. It snaps to the title-safe edges.'),
      ]),
    ];
  }

  // ---------- Easing editor ----------
  function easingControl(basePath) {
    return row({ label: 'Easing', type: 'custom', render: (ctl) => {
      const sel = el('select');
      fillSelect(sel, EASING_LABELS);
      const cv = el('canvas', { width: 192, height: 192 });
      const bez = el('div', { class: 'bez' });
      const inputs = [0, 1, 2, 3].map((i) => {
        const n = el('input', { type: 'number', step: 0.01, title: ['x1', 'y1', 'x2', 'y2'][i] });
        n.addEventListener('input', () => { const b = getPath(state, basePath + '.bezier'); b[i] = +n.value; changed(); draw(); });
        bez.append(n); return n;
      });
      sel.addEventListener('change', () => { setPath(state, basePath + '.easing', sel.value); changed(); sync(); });
      sel.style.width = '100%';
      ctl.append(el('div', { style: 'flex:1;min-width:0' }, sel,
        el('div', { class: 'easing' }, cv, el('div', {}, bez, el('div', { class: 'sub' }, 'Choose “Custom bezier…” to drag the handles or type values.')))));

      const P = 28, S = 192 - 2 * P; // curve area inside canvas (y range allows overshoot)
      const toX = (x) => P + x * S, toY = (y) => 192 - P - y * S;
      function draw() {
        const a = getPath(state, basePath);
        const g = cv.getContext('2d');
        g.clearRect(0, 0, 192, 192);
        g.strokeStyle = '#2a3040'; g.lineWidth = 2;
        g.strokeRect(toX(0), toY(1), S, S);
        const fn = getEasing(a.easing, a.bezier);
        g.strokeStyle = '#f59e0b'; g.lineWidth = 4; g.beginPath();
        for (let i = 0; i <= 80; i++) { const x = i / 80; const y = fn(x); i ? g.lineTo(toX(x), toY(y)) : g.moveTo(toX(x), toY(y)); }
        g.stroke();
        if (a.easing === 'custom') {
          const [x1, y1, x2, y2] = a.bezier;
          g.strokeStyle = '#8a93a6'; g.lineWidth = 2; g.beginPath();
          g.moveTo(toX(0), toY(0)); g.lineTo(toX(x1), toY(y1)); g.moveTo(toX(1), toY(1)); g.lineTo(toX(x2), toY(y2)); g.stroke();
          g.fillStyle = '#fff';
          for (const [x, y] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(toX(x), toY(y), 8, 0, 7); g.fill(); }
        }
      }
      let drag = -1;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 192, ((e.clientY - r.top) / r.height) * 192]; };
      cv.addEventListener('pointerdown', (e) => {
        const a = getPath(state, basePath); if (a.easing !== 'custom') return;
        const [mx, my] = pos(e); const b = a.bezier;
        const d1 = Math.hypot(mx - toX(b[0]), my - toY(b[1])), d2 = Math.hypot(mx - toX(b[2]), my - toY(b[3]));
        drag = d1 < d2 ? 0 : 2; cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', (e) => {
        if (drag < 0) return;
        const [mx, my] = pos(e); const b = getPath(state, basePath + '.bezier');
        b[drag] = +Math.min(1, Math.max(0, (mx - P) / S)).toFixed(3);
        b[drag + 1] = +Math.min(1.6, Math.max(-0.6, (192 - P - my) / S)).toFixed(3);
        inputs.forEach((n, i) => (n.value = b[i])); draw(); changed();
      });
      cv.addEventListener('pointerup', () => (drag = -1));
      function sync() {
        const a = getPath(state, basePath);
        sel.value = a.easing; const custom = a.easing === 'custom';
        bez.style.display = custom ? '' : 'none'; cv.classList.toggle('editable', custom);
        inputs.forEach((n, i) => { if (document.activeElement !== n) n.value = a.bezier[i]; });
        draw();
      }
      return sync;
    } });
  }

  function animPanel(key) {
    const isBd = key === 'backdrop';
    const opts = isBd ? BACKDROP_ANIMS : TEXT_ANIMS;
    const base = `${key}.anim`;
    const name = { backdrop: 'Backdrop', title: 'Title', subtitle: 'Subtitle' }[key];
    const perUnit = (dir) => (s) => /^(letters|words)/.test(s[key].anim[dir].type);
    const tp = (k) => `${key}.transform.${k}`;
    const transformSec = section(`${name} · Transform`, [
      el('div', { class: 'sub' }, 'Click ◆ to start animating a property, then move the playhead and change the value: a keyframe is added automatically. With a layer selected you can also drag it in the preview.'),
      row({ label: 'Position X', type: 'range', path: tp('x'), key: true, min: -1920, max: 1920, unit: 'px' }),
      row({ label: 'Position Y', type: 'range', path: tp('y'), key: true, min: -1080, max: 1080, unit: 'px' }),
      row({ label: 'Scale', type: 'range', path: tp('scale'), key: true, min: 0, max: 400, unit: '%' }),
      row({ label: 'Rotation', type: 'range', path: tp('rotation'), key: true, min: -360, max: 360, step: 0.5, unit: '°' }),
      row({ label: 'Opacity', type: 'range', path: tp('opacity'), key: true, min: 0, max: 100, unit: '%' }),
      row({ label: 'Blur', type: 'range', path: tp('blur'), key: true, min: 0, max: 60, step: 0.5, unit: 'px' }),
      isBd ? null : row({ label: 'Tracking', type: 'range', path: tp('tracking'), key: true, min: -20, max: 120, step: 0.5, unit: 'px' }),
      row({ label: '', type: 'buttons', buttons: [
        ['Reset transform', () => { clearKeys(`${key}.transform.`); Object.assign(state[key].transform, { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, blur: 0, ...(isBd ? {} : { tracking: 0 }) }); changed({ sync: true }); }],
        ['Remove all keyframes', () => { clearKeys(`${key}.`); changed({ sync: true }); toast(`All ${name} keyframes removed`); }, 'Removes keyframes on every property of this layer (values stay as they are now)'],
      ] }),
    ].filter(Boolean));
    transformSec.classList.add('adv-only');
    const maskSec = maskSection(key, name);
    const animSec = isBd ? null : animatorsSection(key, name);
    return [
      transformSec,
      maskSec,
      animSec,
      section(`${name} · In`, [
        row({ label: 'Animation', type: 'select', path: `${base}.in.type`, options: opts }),
        row({ label: 'Start at', type: 'range', path: `${base}.in.delay`, min: 0, max: 10, step: 0.05, unit: 's' }),
        row({ label: 'Duration', type: 'range', path: `${base}.in.duration`, min: 0.05, max: 5, step: 0.05, unit: 's', show: (s) => s[key].anim.in.type !== 'none' }),
        easingControl(`${base}.in`),
      ]),
      section(`${name} · Out`, [
        row({ label: 'Animation', type: 'select', path: `${base}.out.type`, options: { ...opts, none: 'None (stay on screen)' } }),
        row({ label: 'Duration', type: 'range', path: `${base}.out.duration`, min: 0.05, max: 5, step: 0.05, unit: 's', show: (s) => s[key].anim.out.type !== 'none' }),
        row({ label: 'Ends before end', type: 'range', path: `${base}.out.offset`, min: 0, max: 5, step: 0.05, unit: 's' }),
        easingControl(`${base}.out`),
      ]),
      section('Motion', [
        row({ label: 'Slide distance', type: 'range', path: `${base}.distance`, min: 0, max: 1200, unit: 'px' }),
        isBd ? null : row({ label: 'Stagger', type: 'range', path: `${base}.stagger`, min: 0, max: 0.95, step: 0.01, show: (s) => perUnit('in')(s) || perUnit('out')(s) }),
        isBd ? null : el('div', { class: 'sub' }, 'Stagger controls how much letters/words overlap (0 = all together).'),
        row({ label: 'Copy timing', type: 'buttons', buttons: [
          ['Copy to all layers', () => {
            for (const k of ['backdrop', 'title', 'subtitle']) if (k !== key) {
              for (const d of ['in', 'out']) {
                const src = state[key].anim[d], dst = state[k].anim[d];
                Object.assign(dst, { duration: src.duration, easing: src.easing, bezier: [...src.bezier] });
              }
            }
            changed({ sync: true }); toast('Durations and easing copied to the other layers');
          }, 'Copy in/out durations and easing to the other layers'],
        ] }),
      ]),
    ].filter(Boolean);
  }

  // ---------- Masks (Advanced) ----------
  function maskSection(key, name) {
    const mp = (k) => `${key}.mask.${k}`;
    const on = (s) => s[key].mask.enabled;
    const fitToLayer = () => {
      const b = lastLayout && lastLayout.layers && lastLayout.layers[key];
      if (!b) return toast('That layer is empty');
      const pad = 8;
      for (const [k, v] of Object.entries({ x: Math.round(b.x - pad), y: Math.round(b.y - pad), w: Math.round(b.w + pad * 2), h: Math.round(b.h + pad * 2) })) setValue(mp(k), v);
      state[key].mask.enabled = true;
      changed({ sync: true });
    };
    const revealPreset = (dir) => () => {
      fitToLayer();
      const m = state[key].mask;
      const t0 = fpsT(time), t1 = fpsT(time + 0.6);
      clearKeys(`${key}.mask.`);
      if (dir === 'right') { state.keys[mp('w')] = [{ t: t0, v: 0, e: 'easeOutCubic' }, { t: t1, v: m.w, e: 'easeOutCubic' }]; }
      else if (dir === 'up') { state.keys[mp('y')] = [{ t: t0, v: m.y + m.h, e: 'easeOutCubic' }, { t: t1, v: m.y, e: 'easeOutCubic' }]; state.keys[mp('h')] = [{ t: t0, v: 0, e: 'easeOutCubic' }, { t: t1, v: m.h, e: 'easeOutCubic' }]; }
      else if (dir === 'iris') { m.shape = 'ellipse'; const cx = m.x + m.w / 2, cy = m.y + m.h / 2, W = m.w * 1.5, H = m.h * 3;
        state.keys[mp('x')] = [{ t: t0, v: cx, e: 'easeOutCubic' }, { t: t1, v: cx - W / 2, e: 'easeOutCubic' }]; state.keys[mp('y')] = [{ t: t0, v: cy, e: 'easeOutCubic' }, { t: t1, v: cy - H / 2, e: 'easeOutCubic' }];
        state.keys[mp('w')] = [{ t: t0, v: 0, e: 'easeOutCubic' }, { t: t1, v: W, e: 'easeOutCubic' }]; state.keys[mp('h')] = [{ t: t0, v: 0, e: 'easeOutCubic' }, { t: t1, v: H, e: 'easeOutCubic' }]; }
      changed({ sync: true }); toast('Mask reveal keyframed from the playhead');
    };
    const sec = section(`${name} · Mask`, [
      el('div', { class: 'sub' }, 'Only the part of the layer inside the mask is visible (or outside, when inverted). Keyframe its position and size to build custom reveals. The cyan outline shows the mask when the layer is selected.'),
      row({ label: 'Mask', type: 'checkbox', path: mp('enabled'), text: 'Enable mask' }),
      row({ label: 'Shape', type: 'select', path: mp('shape'), options: { rect: 'Rectangle', ellipse: 'Ellipse' }, show: on }),
      row({ label: 'X', type: 'range', path: mp('x'), key: true, keyLabel: 'Mask X', min: -500, max: 4000, unit: 'px', show: on }),
      row({ label: 'Y', type: 'range', path: mp('y'), key: true, keyLabel: 'Mask Y', min: -500, max: 2500, unit: 'px', show: on }),
      row({ label: 'Width', type: 'range', path: mp('w'), key: true, keyLabel: 'Mask width', min: 0, max: 4000, unit: 'px', show: on }),
      row({ label: 'Height', type: 'range', path: mp('h'), key: true, keyLabel: 'Mask height', min: 0, max: 2500, unit: 'px', show: on }),
      row({ label: 'Corner radius', type: 'range', path: mp('radius'), key: true, keyLabel: 'Mask radius', min: 0, max: 400, unit: 'px', show: (s) => on(s) && s[key].mask.shape === 'rect' }),
      row({ label: 'Feather', type: 'range', path: mp('feather'), key: true, keyLabel: 'Mask feather', min: 0, max: 120, unit: 'px', show: on }),
      row({ label: 'Invert', type: 'checkbox', path: mp('invert'), text: 'Show outside the mask', show: on }),
      row({ label: 'Quick', type: 'buttons', buttons: [
        ['Fit to layer', fitToLayer, 'Set the mask to this layer’s current bounds'],
        ['Wipe reveal →', revealPreset('right'), 'Keyframe a left-to-right reveal starting at the playhead'],
        ['Rise reveal ↑', revealPreset('up'), 'Keyframe a bottom-to-top reveal starting at the playhead'],
        ['Iris reveal ◯', revealPreset('iris'), 'Keyframe an expanding ellipse starting at the playhead'],
      ] }),
    ]);
    sec.classList.add('adv-only');
    return sec;
  }

  // ---------- Text animators (Advanced, After Effects style) ----------
  const ANIMATOR_PRESETS = {
    blank: { label: 'Blank animator', props: {}, sel: { shape: 'square', start: 0, end: 100, offset: 0 } },
    fade: { label: 'Fade in letters', props: { opacity: 0 }, reveal: true },
    rise: { label: 'Rise in letters', props: { y: 60, opacity: 0 }, reveal: true },
    drop: { label: 'Drop in letters', props: { y: -60, opacity: 0, rotation: -12 }, reveal: true },
    pop: { label: 'Pop in letters', props: { scale: 0, opacity: 0 }, reveal: true, ease: 'easeOutBack' },
    blurWords: { label: 'Blur in words', props: { blur: 20, opacity: 0 }, reveal: true, unit: 'words' },
    tracking: { label: 'Tracking in', props: { tracking: 30, opacity: 0 }, reveal: true },
    sweep: { label: 'Colour sweep (highlight)', props: { colorOn: true, color: '#f59e0b' }, sweep: true },
    wave: { label: 'Wave', props: { y: -24 }, sweep: true, shape: 'smooth' },
  };
  function makeAnimator(key, presetKey) {
    const pr = ANIMATOR_PRESETS[presetKey];
    const a = {
      name: pr.label, enabled: true, unit: pr.unit || 'chars', shape: pr.shape || (pr.reveal ? 'rampUp' : pr.sweep ? 'triangle' : 'square'),
      start: 0, end: pr.reveal ? 40 : pr.sweep ? 30 : 100, offset: 0, amount: 100,
      props: { x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, blur: 0, tracking: 0, colorOn: false, color: '#f59e0b', ...pr.props },
    };
    const list = state[key].animators;
    list.push(a);
    const i = list.length - 1;
    const path = `${key}.animators.${i}.offset`;
    const t0 = fpsT(time);
    if (pr.reveal) {
      state.keys[path] = [{ t: t0, v: -40, e: pr.ease || 'easeInOutCubic' }, { t: fpsT(time + 1), v: 100, e: 'linear' }];
      a.offset = -40;
      if (state[key].anim.in.type !== 'none') { state[key].anim.in.type = 'none'; toast(`${LAYER_NAMES[key]} “In” animation set to None so the animator drives the reveal`); }
      state[key].anim.in.delay = Math.min(state[key].anim.in.delay, t0);
    } else if (pr.sweep) {
      state.keys[path] = [{ t: t0, v: -30, e: 'linear' }, { t: fpsT(time + 1.2), v: 100, e: 'linear' }];
      a.offset = -30;
    }
  }
  function removeAnimator(key, i) {
    const list = state[key].animators;
    list.splice(i, 1);
    // Drop this animator's keyframes and renumber the ones after it.
    const pre = `${key}.animators.`;
    const next = {};
    for (const [p, ks] of Object.entries(state.keys || {})) {
      if (!p.startsWith(pre)) { next[p] = ks; continue; }
      const [idx, ...rest] = p.slice(pre.length).split('.');
      const n = +idx;
      if (n === i) continue;
      next[n > i ? `${pre}${n - 1}.${rest.join('.')}` : p] = ks;
    }
    state.keys = next;
    selKey = null;
  }
  function animatorsSection(key, name) {
    const owner = `animators-${key}`;
    const list = el('div');
    const add = el('select');
    fillSelect(add, [['', '+ Add animator…'], ...Object.entries(ANIMATOR_PRESETS).map(([k, v]) => [k, v.label])]);
    add.addEventListener('change', () => { if (!add.value) return; makeAnimator(key, add.value); add.value = ''; changed({ sync: true }); });
    let built = -1;
    function build() {
      dropControls(owner);
      list.innerHTML = '';
      currentOwner = owner;
      state[key].animators.forEach((a, i) => {
        const ap = (k) => `${key}.animators.${i}.${k}`;
        const box = el('div', { class: 'animator' },
          el('div', { class: 'animator-head' },
            el('b', {}, a.name || `Animator ${i + 1}`),
            el('button', { type: 'button', title: 'Delete this animator', onclick: () => { removeAnimator(key, i); changed({ sync: true }); } }, '✕')),
          row({ label: 'Enabled', type: 'checkbox', path: ap('enabled'), text: 'On' }),
          el('div', { class: 'animator-sub' }, 'Range selector'),
          row({ label: 'Based on', type: 'select', path: ap('unit'), options: { chars: 'Characters', words: 'Words' } }),
          row({ label: 'Shape', type: 'select', path: ap('shape'), options: { square: 'Square', rampUp: 'Ramp up', rampDown: 'Ramp down', triangle: 'Triangle', round: 'Round', smooth: 'Smooth' } }),
          row({ label: 'Start', type: 'range', path: ap('start'), key: true, keyLabel: `Animator ${i + 1} start`, min: 0, max: 100, step: 0.5, unit: '%' }),
          row({ label: 'End', type: 'range', path: ap('end'), key: true, keyLabel: `Animator ${i + 1} end`, min: 0, max: 100, step: 0.5, unit: '%' }),
          row({ label: 'Offset', type: 'range', path: ap('offset'), key: true, keyLabel: `Animator ${i + 1} offset`, min: -100, max: 100, step: 0.5, unit: '%' }),
          row({ label: 'Amount', type: 'range', path: ap('amount'), key: true, keyLabel: `Animator ${i + 1} amount`, min: 0, max: 100, unit: '%' }),
          el('div', { class: 'animator-sub' }, 'Properties (applied fully where the selector is 100%)'),
          row({ label: 'Position X', type: 'range', path: ap('props.x'), key: true, keyLabel: `Animator ${i + 1} X`, min: -400, max: 400, unit: 'px' }),
          row({ label: 'Position Y', type: 'range', path: ap('props.y'), key: true, keyLabel: `Animator ${i + 1} Y`, min: -400, max: 400, unit: 'px' }),
          row({ label: 'Scale', type: 'range', path: ap('props.scale'), key: true, keyLabel: `Animator ${i + 1} scale`, min: 0, max: 400, unit: '%' }),
          row({ label: 'Rotation', type: 'range', path: ap('props.rotation'), key: true, keyLabel: `Animator ${i + 1} rotation`, min: -360, max: 360, unit: '°' }),
          row({ label: 'Opacity', type: 'range', path: ap('props.opacity'), key: true, keyLabel: `Animator ${i + 1} opacity`, min: 0, max: 100, unit: '%' }),
          row({ label: 'Blur', type: 'range', path: ap('props.blur'), key: true, keyLabel: `Animator ${i + 1} blur`, min: 0, max: 60, unit: 'px' }),
          row({ label: 'Tracking', type: 'range', path: ap('props.tracking'), key: true, keyLabel: `Animator ${i + 1} tracking`, min: -40, max: 120, step: 0.5, unit: 'px' }),
          row({ label: 'Fill colour', type: 'checkbox', path: ap('props.colorOn'), text: 'Change colour' }),
          row({ label: 'Colour', type: 'color', path: ap('props.color'), key: true, keyLabel: `Animator ${i + 1} colour`, show: (s) => s[key].animators[i] && s[key].animators[i].props.colorOn }),
        );
        list.append(box);
      });
      currentOwner = null;
      built = state[key].animators.length;
      refreshVisibility();
    }
    structureSyncs.push(() => { if (built !== state[key].animators.length) build(); });
    const sec = section(`${name} · Text animators`, [
      el('div', { class: 'sub' }, 'Like After Effects: each animator changes letters by a property amount, limited by a range selector. Keyframe Start / End / Offset to sweep the effect across the text. Presets add keyframes at the playhead.'),
      el('div', { class: 'ctl' }, add),
      list,
    ]);
    sec.classList.add('adv-only');
    build();
    return sec;
  }

  // ---------- Tabs ----------
  const leftTabs = {
    text: () => [alignSection(), (sectionRefs.title = textSection('title', 'Title (line 1)')), (sectionRefs.subtitle = textSection('subtitle', 'Subtitle (line 2)'))],
    backdrop: backdropPanel,
    layout: layoutPanel,
  };
  const rightTabs = { 'anim-backdrop': () => animPanel('backdrop'), 'anim-title': () => animPanel('title'), 'anim-subtitle': () => animPanel('subtitle') };
  function buildTabs(navSel, body, tabs) {
    const panes = {};
    for (const [k, fn] of Object.entries(tabs)) { panes[k] = el('div', { 'data-pane': k }, ...fn()); body.append(panes[k]); }
    const show = (k) => {
      for (const [n, p] of Object.entries(panes)) p.hidden = n !== k;
      navSel.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === k));
    };
    navSel.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) show(b.dataset.tab); });
    show(Object.keys(tabs)[0]);
    return show;
  }

  // ---------- Layer selection ----------
  let selected = null, showLeft = () => {}, showRight = () => {};
  function selectLayer(k, { reveal = true } = {}) {
    selected = k;
    document.querySelectorAll('.layer-chips button').forEach((b) => b.classList.toggle('on', b.dataset.layer === k));
    if (k && reveal) {
      showRight(`anim-${k}`);
      if (k === 'backdrop') showLeft('backdrop');
      else {
        showLeft('text');
        const sec = sectionRefs[k];
        if (sec) {
          sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
          sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
          if (reveal === 'focus') sec.querySelector('input[type=text]')?.focus();
        }
      }
    }
    drawPreview(); drawTimeline();
  }

  // ---------- Preview ----------
  const preview = $('#preview'), pctx = preview.getContext('2d');
  const frame = $('#frame'), viewport = $('#viewport');
  let time = 0, playing = false, lastTs = 0, lastLayout = null;
  const view = { safeAreas: true, bounds: false };

  function resizeCanvas() {
    preview.width = state.comp.width; preview.height = state.comp.height;
    fitFrame(); drawPreview();
  }
  function fitFrame() {
    const vw = viewport.clientWidth - 32, vh = viewport.clientHeight - 32;
    const ar = state.comp.width / state.comp.height;
    let w = vw, h = vw / ar;
    if (h > vh) { h = vh; w = vh * ar; }
    frame.style.width = `${Math.max(50, w)}px`; frame.style.height = `${Math.max(50, h)}px`;
  }
  new ResizeObserver(fitFrame).observe(viewport);

  function drawPreview() {
    if (preview.width !== state.comp.width || preview.height !== state.comp.height) { preview.width = state.comp.width; preview.height = state.comp.height; fitFrame(); }
    const mb = state.comp.motionBlur;
    const mbOpts = mb && mb.enabled && mb.preview && !dragging ? { samples: Math.min(mb.samples, playing ? 4 : 8) } : { noMotionBlur: true };
    lastLayout = Engine.renderFrame(pctx, state, time, { guides: true, safeAreas: view.safeAreas, bounds: view.bounds || dragging, selected, ...mbOpts });
    const fps = state.comp.fps;
    const f = Math.round(time * fps);
    $('#timecode').textContent = `${time.toFixed(2)}s · f${f} / ${Math.round(state.comp.duration * fps)}`;
    const scrub = $('#scrub'); scrub.max = state.comp.duration; scrub.value = time;
  }
  Engine.onImageLoad = () => { drawPreview(); syncControls(); };

  function setTime(t) {
    time = Math.max(0, Math.min(state.comp.duration, t));
    drawPreview(); drawTimeline();
    if (state.keys && Object.keys(state.keys).length) syncKeyable();
    updateKeyBar();
  }
  function tick(ts) {
    if (!playing) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0; lastTs = ts;
    let t = time + dt;
    if (t >= state.comp.duration) {
      if ($('#optLoop').checked) t = t % state.comp.duration;
      else { t = state.comp.duration; setPlaying(false); }
    }
    setTime(t);
    requestAnimationFrame(tick);
  }
  function setPlaying(p) {
    playing = p; $('#btnPlay').textContent = p ? '❚❚' : '▶';
    if (p) { if (time >= state.comp.duration - 1e-3) time = 0; lastTs = 0; requestAnimationFrame(tick); }
  }

  // Drag to move
  let dragging = false, dragStart = null;
  const toComp = (e) => { const r = preview.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * state.comp.width, ((e.clientY - r.top) / r.height) * state.comp.height]; };
  preview.addEventListener('pointerdown', (e) => {
    const [cx, cy] = toComp(e);
    const hit = Engine.hitTest(lastLayout, cx, cy);
    if (hit !== selected) selectLayer(hit);
    dragging = true; preview.setPointerCapture(e.pointerId);
    dragStart = { m: [cx, cy], x: state.layout.x, y: state.layout.y };
    if (advanced && hit && hit === selected) dragStart.layer = { key: hit, x: valueNow(`${hit}.transform.x`), y: valueNow(`${hit}.transform.y`) };
  });
  preview.addEventListener('dblclick', (e) => {
    const [cx, cy] = toComp(e);
    const hit = Engine.hitTest(lastLayout, cx, cy);
    if (hit === 'title' || hit === 'subtitle') selectLayer(hit, { reveal: 'focus' });
  });
  preview.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const [mx, my] = toComp(e);
    if (dragStart.layer) {
      const d = dragStart.layer;
      setValue(`${d.key}.transform.x`, Math.round(d.x + mx - dragStart.m[0]));
      setValue(`${d.key}.transform.y`, Math.round(d.y + my - dragStart.m[1]));
      changed({ sync: true });
      return;
    }
    let x = Math.round(dragStart.x + mx - dragStart.m[0]);
    let y = Math.round(dragStart.y + my - dragStart.m[1]);
    // Snap the box edges to title-safe lines.
    if (!e.altKey && lastLayout) {
      const W = state.comp.width, H = state.comp.height, snap = 12 * (W / 1920);
      const b = lastLayout.box;
      const left = b.x + (x - state.layout.x), right = left + b.w, top = b.y + (y - state.layout.y), bottom = top + b.h;
      for (const g of [W * 0.05, W * 0.035]) { if (Math.abs(left - g) < snap) x += g - left; }
      for (const g of [W * 0.95, W * 0.965]) { if (Math.abs(right - g) < snap) x += g - right; }
      if (Math.abs((left + right) / 2 - W / 2) < snap) x += W / 2 - (left + right) / 2;
      for (const g of [H * 0.05, H * 0.035]) { if (Math.abs(top - g) < snap) y += g - top; }
      for (const g of [H * 0.95, H * 0.965]) { if (Math.abs(bottom - g) < snap) y += g - bottom; }
      x = Math.round(x); y = Math.round(y);
    }
    state.layout.x = x; state.layout.y = y;
    changed({ sync: true });
  });
  preview.addEventListener('pointerup', () => { dragging = false; drawPreview(); });

  // ---------- Timeline ----------
  const tl = $('#timeline'), tctx = tl.getContext('2d');
  const TRACKS = [['backdrop', 'Backdrop', '#3b82f6'], ['title', 'Title', '#f59e0b'], ['subtitle', 'Subtitle', '#22c55e']];
  const TL = { left: 86, right: 16, ruler: 22, rowH: 28, keyH: 18 };
  const LAYER_ORDER = ['backdrop', 'title', 'subtitle', 'layout', 'comp'];
  function keyRows() {
    if (!advanced || !state.keys) return [];
    return Object.keys(state.keys).filter((p) => state.keys[p]?.length)
      .sort((a, b) => (LAYER_ORDER.indexOf(a.split('.')[0]) - LAYER_ORDER.indexOf(b.split('.')[0])) || a.localeCompare(b));
  }
  const keysTop = () => TL.ruler + 6 + TRACKS.length * TL.rowH + 6;
  function resizeTimeline() {
    const rows = keyRows().length;
    TL.left = rows ? 150 : 86;
    const hgt = 120 + (rows ? rows * TL.keyH + 4 : 0);
    if (tl.style.height !== `${hgt}px`) { tl.style.height = `${hgt}px`; tl.width = 0; }
    drawTimeline();
  }
  function keyLabel(path) {
    if (keyLabels[path]) return keyLabels[path];
    const parts = path.split('.');
    return `${LAYER_NAMES[parts[0]] || parts[0]} · ${parts.slice(1).join(' ')}`;
  }
  let tlDrag = null;
  function tlGeom() {
    const dpr = window.devicePixelRatio || 1;
    const w = tl.clientWidth, h = tl.clientHeight;
    if (tl.width !== Math.round(w * dpr)) { tl.width = Math.round(w * dpr); tl.height = Math.round(h * dpr); }
    const D = state.comp.duration;
    const sx = (t) => TL.left + (t / D) * (w - TL.left - TL.right);
    const st = (x) => ((x - TL.left) / (w - TL.left - TL.right)) * D;
    return { dpr, w, h, sx, st };
  }
  function drawTimeline() {
    const { dpr, w, h, sx } = tlGeom();
    const g = tctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const D = state.comp.duration;
    // Ruler
    g.fillStyle = '#8a93a6'; g.font = '10px ui-monospace, monospace'; g.strokeStyle = '#262b37';
    const step = D > 15 ? 2 : D > 6 ? 1 : 0.5;
    for (let t = 0; t <= D + 1e-6; t += step) {
      const x = sx(t);
      g.beginPath(); g.moveTo(x, TL.ruler - 6); g.lineTo(x, h); g.stroke();
      g.fillText(`${+t.toFixed(1)}s`, x + 3, 12);
    }
    TRACKS.forEach(([key, label, color], i) => {
      const y = TL.ruler + 6 + i * TL.rowH;
      const isSel = selected === key;
      if (isSel) { g.fillStyle = '#f59e0b22'; g.fillRect(0, y, TL.left - 6, 22); }
      g.fillStyle = isSel ? '#f59e0b' : '#8a93a6'; g.font = `${isSel ? 600 : 400} 11px -apple-system, sans-serif`; g.fillText(label, 10, y + 15);
      const hidden = key === 'backdrop' ? state.backdrop.type === 'none' : !state[key].text;
      const sp = Engine.timingSpans(state[key].anim, D);
      const x0 = sx(sp.inStart), x1 = sx(sp.inEnd), x2 = sx(sp.outStart), x3 = sx(sp.outEnd);
      g.globalAlpha = hidden ? 0.25 : 1;
      g.fillStyle = color + '40'; g.fillRect(x0, y + 2, x3 - x0, 18);
      g.fillStyle = color;
      // in ramp
      g.beginPath(); g.moveTo(x0, y + 20); g.lineTo(x1, y + 2); g.lineTo(x1, y + 20); g.fill();
      // out ramp
      g.beginPath(); g.moveTo(x2, y + 2); g.lineTo(x3, y + 20); g.lineTo(x2, y + 20); g.fill();
      g.fillStyle = color + 'aa'; g.fillRect(x1, y + 14, Math.max(0, x2 - x1), 6);
      g.globalAlpha = 1;
    });
    // Keyframe rows (Advanced)
    const rows = keyRows();
    rows.forEach((path, j) => {
      const y = keysTop() + j * TL.keyH;
      const layer = path.split('.')[0];
      const isSel = selected === layer;
      g.fillStyle = j % 2 ? '#ffffff05' : '#ffffff0a'; g.fillRect(0, y, w, TL.keyH);
      g.fillStyle = isSel ? '#f59e0b' : '#8a93a6'; g.font = '10px -apple-system, sans-serif';
      let label = keyLabel(path);
      while (g.measureText(label).width > TL.left - 12 && label.length > 4) label = label.slice(0, -2) + '…';
      g.fillText(label, 8, y + 12);
      const ks = state.keys[path];
      g.strokeStyle = '#ffffff30'; g.beginPath();
      if (ks.length > 1) { g.moveTo(sx(ks[0].t), y + TL.keyH / 2); g.lineTo(sx(ks[ks.length - 1].t), y + TL.keyH / 2); g.stroke(); }
      for (const k of ks) {
        const x = sx(k.t), cy = y + TL.keyH / 2, sz = selKey && selKey.k === k ? 6 : 4.5;
        g.fillStyle = selKey && selKey.k === k ? '#f59e0b' : k.e === 'hold' ? '#94a3b8' : '#e5e7eb';
        g.beginPath(); g.moveTo(x, cy - sz); g.lineTo(x + sz, cy); g.lineTo(x, cy + sz); g.lineTo(x - sz, cy); g.closePath(); g.fill();
      }
    });
    // Playhead
    const px = sx(time);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke(); g.lineWidth = 1;
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(px - 5, 0); g.lineTo(px + 5, 0); g.lineTo(px, 7); g.fill();
    g.fillStyle = '#596176'; g.font = '10px -apple-system, sans-serif';
    if (!rows.length) g.fillText('Drag a bar to retime it · drag its start or end ramp to move only that part', TL.left, h - 6);
  }
  tl.addEventListener('pointerdown', (e) => {
    const { sx, st } = tlGeom();
    const r = tl.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    tl.setPointerCapture(e.pointerId);
    const rows = keyRows();
    if (rows.length && my >= keysTop()) {
      const j = Math.floor((my - keysTop()) / TL.keyH);
      const path = rows[j];
      if (path) {
        const ks = state.keys[path];
        let best = null, bd = 7;
        for (const k of ks) { const d = Math.abs(sx(k.t) - mx); if (d < bd) { bd = d; best = k; } }
        const layer = path.split('.')[0];
        if (TRACKS.some((t) => t[0] === layer) && selected !== layer) selectLayer(layer, { reveal: true });
        if (best) {
          selKey = { path, k: best }; setPlaying(false);
          tlDrag = { keyDrag: true, path, k: best, moved: false };
          setTime(best.t);
          return;
        }
        selKey = null;
      }
    }
    const i = Math.floor((my - TL.ruler - 6) / TL.rowH);
    if (mx < TL.left && i >= 0 && i < TRACKS.length) { selectLayer(TRACKS[i][0]); tl.releasePointerCapture(e.pointerId); return; }
    if (my > TL.ruler && i >= 0 && i < TRACKS.length) {
      if (selected !== TRACKS[i][0]) selectLayer(TRACKS[i][0]);
      const key = TRACKS[i][0]; const a = state[key].anim;
      const sp = Engine.timingSpans(a, state.comp.duration);
      const x0 = sx(sp.inStart), x1 = sx(sp.inEnd), x2 = sx(sp.outStart), x3 = sx(sp.outEnd);
      let mode = null;
      if (mx >= x0 - 4 && mx <= Math.max(x1, x0 + 8)) mode = 'in';
      else if (mx >= Math.min(x2, x3 - 8) && mx <= x3 + 4) mode = 'out';
      else if (mx > x1 && mx < x2) mode = 'both';
      if (mode) { tlDrag = { key, mode, t0: st(mx), delay: a.in.delay, offset: a.out.offset }; return; }
    }
    tlDrag = { scrub: true }; setPlaying(false); setTime(st(mx));
  });
  tl.addEventListener('pointermove', (e) => {
    if (!tlDrag) return;
    const { st } = tlGeom(); const r = tl.getBoundingClientRect();
    const t = st(e.clientX - r.left);
    if (tlDrag.scrub) return setTime(t);
    if (tlDrag.keyDrag) {
      tlDrag.k.t = Math.max(0, Math.min(state.comp.duration, fpsT(t)));
      sortKeys(tlDrag.path);
      changed({ sync: true });
      setTime(tlDrag.k.t);
      return;
    }
    const a = state[tlDrag.key].anim; const dt = t - tlDrag.t0; const D = state.comp.duration;
    const r2 = (v) => Math.round(Math.max(0, v) * 100) / 100;
    if (tlDrag.mode === 'in' || tlDrag.mode === 'both') a.in.delay = r2(Math.min(tlDrag.delay + dt, D - 0.1));
    if (tlDrag.mode === 'out' || tlDrag.mode === 'both') a.out.offset = r2(Math.min(tlDrag.offset - dt, D - 0.1));
    changed({ sync: true });
  });
  tl.addEventListener('pointerup', () => (tlDrag = null));
  new ResizeObserver(drawTimeline).observe(tl);

  // ---------- Keyframe inspector bar ----------
  const keyBar = $('#keyBar');
  function updateKeyBar() {
    if (!selKey || !isKeyed(selKey.path) || !keysOf(selKey.path).includes(selKey.k)) { keyBar.hidden = true; return; }
    keyBar.hidden = false;
    const { path, k } = selKey;
    $('#kbLabel').textContent = `◆ ${keyLabel(path)}`;
    $('#kbTime').textContent = `${k.t.toFixed(2)}s`;
    const vi = $('#kbValue');
    const isColor = typeof k.v === 'string';
    vi.type = isColor ? 'color' : 'number';
    if (document.activeElement !== vi) vi.value = isColor ? k.v : +(+k.v).toFixed(3);
    $('#kbEase').value = k.e || 'easeInOutCubic';
    const last = keysOf(path).indexOf(k) === keysOf(path).length - 1;
    $('#kbEase').disabled = last;
    $('#kbEase').title = last ? 'Last keyframe: nothing to ease into' : 'How the value moves from this keyframe to the next';
  }
  fillSelect($('#kbEase'), [['easeInOutCubic', 'Easy ease'], ['linear', 'Linear'], ['easeOutCubic', 'Ease out'], ['easeInCubic', 'Ease in'], ['hold', 'Hold (jump)'],
    { group: 'More', items: Object.entries(EASING_LABELS).filter(([k]) => k !== 'custom' && !['linear', 'easeOutCubic', 'easeInCubic', 'easeInOutCubic'].includes(k)) }]);
  $('#kbValue').addEventListener('input', (e) => {
    if (!selKey) return;
    selKey.k.v = e.target.type === 'color' ? e.target.value : +e.target.value;
    changed({ sync: true });
  });
  $('#kbEase').addEventListener('change', (e) => { if (selKey) { selKey.k.e = e.target.value; changed(); updateKeyBar(); drawTimeline(); } });
  $('#kbDelete').onclick = () => { if (selKey) { removeKey(selKey.path, selKey.k); changed({ sync: true }); updateKeyBar(); } };
  $('#kbPrev').onclick = () => jumpKey(-1);
  $('#kbNext').onclick = () => jumpKey(1);
  function jumpKey(dir) {
    const all = [...new Set(keyRows().flatMap((p) => state.keys[p].map((k) => k.t)))].sort((a, b) => a - b);
    const t = dir > 0 ? all.find((x) => x > time + 1e-4) : [...all].reverse().find((x) => x < time - 1e-4);
    if (t !== undefined) { setPlaying(false); setTime(t); }
  }
  $('#optAdvanced').addEventListener('change', (e) => setAdvanced(e.target.checked));

  // ---------- Transport ----------
  $('#btnPlay').onclick = () => setPlaying(!playing);
  $('#btnStart').onclick = () => { setPlaying(false); setTime(0); };
  $('#btnPrevFrame').onclick = () => { setPlaying(false); setTime(Math.round(time * state.comp.fps - 1) / state.comp.fps); };
  $('#btnNextFrame').onclick = () => { setPlaying(false); setTime(Math.round(time * state.comp.fps + 1) / state.comp.fps); };
  $('#btnHold').onclick = () => {
    setPlaying(false);
    const ends = ['backdrop', 'title', 'subtitle'].map((k) => Engine.timingSpans(state[k].anim, state.comp.duration));
    const on = Math.max(...ends.map((s) => s.inEnd)), off = Math.min(...ends.map((s) => s.outStart));
    setTime(on <= off ? (on + off) / 2 : on);
  };
  $('#scrub').addEventListener('input', (e) => { setPlaying(false); setTime(+e.target.value); });

  // Preview background / guides
  const bgEl = $('#frameBg');
  $('#bgMode').addEventListener('change', (e) => {
    const m = e.target.value;
    if (m === 'image') { $('#bgFile').click(); return; }
    $('#bgColor').hidden = m !== 'custom';
    if (m === 'custom') { bgEl.className = 'frame-bg'; bgEl.style.backgroundImage = ''; bgEl.style.background = $('#bgColor').value; return; }
    bgEl.style.background = '';
    bgEl.className = 'frame-bg ' + m; bgEl.style.backgroundImage = '';
  });
  $('#bgFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    bgEl.className = 'frame-bg'; bgEl.style.backgroundImage = `url(${URL.createObjectURL(f)})`;
  });
  bgEl.className = 'frame-bg checker';
  $('#optSafe').addEventListener('change', (e) => { view.safeAreas = e.target.checked; drawPreview(); });
  $('#optBounds').addEventListener('change', (e) => { view.bounds = e.target.checked; drawPreview(); });

  // ---------- Presets ----------
  let saved = [];
  async function refreshPresets(selectValue) {
    saved = await api.presets.list();
    const sel = $('#presetSelect');
    fillSelect(sel, [
      ['', '— Choose a style or preset —'],
      { group: 'Built-in styles', items: Presets.BUILTIN.map((p, i) => [`b:${i}`, p.name]) },
      ...(saved.length ? [{ group: 'My presets', items: saved.map((p) => [`u:${p.name}`, p.name]) }] : []),
    ]);
    sel.value = selectValue || '';
  }
  $('#presetSelect').addEventListener('change', (e) => {
    const v = e.target.value; if (!v) return;
    if (v.startsWith('b:')) {
      // Built-in styles change the look only: keep the user's text, canvas and position.
      const next = Presets.builtin(+v.slice(2));
      next.title.text = state.title.text; next.subtitle.text = state.subtitle.text;
      next.comp = clone(state.comp);
      Object.assign(next.layout, { x: state.layout.x, y: state.layout.y, hAnchor: state.layout.hAnchor, vAnchor: state.layout.vAnchor });
      if (state.backdrop.image.src && next.backdrop.type !== 'image') next.backdrop.image = clone(state.backdrop.image);
      replaceState(next);
    } else {
      const p = saved.find((s) => s.name === v.slice(2));
      if (p) replaceState(p.state);
    }
    $('#btnHold').click();
  });
  $('#btnSavePreset').onclick = async () => {
    const cur = $('#presetSelect').value;
    const name = await promptDialog('Save preset as', cur.startsWith('u:') ? cur.slice(2) : state.title.text || 'My lower third');
    if (!name) return;
    await api.presets.save(name, clone(state));
    await refreshPresets(`u:${name}`);
    toast(`Saved preset “${name}”`);
  };
  $('#btnDeletePreset').onclick = async () => {
    const v = $('#presetSelect').value;
    if (!v.startsWith('u:')) return toast('Select one of your saved presets to delete');
    if (!confirm(`Delete preset “${v.slice(2)}”?`)) return;
    await api.presets.remove(v.slice(2));
    await refreshPresets();
  };
  // ---------- Project files (.l3rd) ----------
  let projectPath = null, dirty = false;
  const baseName = (p) => (p ? p.split(/[\\/]/).pop().replace(/\.(l3rd|json)$/i, '') : 'Untitled');
  function setDirty(d) {
    dirty = d;
    $('#docName').textContent = baseName(projectPath);
    $('#docName').classList.toggle('dirty', d);
    $('#docName').title = projectPath || 'Not saved yet';
    document.title = `${baseName(projectPath)}${d ? ' — Edited' : ''} · Thirdline`;
  }
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  const toB64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
  async function projectJSON() {
    // Embed any uploaded fonts the design uses so the file opens the same on another computer.
    const used = new Set([state.title.font, state.subtitle.font]);
    const fonts = [];
    for (const f of userFonts) {
      if (!used.has(f.family)) continue;
      let data = f.data;
      if (!data && api.fonts.read) data = await api.fonts.read(f.file);
      if (data) fonts.push({ family: f.family, file: f.file, data: toB64(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data) });
    }
    return JSON.stringify({ format: 'thirdline-project', version: 1, savedAt: new Date().toISOString(), state, fonts });
  }
  async function saveProject(as = false) {
    const json = await projectJSON();
    const p = await api.project.save(as ? null : projectPath, json, baseName(projectPath) === 'Untitled' ? (state.title.text || 'Untitled') : baseName(projectPath));
    if (!p) return false;
    projectPath = p; setDirty(false);
    toast(`Saved ${baseName(p)}.l3rd`);
    return true;
  }
  async function loadProjectText(text, p) {
    let data;
    try { data = JSON.parse(text); } catch { toast('That file is not a Thirdline project'); return; }
    const st = data.state || data;
    if (!st || !st.title || !st.backdrop) { toast('That file is not a Thirdline project'); return; }
    for (const f of data.fonts || []) {
      const buf = fromB64(f.data);
      await addUserFont({ family: f.family, file: f.file, data: buf });
      if (api.fonts.installData) api.fonts.installData(f.file, new Uint8Array(buf)).catch(() => {});
    }
    selKey = null;
    replaceState(st);
    history = [JSON.stringify(state)]; histIndex = 0;
    projectPath = data.format === 'thirdline-project' ? p : null;
    setDirty(data.format !== 'thirdline-project');
    syncControls();
    $('#btnHold').click();
    toast(`Opened ${baseName(p)}`);
  }
  const confirmDiscard = () => !dirty || confirm('You have unsaved changes. Discard them?');
  async function openProject() {
    if (!confirmDiscard()) return;
    const r = await api.project.open();
    if (r) await loadProjectText(r.text, r.path);
  }
  function newProject() {
    if (!confirmDiscard()) return;
    selKey = null;
    replaceState(Presets.defaultState());
    history = [JSON.stringify(state)]; histIndex = 0;
    projectPath = null; setDirty(false);
    $('#btnHold').click();
  }
  api.project.onOpenPath(async (p) => { if (!confirmDiscard()) return; const r = await api.project.read(p); if (r) loadProjectText(r.text, r.path); });
  api.onMenu((cmd) => ({
    new: newProject, open: openProject, save: () => saveProject(false), saveAs: () => saveProject(true),
    export: () => $('#btnExport').click(), undo, redo,
  })[cmd]?.());
  $('#btnNew').onclick = newProject;
  $('#btnOpen').onclick = openProject;
  $('#btnSave').onclick = (e) => saveProject(e.shiftKey || e.altKey);

  function promptDialog(title, value) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'text', value, style: 'width:100%' });
      const d = el('dialog', {}, el('form', { method: 'dialog', class: 'modal' },
        el('h2', {}, title), input,
        el('div', { class: 'actions' },
          el('button', { type: 'button', onclick: () => { d.close(); resolve(null); } }, 'Cancel'),
          el('button', { class: 'primary', value: 'ok' }, 'Save'))));
      d.addEventListener('close', () => { if (d.returnValue === 'ok') resolve(input.value.trim() || null); d.remove(); });
      document.body.append(d); d.showModal(); input.select();
    });
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- Export ----------
  const dlg = $('#exportDialog');
  let exportJob = null, exportCancelled = false, lastOut = null;
  const fmt = () => dlg.querySelector('input[name=fmt]:checked').value;
  function exportSummary() {
    const { width, height, fps, duration } = state.comp;
    const frames = Math.round(duration * fps);
    const mb = state.comp.motionBlur;
    $('#exportSummary').textContent = `${width} × ${height} · ${fps} fps · ${duration}s · ${frames} frames` + (mb && mb.enabled ? ` · motion blur ${mb.shutter}° × ${mb.samples} samples` : '');
    $('#mp4BgRow').hidden = fmt() !== 'mp4';
  }
  $('#btnExport').onclick = () => {
    if (!api.exporter) { toast('Export needs the desktop app (ffmpeg is bundled there).'); return; }
    $('#exportName').value = (state.title.text || 'lower-third').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'lower-third';
    $('#exportError').hidden = true; $('#exportProgress').hidden = true; $('#btnReveal').hidden = true;
    $('#btnExportGo').disabled = false;
    exportSummary(); setPlaying(false); dlg.showModal();
  };
  dlg.addEventListener('change', exportSummary);
  $('#btnExportCancel').onclick = async () => {
    if (exportJob) { exportCancelled = true; return; }
    dlg.close();
  };
  dlg.addEventListener('cancel', (e) => { if (exportJob) { e.preventDefault(); exportCancelled = true; } });
  $('#btnReveal').onclick = () => lastOut && api.reveal(lastOut);
  $('#btnExportGo').onclick = () => runExport().catch((err) => {
    $('#exportError').hidden = false; $('#exportError').textContent = String(err.message || err);
  });

  async function runExport() {
    const format = fmt();
    const out = await api.exporter.chooseDest(format, $('#exportName').value || 'lower-third');
    if (!out) return;
    const snap = clone(state);
    const { width, height, fps, duration } = snap.comp;
    const frames = Math.max(1, Math.round(duration * fps));
    await ensureFonts(snap); await document.fonts.ready; await Engine.imagesReady(snap);

    const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const bg = $('#exportBg').value;
    const bar = $('#exportProgress .bar'), label = $('#exportProgress span');
    $('#exportProgress').hidden = false; $('#exportError').hidden = true; $('#btnReveal').hidden = true;
    $('#btnExportGo').disabled = true; $('#btnExportCancel').textContent = 'Cancel';
    exportCancelled = false;
    const started = performance.now();
    exportJob = await api.exporter.start({ format, out, width, height, fps });
    try {
      for (let i = 0; i < frames; i++) {
        if (exportCancelled) throw new Error('cancelled');
        Engine.renderFrame(ctx, snap, i / fps, { precise: true });
        if (format === 'mp4') {
          ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); ctx.restore();
        }
        const img = ctx.getImageData(0, 0, width, height);
        await api.exporter.frame(exportJob, new Uint8Array(img.data.buffer));
        const pct = ((i + 1) / frames) * 100;
        bar.style.width = `${pct}%`;
        const el2 = (performance.now() - started) / 1000;
        label.textContent = `Frame ${i + 1} / ${frames} · ${Math.round(pct)}% · ${el2 > 1 ? Math.round((el2 / (i + 1)) * (frames - i - 1)) + 's left' : ''}`;
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      label.textContent = 'Finalizing…';
      const res = await api.exporter.finish(exportJob);
      lastOut = res.out;
      label.textContent = `Done in ${((performance.now() - started) / 1000).toFixed(1)}s`;
      $('#btnReveal').hidden = false;
      toast('Export finished');
    } catch (err) {
      await api.exporter.cancel(exportJob).catch(() => {});
      if (err.message === 'cancelled') { label.textContent = 'Cancelled'; bar.style.width = '0'; }
      else throw err;
    } finally {
      exportJob = null; $('#btnExportGo').disabled = false; $('#btnExportCancel').textContent = 'Close';
    }
  }

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !['checkbox', 'range', 'radio'].includes(document.activeElement.type);
    const mod = e.metaKey || e.ctrlKey;
    if (mod && api.browser) {
      const k = e.key.toLowerCase();
      if (k === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (k === 'y') { e.preventDefault(); redo(); return; }
      if (k === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
      if (k === 'o') { e.preventDefault(); openProject(); return; }
      if (k === 'e') { e.preventDefault(); $('#btnExport').click(); return; }
    }
    if (typing || dlg.open) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowLeft') $('#btnPrevFrame').click();
    else if (e.key === 'ArrowRight') $('#btnNextFrame').click();
    else if (e.key === 'Home') $('#btnStart').click();
    else if (e.key === 'Escape') { selKey = null; updateKeyBar(); selectLayer(null); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selKey) { e.preventDefault(); removeKey(selKey.path, selKey.k); changed({ sync: true }); updateKeyBar(); }
    else if (e.key.toLowerCase() === 'j') jumpKey(-1);
    else if (e.key.toLowerCase() === 'k') jumpKey(1);
    else if (e.key === 'Tab' && document.activeElement === document.body) { e.preventDefault(); const order = ['backdrop', 'title', 'subtitle']; selectLayer(order[(order.indexOf(selected) + (e.shiftKey ? 2 : 1)) % 3]); }
  });
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;

  // ---------- Boot ----------
  async function boot() {
    for (const f of await api.fonts.list()) await addUserFont(f);
    showLeft = buildTabs($('nav[data-for=left]'), $('#leftBody'), leftTabs);
    showRight = buildTabs($('nav[data-for=right]'), $('#rightBody'), rightTabs);
    document.querySelectorAll('.layer-chips button').forEach((b) => (b.onclick = () => selectLayer(b.dataset.layer === selected ? null : b.dataset.layer)));
    setAdvanced(advanced);
    syncControls(); refreshVisibility();
    await refreshPresets();
    await document.fonts.ready; await ensureFonts();
    resizeCanvas();
    $('#btnHold').click();
    drawTimeline();
    window.__l3rd = { get state() { return state; }, setTime, replaceState, render: drawPreview };
  }
  boot();
})();
