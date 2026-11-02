/* L3rd Creator — editor UI. Depends on Easing, Engine, Presets globals. */
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
      userFonts.push({ family: f.family, file: f.file });
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
    drawTimeline();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem('l3rd:last', JSON.stringify(state)); } catch {} }, 400);
    if (record) {
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
    const r = el('div', { class: 'row' }, el('label', {}, def.label), ctl);
    let sync = () => {};
    const val = () => getPath(state, def.path);
    const set = (v) => { setPath(state, def.path, v); def.onSet?.(v); changed(); };
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
        ctl.append(i, n, def.unit ? el('span', { class: 'unit' }, def.unit) : null);
        sync = () => { const v = +((val() ?? 0) * scale).toFixed(4); i.value = v; if (document.activeElement !== n) n.value = v; };
        break;
      }
      case 'number': {
        const n = el('input', { type: 'number', min: def.min, max: def.max, step: def.step ?? 1 });
        n.addEventListener('input', () => { if (n.value !== '' && !isNaN(+n.value)) set(+n.value); });
        ctl.append(n, def.unit ? el('span', { class: 'unit' }, def.unit) : null);
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
        const wrap = el('div', { style: 'flex:1' }, el('div', { class: 'ctl' }, i, hex), def.swatches === false ? null : sw);
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
    const entry = { sync, def, rowEl: r };
    controls.push(entry);
    sync();
    return r;
  }
  function section(title, rows, headerExtra) {
    return el('div', { class: 'section' }, el('h3', {}, title, headerExtra || null), ...rows);
  }
  function syncControls() { for (const c of controls) c.sync(); }
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

  function textSection(key, title) {
    const p = (k) => `${key}.${k}`;
    const textual = key === 'title';
    return section(title, [
      row({ label: 'Text', type: 'text', path: p('text'), placeholder: textual ? 'Name' : 'Role / description' }),
      row({ label: 'Font', type: 'select', path: p('font'), options: fontOptions,
        onSet: () => { const ws = BUILTIN_FONTS[state[key].font]; if (ws && !ws.includes(+state[key].weight)) state[key].weight = ws.reduce((a, b) => (Math.abs(b - state[key].weight) < Math.abs(a - state[key].weight) ? b : a)); syncControls(); },
        extra: () => [el('button', { type: 'button', title: 'Upload a .ttf/.otf/.woff font', onclick: () => uploadFont(key) }, 'Upload…')] }),
      row({ label: 'Weight', type: 'select', path: p('weight'), options: weightOptions(key), numeric: true }),
      row({ label: 'Size', type: 'range', path: p('size'), min: 8, max: 220, unit: 'px' }),
      row({ label: 'Color', type: 'color', path: p('color') }),
      row({ label: 'Letter spacing', type: 'range', path: p('letterSpacing'), min: -10, max: 40, step: 0.5, unit: 'px' }),
      row({ label: 'Style', type: 'checkbox', path: p('uppercase'), text: 'UPPERCASE' }),
      row({ label: '', type: 'checkbox', path: p('italic'), text: 'Italic' }),
      row({ label: 'Mask to box', type: 'checkbox', path: p('clipToBox'), text: 'Clip text to backdrop' }),
      row({ label: 'Text shadow', type: 'checkbox', path: p('shadow.on'), text: 'On' }),
      row({ label: 'Shadow color', type: 'color', path: p('shadow.color'), swatches: false, show: (s) => s[key].shadow.on }),
      row({ label: 'Shadow opacity', type: 'range', path: p('shadow.opacity'), min: 0, max: 100, scale: 100, unit: '%', show: (s) => s[key].shadow.on }),
      row({ label: 'Shadow blur', type: 'range', path: p('shadow.blur'), min: 0, max: 60, show: (s) => s[key].shadow.on }),
      row({ label: 'Shadow Y', type: 'range', path: p('shadow.offsetY'), min: -30, max: 30, show: (s) => s[key].shadow.on }),
    ]);
  }

  const isShape = (s) => s.backdrop.type === 'shape';
  const shapeIn = (...names) => (s) => isShape(s) && names.includes(s.backdrop.shape);
  const usesAccent = shapeIn('accent', 'twoTone', 'underline', 'sideBar', 'corners');
  const usesFill = (s) => isShape(s) && !['underline', 'sideBar', 'corners'].includes(s.backdrop.shape);

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
        row({ label: 'Fill', type: 'color', path: 'backdrop.fill', show: usesFill }),
        row({ label: 'Gradient', type: 'checkbox', path: 'backdrop.gradient', text: 'Use gradient', show: usesFill }),
        row({ label: 'Fill 2', type: 'color', path: 'backdrop.fill2', show: (s) => usesFill(s) && s.backdrop.gradient }),
        row({ label: 'Angle', type: 'range', path: 'backdrop.gradientAngle', min: 0, max: 360, unit: '°', show: (s) => usesFill(s) && s.backdrop.gradient }),
        row({ label: 'Accent', type: 'color', path: 'backdrop.accentColor', show: usesAccent }),
        row({ label: 'Accent size', type: 'range', path: 'backdrop.accentWidth', min: 1, max: 60, unit: 'px', show: shapeIn('accent', 'underline', 'sideBar', 'corners') }),
        row({ label: 'Accent gap', type: 'range', path: 'backdrop.accentGap', min: 0, max: 80, unit: 'px', show: shapeIn('accent', 'underline', 'sideBar') }),
        row({ label: 'Opacity', type: 'range', path: 'backdrop.opacity', min: 0, max: 100, scale: 100, unit: '%', show: (s) => s.backdrop.type !== 'none' }),
        row({ label: 'Corner radius', type: 'range', path: 'backdrop.radius', min: 0, max: 80, unit: 'px', show: shapeIn('rounded', 'accent', 'twoTone') }),
        row({ label: 'Slant', type: 'range', path: 'backdrop.skew', min: 0, max: 120, unit: 'px', show: shapeIn('slant') }),
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
        row({ label: 'Scale', type: 'range', path: 'backdrop.image.scale', min: 0.05, max: 4, step: 0.01, show: (s) => s.backdrop.type === 'image' && s.backdrop.image.fit === 'natural' }),
        row({ label: 'Text offset X', type: 'range', path: 'backdrop.image.textOffsetX', min: -400, max: 400, unit: 'px', show: (s) => s.backdrop.type === 'image' }),
        row({ label: 'Text offset Y', type: 'range', path: 'backdrop.image.textOffsetY', min: -300, max: 300, unit: 'px', show: (s) => s.backdrop.type === 'image' }),
      ]),
      section('Size & padding', [
        row({ label: 'Padding X', type: 'range', path: 'backdrop.padX', min: 0, max: 200, unit: 'px' }),
        row({ label: 'Padding Y', type: 'range', path: 'backdrop.padY', min: 0, max: 120, unit: 'px' }),
        row({ label: 'Min width', type: 'range', path: 'backdrop.minWidth', min: 0, max: 1920, unit: 'px' }),
        row({ label: 'Fixed width', type: 'range', path: 'backdrop.fixedWidth', min: 0, max: 1920, unit: 'px' }),
        el('div', { class: 'sub' }, 'Fixed width 0 = size to the text automatically.'),
      ]),
      section('Backdrop shadow', [
        row({ label: 'Shadow', type: 'checkbox', path: 'backdrop.shadow.on', text: 'On', show: (s) => s.backdrop.type !== 'none' }),
        row({ label: 'Color', type: 'color', path: 'backdrop.shadow.color', swatches: false, show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Opacity', type: 'range', path: 'backdrop.shadow.opacity', min: 0, max: 100, scale: 100, unit: '%', show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Blur', type: 'range', path: 'backdrop.shadow.blur', min: 0, max: 100, show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Offset X', type: 'range', path: 'backdrop.shadow.offsetX', min: -50, max: 50, show: (s) => s.backdrop.shadow.on }),
        row({ label: 'Offset Y', type: 'range', path: 'backdrop.shadow.offsetY', min: -50, max: 50, show: (s) => s.backdrop.shadow.on }),
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
        row({ label: 'X', type: 'number', path: 'layout.x', unit: 'px' }),
        row({ label: 'Y', type: 'number', path: 'layout.y', unit: 'px' }),
        row({ label: 'Anchor X', type: 'select', path: 'layout.hAnchor', options: { left: 'Left edge', center: 'Center', right: 'Right edge' } }),
        row({ label: 'Anchor Y', type: 'select', path: 'layout.vAnchor', options: { top: 'Top edge', bottom: 'Bottom edge (grows up)' } }),
        row({ label: 'Text align', type: 'select', path: 'layout.align', options: { left: 'Left', center: 'Center', right: 'Right' } }),
        row({ label: 'Line gap', type: 'range', path: 'layout.lineGap', min: -20, max: 80, unit: 'px' }),
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
    return [
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

  // ---------- Tabs ----------
  const leftTabs = { text: () => [textSection('title', 'Title (line 1)'), textSection('subtitle', 'Subtitle (line 2)')], backdrop: backdropPanel, layout: layoutPanel };
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
    lastLayout = Engine.render(pctx, state, time, { guides: true, safeAreas: view.safeAreas, bounds: view.bounds || dragging });
    const fps = state.comp.fps;
    const f = Math.round(time * fps);
    $('#timecode').textContent = `${time.toFixed(2)}s · f${f} / ${Math.round(state.comp.duration * fps)}`;
    const scrub = $('#scrub'); scrub.max = state.comp.duration; scrub.value = time;
  }
  Engine.onImageLoad = () => { drawPreview(); syncControls(); };

  function setTime(t) { time = Math.max(0, Math.min(state.comp.duration, t)); drawPreview(); drawTimeline(); }
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
    dragging = true; preview.setPointerCapture(e.pointerId);
    dragStart = { m: toComp(e), x: state.layout.x, y: state.layout.y };
  });
  preview.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const [mx, my] = toComp(e);
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
  const TL = { left: 86, right: 16, ruler: 22, rowH: 28 };
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
      g.fillStyle = '#8a93a6'; g.font = '11px -apple-system, sans-serif'; g.fillText(label, 10, y + 15);
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
    // Playhead
    const px = sx(time);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke(); g.lineWidth = 1;
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(px - 5, 0); g.lineTo(px + 5, 0); g.lineTo(px, 7); g.fill();
    g.fillStyle = '#596176'; g.font = '10px -apple-system, sans-serif';
    g.fillText('Drag a bar to retime it · drag its start or end ramp to move only that part', TL.left, h - 6);
  }
  tl.addEventListener('pointerdown', (e) => {
    const { sx, st } = tlGeom();
    const r = tl.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top;
    tl.setPointerCapture(e.pointerId);
    const i = Math.floor((my - TL.ruler - 6) / TL.rowH);
    if (my > TL.ruler && i >= 0 && i < TRACKS.length) {
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
    const a = state[tlDrag.key].anim; const dt = t - tlDrag.t0; const D = state.comp.duration;
    const r2 = (v) => Math.round(Math.max(0, v) * 100) / 100;
    if (tlDrag.mode === 'in' || tlDrag.mode === 'both') a.in.delay = r2(Math.min(tlDrag.delay + dt, D - 0.1));
    if (tlDrag.mode === 'out' || tlDrag.mode === 'both') a.out.offset = r2(Math.min(tlDrag.offset - dt, D - 0.1));
    changed({ sync: true });
  });
  tl.addEventListener('pointerup', () => (tlDrag = null));
  new ResizeObserver(drawTimeline).observe(tl);

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
  $('#btnExportPreset').onclick = async () => {
    const r = await api.presets.exportFile(state.title.text || 'lower-third', clone(state));
    if (r) toast('Preset file saved');
  };
  $('#btnImportPreset').onclick = async () => {
    const data = await api.presets.importFile();
    if (!data) return;
    const st = data.state || data;
    replaceState(st);
    if (data.name) { await api.presets.save(data.name, clone(state)); await refreshPresets(`u:${data.name}`); }
    toast('Preset imported');
  };

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
    $('#exportSummary').textContent = `${width} × ${height} · ${fps} fps · ${duration}s · ${frames} frames`;
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
        Engine.render(ctx, snap, i / fps);
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
    if (mod && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); $('#btnSavePreset').click(); return; }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); $('#btnExport').click(); return; }
    if (typing || dlg.open) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowLeft') $('#btnPrevFrame').click();
    else if (e.key === 'ArrowRight') $('#btnNextFrame').click();
    else if (e.key === 'Home') $('#btnStart').click();
  });
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;

  // ---------- Boot ----------
  async function boot() {
    for (const f of await api.fonts.list()) await addUserFont(f);
    buildTabs($('nav[data-for=left]'), $('#leftBody'), leftTabs);
    buildTabs($('nav[data-for=right]'), $('#rightBody'), rightTabs);
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
