/* Thirdline — everything around the editor: start screen, About, Help (shortcuts, guide, report a
   problem), Settings, licence and plan, recent projects, export notifications.
   Loaded before app.js; app.js calls Shell.init(ctx) at boot with the editor functions it needs. */
(function (global) {
  'use strict';
  let ctx = null;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (...a) => ctx.el(...a);
  const api = () => ctx.api;

  // ---------- Settings (this computer) ----------
  const PREFS_KEY = 'thirdline:prefs';
  const PREF_DEFAULTS = { showStart: true, checkUpdates: true, exportDir: '', newRes: '1920x1080', newFps: 30, notify: true };
  let prefs = { ...PREF_DEFAULTS };
  try { prefs = { ...PREF_DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY)) || {}) }; } catch {}
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

  // ---------- Recent projects ----------
  const RECENT_KEY = 'thirdline:recent';
  const readRecent = () => { try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter((r) => r && r.path); } catch { return []; } };
  function addRecent(path, name) {
    if (!path || api().browser) return;
    const list = [{ path, name: name || path.split(/[\\/]/).pop().replace(/\.l3rd$/i, ''), at: Date.now() }, ...readRecent().filter((r) => r.path !== path)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
  }
  function forgetRecent(path) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((r) => r.path !== path))); } catch {}
  }

  // ---------- Plan (Free / Pro / Studio) ----------
  const FULL = { name: 'Studio', watermark: false, maxHeight: Infinity, advanced: true, batch: true, live: true, mogrt: true };
  let plan = { enforce: false, plan: 'studio', features: FULL };
  const FEATURE_INFO = {
    advanced: ['Advanced mode', 'Pro', 'Layers, keyframes, the graph editor, masks and the full timeline.'],
    batch: ['Batch export from a spreadsheet', 'Studio', 'One video per row of a CSV: every name for an event in one go.'],
    live: ['Live output for OBS', 'Studio', 'Send lower thirds to OBS or vMix as a browser source and cue them from a Stream Deck.'],
    mogrt: ['Export as .mogrt', 'Studio', 'Editable templates for Premiere Pro, built in After Effects.'],
    resolution: ['Exports above 1080p', 'Pro', '4K and 1440p exports.'],
    watermark: ['Exports without the watermark', 'Pro', ''],
  };
  async function refreshPlan(remote = false) {
    if (!api().license) { plan = { enforce: false, plan: 'studio', features: FULL }; return plan; }
    try { plan = await (remote ? api().license.refresh() : api().license.status()); } catch {}
    plan.features = { ...FULL, ...(plan.features || {}) };
    if (plan.features.maxHeight == null) plan.features.maxHeight = Infinity; // JSON turns Infinity into null
    renderPlanBadge();
    return plan;
  }
  const can = (f) => !plan.enforce || !!plan.features[f];
  // True if the feature is available; otherwise explains which plan has it.
  function require(feature) {
    if (can(feature)) return true;
    showUpgrade(feature);
    return false;
  }
  // Free plan: exports up to 1080 on the short side (so 9:16 and 1:1 versions still work).
  const resolutionOk = (w, h) => !plan.enforce || Math.min(w, h) <= (plan.features.maxHeight || Infinity);
  const watermarked = () => plan.enforce && !!plan.features.watermark;
  function drawWatermark(c, w, h) {
    const s = Math.max(14, Math.round(Math.min(w, h) * 0.022));
    c.save();
    c.font = `600 ${s}px Inter, -apple-system, sans-serif`;
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    const text = 'Made with Thirdline';
    const x = w - s * 1.4, y = h - s * 1.2;
    c.globalAlpha = 0.55; c.fillStyle = '#000'; c.fillText(text, x + 1, y + 1);
    c.globalAlpha = 0.8; c.fillStyle = '#fff'; c.fillText(text, x, y);
    c.restore();
  }
  function renderPlanBadge() {
    const b = $('#planBadge'); if (!b) return;
    if (!plan.enforce || (plan.licensed && plan.plan === 'studio')) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = plan.trial ? `Trial · ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'} left` : plan.licensed ? `${plan.features.name || 'Pro'} · Upgrade` : 'Free · Upgrade';
    b.classList.toggle('free', !plan.licensed && !plan.trial);
  }

  // ---------- Dialog helper ----------
  function modal(id, title, body, buttons = [['Close', 'close', true]], { wide = false } = {}) {
    const old = document.getElementById(id); if (old) old.remove();
    const d = el('dialog', { id, class: wide ? 'shell-dlg wide' : 'shell-dlg' });
    const actions = el('div', { class: 'actions' });
    const form = el('form', { method: 'dialog', class: 'modal' }, el('h2', {}, title), body, actions);
    for (const [label, fn, primary] of buttons) {
      actions.append(el('button', { type: 'button', class: primary ? 'primary' : '', onclick: async () => { if (fn === 'close') return d.close(); const keep = await fn(d); if (keep !== true) d.close(); } }, label));
    }
    d.append(form);
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    document.body.append(d);
    d.showModal();
    return d;
  }

  // ---------- About ----------
  async function showAbout() {
    const info = api().diagnostics ? await api().diagnostics().catch(() => ({})) : {};
    const ver = info.app || (api().info ? (await api().info()).version : '') || '';
    const body = el('div', { class: 'about' },
      el('div', { class: 'about-logo' }, el('span', { class: 'logo' }, '▁▃'), ' Thirdline'),
      el('p', { class: 'sub' }, 'Animated lower thirds with transparent backgrounds.'),
      el('table', { class: 'kv' },
        el('tr', {}, el('td', {}, 'Version'), el('td', {}, ver || 'dev')),
        plan.enforce ? el('tr', {}, el('td', {}, 'Plan'), el('td', {}, plan.trial ? `Studio trial (${plan.daysLeft} days left)` : plan.licensed ? `${plan.features.name}${plan.email ? ` · ${plan.email}` : ''}` : 'Free')) : null,
        info.electron ? el('tr', {}, el('td', {}, 'Electron'), el('td', {}, info.electron)) : null,
        info.ffmpeg ? el('tr', {}, el('td', {}, 'ffmpeg'), el('td', {}, info.ffmpeg)) : null),
      el('p', { class: 'sub' }, '© 2026 Thirdline. Bundled fonts are under the SIL Open Font License. Video encoding by FFmpeg. ',
        el('a', { href: '#', onclick: (e) => { e.preventDefault(); openGuide('licenses.html'); } }, 'Third-party licences')));
    modal('aboutDialog', 'About Thirdline', body);
  }

  // ---------- Keyboard shortcuts ----------
  const isMac = /Mac/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl+';
  const shift = (k) => (isMac ? `⇧⌘${k}` : `Ctrl+Shift+${k}`);
  const SHORTCUTS = [
    ['Project', [[`${mod}N`, 'New project'], [`${mod}O`, 'Open'], [`${mod}S`, 'Save'], [shift('S'), 'Save as'], [`${mod}E`, 'Export'], [`${mod},`, 'Settings']]],
    ['Edit', [[`${mod}Z`, 'Undo'], [shift('Z'), 'Redo'], [`${mod}C / ${mod}V`, 'Copy / paste layers or keyframes'], [`${mod}D`, 'Duplicate'], [`${mod}G`, 'Group layers'], [shift('G'), 'Ungroup'], ['Delete', 'Delete keyframes or layer']]],
    ['Playback', [['Space', 'Play / pause'], ['← / →', 'Previous / next frame'], ['Home', 'Go to start'], ['J / K', 'Previous / next keyframe']]],
    ['Tools (Advanced)', [['V', 'Select'], ['P', 'Pen (shape)'], [isMac ? '⇧P' : 'Shift+P', 'Pen (mask)'], ['H', 'Hand (pan)'], ['Space + drag', 'Pan the preview'], ['`', 'Clean preview (hide guides)']]],
    ['Preview and timeline', [['Tab', 'Next layer'], ['Esc', 'Deselect'], ['Shift + drag', 'Lock move to one axis'], ['Alt + drag', 'Move without snapping'], ['Alt + scroll', 'Zoom timeline'], ['Double-click ruler', 'Fit timeline']]],
    ['Help', [['F1', 'User guide'], [`${mod}/`, 'This list']]],
  ];
  function showShortcuts() {
    const body = el('div', { class: 'shortcuts' }, ...SHORTCUTS.map(([g, rows]) => el('section', {}, el('h4', {}, g),
      ...rows.map(([k, what]) => el('div', { class: 'sc-row' }, el('kbd', {}, k), el('span', {}, what))))));
    modal('shortcutsDialog', 'Keyboard shortcuts', body, [['Open user guide', () => openGuide()], ['Close', 'close', true]], { wide: true });
  }

  // ---------- User guide ----------
  function openGuide(page = 'guide.html') {
    if (api().help) return api().help.guide(page);
    window.open(`help/${page}`, '_blank');
  }

  // ---------- Report a problem ----------
  async function showReport() {
    const info = api().diagnostics ? await api().diagnostics().catch(() => ({})) : { app: 'browser' };
    const cfg = api().config ? await api().config().catch(() => ({})) : {};
    const what = el('textarea', { rows: 5, placeholder: 'What happened, and what did you expect? Steps to make it happen again help a lot.' });
    const diag = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n');
    const report = () => `${what.value.trim() || '(no description)'}\n\n---\n${diag}`;
    const body = el('div', {},
      el('p', { class: 'sub' }, 'Tell us what went wrong. The details below are added so we can reproduce it; no project files or names are sent.'),
      what,
      el('pre', { class: 'diag' }, diag));
    const buttons = [['Copy report', async () => { try { await navigator.clipboard.writeText(report()); ctx.toast('Report copied'); } catch { ctx.toast('Couldn’t copy'); } return true; }]];
    if (cfg.supportEmail) buttons.push(['Send by email', () => { api().updates.open(`mailto:${cfg.supportEmail}?subject=${encodeURIComponent(`Thirdline ${info.app || ''} problem`)}&body=${encodeURIComponent(report())}`); }, true]);
    else if (cfg.supportUrl) buttons.push(['Copy and open the issue page', async () => { try { await navigator.clipboard.writeText(report()); } catch {} api().updates.open(cfg.supportUrl); ctx.toast('Report copied: paste it into the page'); }, true]);
    buttons.unshift(['Cancel', 'close']);
    modal('reportDialog', 'Report a problem', body, buttons);
  }

  // ---------- Settings ----------
  function showPrefs() {
    const res = el('select', {}, ...[['1280x720', '720p (1280 × 720)'], ['1920x1080', '1080p (1920 × 1080)'], ['2560x1440', '1440p (2560 × 1440)'], ['3840x2160', '4K (3840 × 2160)'], ['1080x1920', 'Vertical (1080 × 1920)'], ['1080x1080', 'Square (1080 × 1080)']]
      .map(([v, t]) => el('option', { value: v, selected: prefs.newRes === v }, t)));
    const fps = el('select', {}, ...[23.976, 24, 25, 29.97, 30, 50, 59.94, 60].map((f) => el('option', { value: f, selected: Number(prefs.newFps) === f }, String(f))));
    const dirLabel = el('span', { class: 'sub path' }, prefs.exportDir || 'Ask each time');
    let dir = prefs.exportDir;
    const chk = (k, label) => { const i = el('input', { type: 'checkbox' }); i.checked = !!prefs[k]; return [i, el('label', { class: 'chk' }, i, ' ', label)]; };
    const [startI, startL] = chk('showStart', 'Show the start screen when Thirdline opens');
    const [updI, updL] = chk('checkUpdates', 'Check for updates when Thirdline opens');
    const [notI, notL] = chk('notify', 'Notify me when an export finishes while Thirdline is in the background');
    const body = el('div', { class: 'prefs' },
      el('h4', {}, 'New projects'),
      el('div', { class: 'row' }, el('label', {}, 'Resolution'), res),
      el('div', { class: 'row' }, el('label', {}, 'Frame rate'), fps),
      el('h4', {}, 'Export'),
      el('div', { class: 'row' }, el('label', {}, 'Save exports in'), el('div', { class: 'dirpick' }, dirLabel,
        api().exporter && api().exporter.chooseFolderDefault ? el('button', { type: 'button', onclick: async () => { const d = await api().exporter.chooseFolderDefault(); if (d) { dir = d; dirLabel.textContent = d; } } }, 'Choose…') : null,
        el('button', { type: 'button', onclick: () => { dir = ''; dirLabel.textContent = 'Ask each time'; } }, 'Reset'))),
      notL,
      el('h4', {}, 'App'),
      startL, updL);
    modal('prefsDialog', 'Settings', body, [['Cancel', 'close'], ['Save', () => {
      Object.assign(prefs, { newRes: res.value, newFps: Number(fps.value), exportDir: dir, showStart: startI.checked, checkUpdates: updI.checked, notify: notI.checked });
      savePrefs(); ctx.toast('Settings saved');
    }, true]]);
  }

  // ---------- Licence ----------
  async function showLicense() {
    await refreshPlan();
    if (!plan.enforce) {
      modal('licenseDialog', 'Licence', el('p', { class: 'sub' }, 'This build of Thirdline has every feature unlocked.'));
      return;
    }
    const key = el('input', { type: 'text', placeholder: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX', style: 'width:100%' });
    const err = el('p', { class: 'error', hidden: true });
    const state = plan.licensed
      ? el('p', {}, `Thirdline ${plan.features.name} is active on this computer`, plan.email ? ` (${plan.email})` : '', `. Key ${plan.key}.`)
      : plan.trial ? el('p', {}, `You’re on the free trial with every Studio feature: ${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'} left.`)
        : el('p', {}, 'You’re on Thirdline Free: Easy mode, exports up to 1080p with a small watermark.', plan.expired ? ' Your previous licence is no longer valid.' : '');
    const plans = el('table', { class: 'kv plans' },
      el('tr', {}, el('td', {}, el('b', {}, 'Free')), el('td', {}, 'Easy mode, all styles, up to 1080p, small watermark')),
      el('tr', {}, el('td', {}, el('b', {}, 'Pro')), el('td', {}, 'Advanced mode, no watermark, up to 4K')),
      el('tr', {}, el('td', {}, el('b', {}, 'Studio')), el('td', {}, 'Pro + batch export, live output for OBS, .mogrt')));
    const body = el('div', {}, state, plans,
      plan.licensed ? null : el('div', { style: 'margin-top:12px' }, el('label', { class: 'sub' }, 'Licence key'), key), err);
    const buttons = [['Close', 'close']];
    if (plan.licensed) buttons.push(['Remove from this computer', async () => { if (!confirm('Remove the licence from this computer? You can activate it again later.')) return true; await api().license.deactivate(); await refreshPlan(); ctx.planChanged(); ctx.toast('Licence removed'); }]);
    if (plan.buyUrl && !(plan.licensed && plan.plan === 'studio')) buttons.push(['Buy…', () => { api().updates.open(plan.buyUrl); return true; }]);
    if (!plan.licensed) buttons.push(['Activate', async (d) => {
      err.hidden = true;
      const r = await api().license.activate(key.value);
      if (r.error) { err.hidden = false; err.textContent = r.error; return true; }
      await refreshPlan(); ctx.planChanged();
      ctx.toast(`Thirdline ${plan.features.name} activated. Thank you!`);
    }, true]);
    modal('licenseDialog', 'Licence', body, buttons);
  }
  function showUpgrade(feature) {
    const [what, tier, why] = FEATURE_INFO[feature] || [feature, 'Pro', ''];
    const body = el('div', {},
      el('p', {}, `${what} is part of Thirdline ${tier}.`),
      why ? el('p', { class: 'sub' }, why) : null,
      el('p', { class: 'sub' }, plan.trialEnded ? 'Your free trial has ended.' : ''));
    const buttons = [['Not now', 'close'], ['Enter licence key…', () => showLicense()]];
    if (plan.buyUrl) buttons.push([`Get ${tier}`, () => api().updates.open(plan.buyUrl), true]);
    modal('upgradeDialog', `Upgrade to ${tier}`, body, buttons);
  }

  // ---------- Start screen ----------
  function showStart() {
    const old = $('#startScreen'); if (old) old.remove();
    const close = () => { s.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    const recent = readRecent();
    const styles = ctx.styles().slice(0, 12);
    const samples = (global.Samples || []);
    const thumb = (st) => { try { return ctx.thumbFor(st); } catch { return ''; } };
    const s = el('div', { id: 'startScreen', class: 'start', role: 'dialog', 'aria-label': 'Start' },
      el('div', { class: 'start-card' },
        el('header', {},
          el('div', { class: 'brand' }, el('span', { class: 'logo' }, '▁▃'), ' Thirdline'),
          el('span', { class: 'spacer' }),
          el('button', { type: 'button', class: 'ghost', onclick: () => openGuide() }, 'User guide'),
          el('button', { type: 'button', class: 'primary', onclick: () => close() }, ctx.hasWork() ? 'Continue where I left off' : 'Start designing')),
        el('div', { class: 'start-body' },
          el('section', { class: 'start-main' },
            el('h3', {}, 'Start from a style'),
            el('div', { class: 'styles start-styles' }, ...styles.map((it) => el('button', { type: 'button', class: 'st', onclick: async () => { if (await ctx.newFromStyle(it)) close(); } },
              el('img', { src: thumb(ctx.styleState(it)), alt: '' }), el('span', {}, it.name)))),
            samples.length ? el('h3', {}, 'Sample projects') : null,
            samples.length ? el('div', { class: 'styles start-samples' }, ...samples.map((sm) => {
              const st = sm.build();
              return el('button', { type: 'button', class: 'st', title: sm.about, onclick: async () => { if (await ctx.loadState(st, sm.name)) close(); } },
                el('img', { src: thumb(st), alt: '' }), el('span', {}, sm.name));
            })) : null),
          el('aside', { class: 'start-side' },
            el('h3', {}, 'Open'),
            el('button', { type: 'button', class: 'wide', onclick: async () => { if (await ctx.openProject()) close(); } }, 'Open a project…'),
            el('button', { type: 'button', class: 'wide', onclick: async () => { if (await ctx.newBlank()) close(); } }, 'New blank project'),
            el('h3', {}, 'Recent'),
            recent.length ? el('div', { class: 'recent' }, ...recent.map((r) => el('button', { type: 'button', class: 'recent-item', title: r.path, onclick: async () => {
              const ok = await ctx.openPath(r.path);
              if (ok === 'missing') { forgetRecent(r.path); ctx.toast('That project was moved or deleted'); showStart(); } else if (ok) close();
            } }, el('b', {}, r.name), el('small', {}, r.path.replace(/^\/Users\/[^/]+/, '~'))))) : el('p', { class: 'sub' }, 'Projects you save or open show up here.'),
            el('h3', {}, 'Learn'),
            el('button', { type: 'button', class: 'link', onclick: () => openGuide() }, 'Make your first lower third (2 min read)'),
            el('button', { type: 'button', class: 'link', onclick: showShortcuts }, 'Keyboard shortcuts'),
            el('label', { class: 'chk start-pref' }, (() => { const i = el('input', { type: 'checkbox' }); i.checked = prefs.showStart; i.onchange = () => { prefs.showStart = i.checked; savePrefs(); }; return i; })(), ' Show this when Thirdline opens')))));
    document.body.append(s);
  }

  // ---------- Export finished ----------
  function notifyDone(title, body, onClick) {
    if (!prefs.notify || document.hasFocus() || typeof Notification === 'undefined') return;
    try { const n = new Notification(title, { body, silent: false }); if (onClick) n.onclick = () => { window.focus(); onClick(); }; } catch {}
  }

  // ---------- Accessibility: icon-only buttons get their tooltip as a label ----------
  function labelIconButtons(root = document) {
    for (const b of root.querySelectorAll('button[title]:not([aria-label])')) {
      const t = (b.textContent || '').replace(/[^\p{L}\p{N}]+/gu, '');
      if (t.length < 2) b.setAttribute('aria-label', b.title.replace(/\s*\(.*\)\s*$/, ''));
    }
  }

  global.Shell = {
    init(c) {
      ctx = c;
      labelIconButtons();
      new MutationObserver(() => labelIconButtons()).observe(document.body, { childList: true, subtree: true });
      const badge = $('#planBadge'); if (badge) badge.onclick = () => showLicense();
      refreshPlan(true).then(() => ctx.planChanged());
    },
    get prefs() { return prefs; },
    get plan() { return plan; },
    can, require, resolutionOk, watermarked, drawWatermark, refreshPlan,
    showAbout, showShortcuts, showReport, showPrefs, showLicense, showUpgrade, showStart, openGuide,
    addRecent, readRecent, notifyDone,
  };
})(window);
