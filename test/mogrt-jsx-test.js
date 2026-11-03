// Runs src/ae/thirdline-build.jsx against a mock After Effects object model, for several designs,
// to catch script errors without After Effects. Checks ES3 syntax, that every layer/effect/mask
// is created, that expressions compile, and that the .aep save and .mogrt export are called.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');

const template = fs.readFileSync(path.join(__dirname, '../src/ae/thirdline-build.jsx'), 'utf8');
acorn.parse(template, { ecmaVersion: 3 }); // ExtendScript is ES3

function makeAE(log) {
  const PVT = { NO_VALUE: 'NO_VALUE', OneD: 'OneD', TwoD: 'TwoD', TwoD_SPATIAL: 'TwoD_SPATIAL', ThreeD: 'ThreeD', ThreeD_SPATIAL: 'ThreeD_SPATIAL', COLOR: 'COLOR', LAYER_INDEX: 'LAYER_INDEX', SHAPE: 'SHAPE', TEXT_DOCUMENT: 'TEXT_DOCUMENT', CUSTOM_VALUE: 'CUSTOM_VALUE', MASK_INDEX: 'MASK_INDEX' };
  const PT = { PROPERTY: 'PROPERTY', INDEXED_GROUP: 'INDEXED_GROUP', NAMED_GROUP: 'NAMED_GROUP' };
  // Value types of known leaf properties.
  const LEAF = {
    'ADBE Anchor Point': 'ThreeD_SPATIAL', 'ADBE Position': 'ThreeD_SPATIAL', 'ADBE Scale': 'ThreeD', 'ADBE Rotate Z': 'OneD', 'ADBE Opacity': 'OneD',
    'ADBE Text Document': 'TEXT_DOCUMENT', 'ADBE Mask Shape': 'SHAPE', 'ADBE Mask Feather': 'TwoD',
    'ADBE Vector Rect Size': 'TwoD', 'ADBE Vector Rect Position': 'TwoD_SPATIAL', 'ADBE Vector Rect Roundness': 'OneD',
    'ADBE Vector Ellipse Size': 'TwoD', 'ADBE Vector Ellipse Position': 'TwoD_SPATIAL', 'ADBE Vector Shape': 'SHAPE',
    'ADBE Vector Fill Color': 'COLOR', 'ADBE Vector Stroke Color': 'COLOR', 'ADBE Vector Stroke Width': 'OneD', 'ADBE Vector Merge Type': 'OneD',
    'ADBE Text Opacity': 'OneD', 'ADBE Text Position 3D': 'ThreeD_SPATIAL', 'ADBE Text Scale 3D': 'ThreeD', 'ADBE Text Rotation': 'OneD',
    'ADBE Text Blur': 'TwoD', 'ADBE Text Tracking Amount': 'OneD', 'ADBE Text Fill Color': 'COLOR',
    'ADBE Text Percent Start': 'OneD', 'ADBE Text Percent End': 'OneD', 'ADBE Text Percent Offset': 'OneD', 'ADBE Text Selector Max Amount': 'OneD',
    'ADBE Text Range Type2': 'OneD', 'ADBE Text Range Shape': 'OneD', 'ADBE Text Expressible Amount': 'ThreeD',
    'ADBE Text Anchor Point Option': 'OneD', 'ADBE Text Anchor Point Align': 'TwoD',
  };
  const EFFECTS = {
    'ADBE Slider Control': ['OneD'],
    'ADBE Gaussian Blur 2': ['OneD', 'OneD', 'OneD'],
    'ADBE Drop Shadow': ['COLOR', 'OneD', 'OneD', 'OneD', 'OneD', 'OneD'],
    'ADBE Ramp': ['TwoD_SPATIAL', 'COLOR', 'TwoD_SPATIAL', 'COLOR', 'OneD', 'OneD', 'OneD'],
    'ADBE 4ColorGradient': ['NO_VALUE', 'TwoD_SPATIAL', 'COLOR', 'TwoD_SPATIAL', 'COLOR', 'TwoD_SPATIAL', 'COLOR', 'TwoD_SPATIAL', 'COLOR', 'OneD', 'OneD', 'OneD', 'OneD'],
    'ADBE Set Matte3': ['LAYER_INDEX', 'OneD', 'OneD', 'OneD', 'OneD', 'OneD'],
    // Edge type, edge colour, border, sharpness, fractal influence, scale, stretch, offset, complexity, evolution
    'ADBE Roughen Edges': ['OneD', 'COLOR', 'OneD', 'OneD', 'OneD', 'OneD', 'OneD', 'TwoD_SPATIAL', 'OneD', 'OneD'],
  };
  const GROUPS = {
    'ADBE Transform Group': ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'],
    'ADBE Text Properties': ['ADBE Text Document', 'ADBE Text Animators', 'ADBE Text More Options'],
    'ADBE Text More Options': ['ADBE Text Anchor Point Option', 'ADBE Text Anchor Point Align'],
    'ADBE Text Animator': ['ADBE Text Selectors', 'ADBE Text Animator Properties'],
    'ADBE Text Selector': ['ADBE Text Percent Start', 'ADBE Text Percent End', 'ADBE Text Percent Offset', 'ADBE Text Range Advanced'],
    'ADBE Text Range Advanced': ['ADBE Text Selector Max Amount', 'ADBE Text Range Type2', 'ADBE Text Range Shape'],
    'ADBE Text Expressible Selector': ['ADBE Text Range Type2', 'ADBE Text Expressible Amount'],
    'ADBE Mask Atom': ['ADBE Mask Shape', 'ADBE Mask Feather'],
    'ADBE Vector Group': ['ADBE Vectors Group', 'ADBE Vector Transform Group'],
    'ADBE Vector Shape - Rect': ['ADBE Vector Rect Size', 'ADBE Vector Rect Position', 'ADBE Vector Rect Roundness'],
    'ADBE Vector Shape - Ellipse': ['ADBE Vector Ellipse Size', 'ADBE Vector Ellipse Position'],
    'ADBE Vector Shape - Group': ['ADBE Vector Shape'],
    'ADBE Vector Graphic - Fill': ['ADBE Vector Fill Color'],
    'ADBE Vector Graphic - Stroke': ['ADBE Vector Stroke Color', 'ADBE Vector Stroke Width'],
    'ADBE Vector Filter - Merge': ['ADBE Vector Merge Type'],
  };
  const INDEXED = new Set(['ADBE Effect Parade', 'ADBE Mask Parade', 'ADBE Text Animators', 'ADBE Text Selectors', 'ADBE Text Animator Properties', 'ADBE Root Vectors Group', 'ADBE Vectors Group']);
  let exprCount = 0;
  class Prop {
    constructor(match, parent, type) {
      this.matchName = match; this.name = match; this.parentProperty = parent;
      this.children = [];
      this.isLeaf = !!type;
      this.propertyType = type ? PT.PROPERTY : INDEXED.has(match) ? PT.INDEXED_GROUP : PT.NAMED_GROUP;
      this.propertyValueType = type || PVT.NO_VALUE;
      this.isSpatial = /SPATIAL/.test(type || '');
      this.keys = []; this.value = undefined; this._expr = '';
      this.hasMax = match === 'ADBE Drop Shadow-op'; this.maxValue = 255;
      for (const c of GROUPS[match] || []) this._add(c);
    }
    _add(match) {
      const leaf = LEAF[match];
      const p = new Prop(match, this, leaf);
      this.children.push(p);
      return p;
    }
    get numProperties() { return this.children.length; }
    get propertyIndex() { return this.parentProperty ? this.parentProperty.children.indexOf(this) + 1 : 0; }
    property(k) {
      if (typeof k === 'number') { const c = this.children[k - 1]; if (!c) throw new Error(`no property #${k} in ${this.matchName}`); return c; }
      const c = this.children.find((x) => x.matchName === k || x.name === k);
      if (!c) throw new Error(`no property "${k}" in ${this.matchName}`);
      return c;
    }
    addProperty(match) {
      if (this.isLeaf) throw new Error('addProperty on a leaf');
      if (this.matchName === 'ADBE Effect Parade') {
        if (!EFFECTS[match]) throw new Error('unknown effect ' + match);
        const fx = new Prop(match, this);
        fx.propertyType = PT.INDEXED_GROUP;
        EFFECTS[match].forEach((t, i) => { const q = new Prop(`${match}-${i + 1}`, fx, t === 'NO_VALUE' ? null : t); if (t === 'NO_VALUE') q.propertyType = PT.NAMED_GROUP; if (match === 'ADBE Drop Shadow' && i === 1) { q.hasMax = true; q.maxValue = 255; } fx.children.push(q); });
        this.children.push(fx);
        return fx;
      }
      if (this.matchName === 'ADBE Text Animator Properties' && !LEAF[match]) throw new Error('unknown animator property ' + match);
      return LEAF[match] ? this._add(match) : (() => { const p = new Prop(match, this); this.children.push(p); return p; })();
    }
    setValue(v) { if (!this.isLeaf) throw new Error('setValue on group ' + this.matchName); if (v === undefined) throw new Error('setValue(undefined) on ' + this.matchName); this.value = v; }
    setValueAtTime(t, v) { if (!this.isLeaf) throw new Error('key on group'); if (v === undefined || (typeof v === 'number' && !isFinite(v))) throw new Error('bad key value on ' + this.matchName); this.keys = this.keys.filter((k) => k.t !== t); this.keys.push({ t, v }); this.keys.sort((a, b) => a.t - b.t); }
    nearestKeyIndex(t) { let best = 1, bd = Infinity; this.keys.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < bd) { bd = d; best = i + 1; } }); return best; }
    keyInInterpolationType() { return 'BEZIER'; }
    keyInTemporalEase(i) { return this._ease(); }
    keyOutTemporalEase(i) { return this._ease(); }
    _ease() { const n = this.propertyValueType === 'TwoD' ? 2 : this.propertyValueType === 'ThreeD' ? 3 : 1; return Array.from({ length: n }, () => new KeyframeEase(0, 16.7)); }
    setInterpolationTypeAtKey(i) { if (i < 1 || i > this.keys.length) throw new Error('bad key index'); }
    setTemporalEaseAtKey(i, a, b) {
      const n = this.propertyValueType === 'TwoD' ? 2 : this.propertyValueType === 'ThreeD' ? 3 : 1;
      if (a.length !== n || b.length !== n) throw new Error(`ease array length ${a.length}/${b.length}, want ${n} on ${this.matchName}`);
      for (const e of [...a, ...b]) if (!(e.influence >= 0.1 && e.influence <= 100) || !isFinite(e.speed)) throw new Error('bad ease ' + JSON.stringify(e));
    }
    set expression(s) { this._expr = s; exprCount++; try { new Function('time', 'thisComp', 'createPath', 'textIndex', 'textTotal', 'text', 'value', s); } catch (e) { throw new Error(`expression does not compile on ${this.matchName}: ${e.message}`); } }
    get expression() { return this._expr; }
    get expressionError() { return ''; }
    canAddToMotionGraphicsTemplate() { return true; }
    addToMotionGraphicsTemplateAs(comp, name) { log.eg.push(name); }
  }
  function KeyframeEase(speed, influence) { if (!(this instanceof KeyframeEase)) throw new Error('KeyframeEase without new'); this.speed = speed; this.influence = influence; }
  class TextDocument {
    constructor(t) { this.text = t; }
    resetCharStyle() {}
    set fontObject(f) { this.font = f.postScriptName; this.fontFamily = f.familyName; }
  }
  function layerBase(comp, kind, extra = {}) {
    const L = new Prop('ADBE ' + kind + ' Layer', null);
    L.children = [];
    for (const g of ['ADBE Transform Group', 'ADBE Effect Parade', 'ADBE Mask Parade']) L._add(g);
    Object.assign(L, extra, { motionBlur: false, startTime: 0, inPoint: 0, outPoint: comp.duration });
    Object.defineProperty(L, 'index', { get: () => comp.layers.list.indexOf(L) + 1 });
    L.canAddToMotionGraphicsTemplate = () => true;
    L.addToMotionGraphicsTemplateAs = (c, n) => log.eg.push(n);
    comp.layers.list.unshift(L);
    return L;
  }
  const project = {
    items: {
      addComp(name, w, h, par, dur, fps) {
        const comp = { name, width: w, height: h, duration: dur, frameRate: fps, layers: { list: [] }, markers: [], time: 0,
          markerProperty: { setValueAtTime: (t, mv) => comp.markers.push({ t, mv }) },
          openInViewer() {}, exportAsMotionGraphicsTemplate: (ow, folder) => { log.exported = { name: comp.motionGraphicsTemplateName, folder }; return true; } };
        comp.layers.addText = (t) => {
          const L = layerBase(comp, 'Text');
          L._add('ADBE Text Properties');
          L.property('ADBE Text Properties').property('ADBE Text Document').value = new TextDocument(t);
          L.sourceRectAtTime = () => ({ width: String(L.property('ADBE Text Properties').property('ADBE Text Document').value.text).length * 20, height: 40, left: 0, top: -30 });
          return L;
        };
        comp.layers.addShape = () => { const L = layerBase(comp, 'Vector'); L._add('ADBE Root Vectors Group'); return L; };
        comp.layers.add = (item) => layerBase(comp, 'AV', { source: item });
        log.comp = comp;
        return comp;
      },
    },
    importFile(io) { if (!io.file || !io.file.path) throw new Error('bad import'); return { width: 400, height: 200, name: 'img' }; },
    save(f) { log.saved = f.fsName; },
    set expressionEngine(v) { log.engine = v; },
  };
  const ctx = {
    SCENE: null,
    app: {
      newProject: () => project, project, beginUndoGroup() {}, endUndoGroup() {},
      fonts: { getFontsByFamilyNameAndStyleName: (f, s) => [{ postScriptName: f.replace(/ /g, '') + '-' + s.replace(/ /g, ''), familyName: f }], getFontsByPostScriptName: () => [], pollForAndPushNonSystemFontFoldersChanges() {} },
    },
    PropertyValueType: PVT, PropertyType: PT,
    KeyframeInterpolationType: { LINEAR: 'LINEAR', BEZIER: 'BEZIER', HOLD: 'HOLD' },
    KeyframeEase, TextDocument,
    ParagraphJustification: { LEFT_JUSTIFY: 'L' },
    MaskMode: { ADD: 'ADD', SUBTRACT: 'SUBTRACT', INTERSECT: 'INTERSECT' },
    FontCapsOption: { FONT_ALL_CAPS: 'ALLCAPS' },
    MarkerValue: function (c) { this.comment = c; },
    ImportOptions: function (f) { this.file = f; },
    File: function (p) { this.fsName = p; this.path = p; this.name = encodeURI(p.split('/').pop()); this.parent = { fsName: p.split('/').slice(0, -1).join('/') }; this.saveDlg = () => new ctx.File('/Users/vlad/Desktop/Chosen Name.mogrt'); },
    Folder: { desktop: { fsName: '/Users/vlad/Desktop' } },
    $: { os: 'Macintosh OS 14.0' },
    alert: (m) => log.alerts.push(m),
    decodeURI, encodeURI,
  };
  return { ctx, count: () => exprCount };
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(800);
  const scenes = await p.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    const out = [];
    const png = (() => { const c = document.createElement('canvas'); c.width = 40; c.height = 20; c.getContext('2d').fillRect(0, 0, 40, 20); return c.toDataURL(); })();
    for (let i = 0; i < Presets.BUILTIN.length; i++) out.push({ label: Presets.BUILTIN[i].name, ...Mogrt.buildScene(Presets.builtin(i), ctx, { name: Presets.BUILTIN[i].name }) });
    const adv = Presets.builtin(0);
    adv.backdrop.fillType = 'linear'; adv.backdrop.shadow.on = true; adv.title.glow.on = true; adv.title.stroke.on = true; adv.title.uppercase = true;
    adv.title.mask = { ...adv.title.mask, enabled: true, invert: true, shape: 'ellipse' };
    adv.subtitle.animators = [{ name: 'Wave', enabled: true, unit: 'words', shape: 'triangle', start: 0, end: 50, offset: 0, amount: 100, props: { y: -10, scale: 120, colorOn: true, color: '#ff0000', tracking: 2 } }];
    adv.keys = {
      'title.transform.x': [{ t: 1, v: 0, e: 'easeOutBack' }, { t: 2, v: 40, e: 'easeOutElastic' }, { t: 3, v: 0, e: 'hold' }, { t: 3.5, v: 10 }],
      'backdrop.transform.scale': [{ t: 1, v: 100, e: 'custom', bezier: [0.2, 0.8, 0.3, 1] }, { t: 2, v: 110 }],
      'backdrop.fill': [{ t: 1, v: '#000000' }, { t: 2, v: '#ff0000' }],
      'subtitle.animators.0.offset': [{ t: 0, v: -50, e: 'linear' }, { t: 3, v: 100 }],
      'title.mask.x': [{ t: 0, v: 0, e: 'linear' }, { t: 3, v: 300 }],
      'backdrop.padX': [{ t: 0, v: 20 }, { t: 2, v: 40 }],
    };
    adv.layers = { logo: Presets.newLayer('image', { name: 'Logo', src: png }), dot: Presets.newLayer('shape', { shape: 'ellipse', w: 30, h: 30, stroke: { on: true, width: 2, color: '#fff' } }), tag: Presets.newLayer('text', { name: 'Tag', text: 'ȘTIRI', anim: { distance: 20, stagger: 0.3, in: { type: 'typewriter', duration: 0.5, delay: 0.2, easing: 'linear', bezier: [0, 0, 1, 1] }, out: { type: 'wordsRise', duration: 0.4, offset: 0, easing: 'easeInCubic', bezier: [0, 0, 1, 1] } } }) };
    adv.order = ['dot', 'backdrop', 'title', 'subtitle', 'tag', 'logo'];
    out.push({ label: 'Advanced kitchen sink', ...Mogrt.buildScene(adv, ctx, { name: 'Kitchen sink' }) });
    const img = Presets.builtin(0); img.backdrop.type = 'image'; img.backdrop.image.src = png; img.backdrop.fillType = 'fourPoint';
    out.push({ label: 'Image backdrop', ...Mogrt.buildScene(img, ctx, { name: 'Image' }) });
    const four = Presets.builtin(5); four.backdrop.fillType = 'fourPoint'; four.backdrop.shape = 'corners';
    out.push({ label: '4-point + corners', ...Mogrt.buildScene(four, ctx, { name: 'Four' }) });
    const torn = Presets.builtin(0); torn.backdrop.torn = { on: true, amount: 14, size: 36, edge: 0, seed: 3 }; torn.backdrop.fillType = 'linear';
    torn.layers = { box: Presets.newLayer('shape', { shape: 'rect', w: 120, h: 40, torn: { on: true, amount: 8, size: 20, edge: 0, seed: 1 } }) };
    const ts = Mogrt.buildScene(torn, ctx, { name: 'Torn' });
    const rough = ts.scene.layers.filter((L) => (L.effects || []).some((f) => f.match === 'ADBE Roughen Edges')).length;
    if (rough < 2) throw new Error('Roughen Edges missing: ' + rough);
    out.push({ label: 'Torn paper', ...ts });
    return out;
  });
  await b.close();
  let fail = false;
  for (const s of scenes) {
    const log = { alerts: [], eg: [] };
    const { ctx, count } = makeAE(log);
    const scene = JSON.parse(JSON.stringify(s.scene));
    scene.imageFiles = {}; for (const k of Object.keys(s.images)) scene.imageFiles[k] = `/tmp/${k}.png`;
    for (const f of Object.values(scene.fonts)) f.ps = f.family.replace(/ /g, '') + '-' + f.style.replace(/ /g, '');
    // Same as main.js: ASCII-only JSON in front of the template.
    const src = `var SCENE = ${JSON.stringify(scene).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))};\n${template}`;
    try {
      vm.runInNewContext(src, ctx, { timeout: 20000 });
    } catch (e) { fail = true; console.log(`FAIL ${s.label}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); continue; }
    const alert = log.alerts.join('\n');
    const problems = /Needs a look:([\s\S]*?)(\n\nNotes:|$)/.exec(alert);
    const comp = log.comp;
    const ok = log.saved && log.exported && !problems && comp.layers.list.length === s.scene.layers.filter((L) => L.kind !== 'image' || s.images[L.image]).length;
    if (!ok) fail = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${s.label.padEnd(26)} layers ${comp.layers.list.length}, expressions ${count()}, EG [${log.eg.join(', ')}], markers ${comp.markers.length}, saved ${log.saved}, mogrt ${log.exported && log.exported.name}`);
    if (problems) console.log('     problems:', problems[1].trim());
    const notes = /Notes:([\s\S]*)$/.exec(alert);
    if (notes) console.log('     notes:', notes[1].trim().replace(/\n/g, ' '));
  }
  console.log('page errors:', errs);
  console.log(fail || errs.length ? 'FAIL' : 'PASS');
})();
