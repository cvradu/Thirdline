// Templates and batch export helpers: CSV parsing and filling a design's text fields from a row.
(function (global) {
  // RFC 4180-style CSV (quotes, escaped quotes, commas/newlines in quotes). Also accepts ; or tab.
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const clean = rows.filter((r) => r.some((c) => c.trim() !== ''));
    if (!clean.length) return { headers: [], rows: [] };
    const headers = clean[0].map((h, i) => h.trim() || `Column ${i + 1}`);
    return { headers, rows: clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
  }
  // Text fields a template can expose: title, subtitle and every extra text layer.
  function textFields(state) {
    const out = [{ id: 'title', label: 'Name / title line', path: 'title.text' }, { id: 'subtitle', label: 'Second line', path: 'subtitle.text' }];
    for (const [id, ly] of Object.entries(state.layers || {})) if (ly.kind === 'text') out.push({ id, label: ly.name || 'Text', path: `layers.${id}.text` });
    return out;
  }
  // Guess which CSV column feeds which field (by name), falling back to column order.
  function autoMap(fields, headers) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hints = { title: ['name', 'title', 'fullname', 'line1', 'person'], subtitle: ['subtitle', 'role', 'job', 'jobtitle', 'position', 'line2', 'description', 'company'] };
    const used = new Set(), map = {};
    for (const f of fields) {
      const want = [...(hints[f.id] || []), norm(f.label)];
      const h = headers.find((x) => !used.has(x) && want.includes(norm(x)));
      if (h) { map[f.id] = h; used.add(h); }
    }
    for (const f of fields) if (!map[f.id]) { const h = headers.find((x) => !used.has(x)); if (h) { map[f.id] = h; used.add(h); } }
    return map;
  }
  function fillRow(state, fields, map, row) {
    const s = JSON.parse(JSON.stringify(state));
    for (const f of fields) {
      const col = map[f.id];
      if (!col) continue;
      const parts = f.path.split('.'); let o = s;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = row[col] ?? '';
    }
    return s;
  }
  // Safe, unique file names from a row (e.g. "01 Alexandra Popescu").
  function fileNames(rows, map, fields) {
    const seen = new Map();
    const pad = String(rows.length).length;
    return rows.map((r, i) => {
      const base = (r[map[fields[0].id]] || `row ${i + 1}`).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().slice(0, 80) || `row ${i + 1}`;
      let name = `${String(i + 1).padStart(pad, '0')} ${base}`;
      const n = (seen.get(name) || 0) + 1; seen.set(name, n);
      if (n > 1) name += ` (${n})`;
      return name;
    });
  }
  global.Batch = { parseCSV, textFields, autoMap, fillRow, fileNames };
})(typeof window !== 'undefined' ? window : globalThis);
