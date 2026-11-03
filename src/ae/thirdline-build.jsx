// Thirdline to After Effects.
// Thirdline writes `var SCENE = {...};` above this file and asks After Effects to run it.
// It rebuilds the lower third in a new project, saves it as an .aep and exports a .mogrt.
// ExtendScript is ES3: no JSON, no Array.prototype.indexOf/map/forEach.

(function () {
  var S = SCENE;
  var notes = [];
  for (var wi = 0; wi < S.warnings.length; wi++) notes.push(S.warnings[wi]);
  var problems = [];
  function note(m) { notes.push(m); }
  function problem(m) { problems.push(m); }

  // ---------- helpers ----------
  function str(s) {
    var out = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), n = s.charCodeAt(i);
      if (c === '"' || c === '\\') out += '\\' + c;
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (n < 32 || n > 126) { var h = n.toString(16); while (h.length < 4) h = '0' + h; out += '\\u' + h; }
      else out += c;
    }
    return out + '"';
  }
  function toSrc(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(v) : '0';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return str(v);
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(toSrc(v[i]));
      return '[' + a.join(',') + ']';
    }
    var o = [];
    for (var k in v) if (v.hasOwnProperty(k)) o.push(str(k) + ':' + toSrc(v[k]));
    return '{' + o.join(',') + '}';
  }
  function typeName(p) {
    var t = p.propertyValueType;
    if (t === PropertyValueType.OneD) return 'OneD';
    if (t === PropertyValueType.TwoD || t === PropertyValueType.TwoD_SPATIAL) return 'TwoD';
    if (t === PropertyValueType.ThreeD || t === PropertyValueType.ThreeD_SPATIAL) return 'ThreeD';
    if (t === PropertyValueType.COLOR) return 'COLOR';
    if (t === PropertyValueType.LAYER_INDEX) return 'LAYER_INDEX';
    return 'OTHER';
  }
  // "OneD:2" = the third one-dimensional control of an effect (works in every UI language).
  function nthParam(fx, sel) {
    var parts = sel.split(':'), want = parts[0], n = parseInt(parts[1], 10), seen = 0;
    for (var i = 1; i <= fx.numProperties; i++) {
      var p = fx.property(i);
      if (p.propertyType !== PropertyType.PROPERTY) continue;
      if (typeName(p) === want) { if (seen === n) return p; seen++; }
    }
    return null;
  }
  function dims(p) {
    var t = typeName(p);
    return t === 'TwoD' && !p.isSpatial ? 2 : t === 'ThreeD' && !p.isSpatial ? 3 : 1;
  }
  function eases(p, speed, inf) {
    var n = dims(p), a = [];
    for (var i = 0; i < n; i++) a.push(new KeyframeEase(speed instanceof Array ? (speed[i] || 0) : speed, inf));
    return a;
  }
  // Sets a static value and/or keyframes on a property.
  function setProp(p, spec) {
    if (!p) return;
    if (spec.keys && spec.keys.length) {
      for (var i = 0; i < spec.keys.length; i++) p.setValueAtTime(spec.keys[i].t, spec.keys[i].v);
      for (var j = 0; j < spec.keys.length; j++) {
        var k = spec.keys[j], idx = p.nearestKeyIndex(k.t);
        try {
          if (k.hold) p.setInterpolationTypeAtKey(idx, p.keyInInterpolationType(idx), KeyframeInterpolationType.HOLD);
          else if (k.linear) p.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
          if (k.outInf !== undefined || k.inInf !== undefined) {
            var ie = k.inInf !== undefined ? eases(p, k.inSpeed, k.inInf) : p.keyInTemporalEase(idx);
            var oe = k.outInf !== undefined ? eases(p, k.outSpeed, k.outInf) : p.keyOutTemporalEase(idx);
            p.setTemporalEaseAtKey(idx, ie, oe);
          }
        } catch (e) { note('Easing on ' + p.name + ': ' + e.toString()); }
      }
    } else if (spec.value !== undefined && spec.value !== null) {
      p.setValue(spec.value);
    }
  }
  var pendingExpr = [];
  function later(getProp, expr, label) { pendingExpr.push({ get: getProp, expr: expr, label: label }); }

  // ---------- project ----------
  if (!app.newProject()) { alert('Thirdline: cancelled. Your After Effects project was left as it was.'); return; }
  app.beginUndoGroup('Thirdline import');
  try { app.project.expressionEngine = 'javascript-1.0'; } catch (e) { problem('Could not switch the project to the JavaScript expression engine; set it in File > Project Settings > Expressions.'); }
  try { app.fonts.pollForAndPushNonSystemFontFoldersChanges(); } catch (e) {}

  var comp = app.project.items.addComp(S.name, S.width, S.height, 1, S.duration, S.fps);
  comp.bgColor = [0, 0, 0];
  if (S.motionBlur) {
    comp.motionBlur = true;
    try { comp.shutterAngle = S.motionBlur.shutter; comp.motionBlurSamplesPerFrame = Math.max(2, S.motionBlur.samples); } catch (e) {}
  }

  // images
  var footage = {};
  for (var ik in S.imageFiles) {
    if (!S.imageFiles.hasOwnProperty(ik)) continue;
    try { footage[ik] = app.project.importFile(new ImportOptions(new File(S.imageFiles[ik]))); }
    catch (e) { problem('Could not import an image (' + S.imageFiles[ik] + '): ' + e.toString()); }
  }

  // ---------- fonts ----------
  function applyFont(td, key) {
    var f = S.fonts[key];
    if (!f) return;
    var done = false;
    try {
      if (app.fonts) {
        var list = app.fonts.getFontsByFamilyNameAndStyleName(f.family, f.style);
        if ((!list || !list.length) && f.ps) list = app.fonts.getFontsByPostScriptName(f.ps);
        if (list && list.length) { td.fontObject = list[0]; done = true; }
      }
    } catch (e) {}
    if (!done) td.font = f.ps || (f.family.replace(/ /g, '') + '-' + f.style.replace(/ /g, ''));
    f.used = true;
  }
  function checkFont(td, key) {
    var f = S.fonts[key];
    try {
      var got = td.fontFamily || '';
      if (got && f && got.toLowerCase().replace(/ /g, '') !== f.family.toLowerCase().replace(/ /g, '')) {
        problem('Font "' + f.family + ' ' + f.style + '" is not available in After Effects (it used ' + got + '). Install it, restart After Effects and export again.');
      }
    } catch (e) {}
  }

  // ---------- layers, bottom to top ----------
  var byId = {}, made = [];
  for (var li = 0; li < S.layers.length; li++) {
    var L = S.layers[li], layer = null;
    try {
      if (L.kind === 'text') {
        layer = comp.layers.addText(L.text.text || ' ');
        var src = layer.property('ADBE Text Properties').property('ADBE Text Document');
        var td = src.value;
        try { td.resetCharStyle(); } catch (e) {}
        td.text = L.text.text;
        applyFont(td, L.text.font);
        td.fontSize = L.text.size;
        td.applyFill = true;
        td.fillColor = L.text.color;
        td.tracking = Math.round(L.text.tracking);
        td.justification = ParagraphJustification.LEFT_JUSTIFY;
        if (L.text.stroke) { td.applyStroke = true; td.strokeColor = L.text.stroke.color; td.strokeWidth = L.text.stroke.width; td.strokeOverFill = false; }
        else td.applyStroke = false;
        var capsDone = false;
        if (L.text.caps) { try { td.fontCapsOption = FontCapsOption.FONT_ALL_CAPS; capsDone = true; } catch (e) {} }
        src.setValue(td);
        checkFont(src.value, L.text.font);
        if (L.text.caps && !capsDone) later((function (lyr) { return function () { return lyr.property('ADBE Text Properties').property('ADBE Text Document'); }; })(layer), 'text.sourceText.toUpperCase()', 'caps');
        // Width After Effects measures for the text now; layout expressions follow changes from here.
        S.cfg.L[L.id].R0 = layer.sourceRectAtTime(S.holdTime, false).width;
      } else if (L.kind === 'shape') {
        layer = comp.layers.addShape();
      } else if (L.kind === 'image') {
        if (!footage[L.image]) continue;
        layer = comp.layers.add(footage[L.image]);
        var cfgId = L.id === 'backdropAccent' ? 'backdrop' : L.id;
        S.cfg.L[cfgId].imgW = footage[L.image].width;
        S.cfg.L[cfgId].imgH = footage[L.image].height;
      }
    } catch (e) { problem('Layer "' + L.name + '" could not be created: ' + e.toString()); continue; }
    if (!layer) continue;
    layer.name = L.name;
    try { layer.startTime = 0; layer.inPoint = L.inPoint; layer.outPoint = L.outPoint; } catch (e) {}
    if (L.motionBlur) try { layer.motionBlur = true; } catch (e) {}
    byId[L.id] = layer;
    made.push({ L: L, layer: layer });
  }

  // ---------- contents of each layer ----------
  function group(layer, path) {
    var p = layer;
    for (var i = 0; i < path.length; i++) p = p.property(path[i]);
    return p;
  }
  function buildShapes(layer, L) {
    for (var gi = 0; gi < L.groups.length; gi++) {
      var G = L.groups[gi];
      var root = layer.property('ADBE Root Vectors Group');
      var grp = root.addProperty('ADBE Vector Group');
      grp.name = G.name;
      var gIndex = grp.propertyIndex;
      var inner = function () { return layer.property('ADBE Root Vectors Group').property(gIndex).property('ADBE Vectors Group'); };
      for (var ii = 0; ii < G.items.length; ii++) {
        var it = G.items[ii];
        if (it.type === 'rect' || it.type === 'ellipse') {
          var isR = it.type === 'rect';
          var shp = inner().addProperty(isR ? 'ADBE Vector Shape - Rect' : 'ADBE Vector Shape - Ellipse');
          var si = shp.propertyIndex;
          (function (si, isR, it) {
            later(function () { return inner().property(si).property(isR ? 'ADBE Vector Rect Size' : 'ADBE Vector Ellipse Size'); }, it.size, G.name + ' size');
            later(function () { return inner().property(si).property(isR ? 'ADBE Vector Rect Position' : 'ADBE Vector Ellipse Position'); }, it.pos, G.name + ' position');
            if (isR) later(function () { return inner().property(si).property('ADBE Vector Rect Roundness'); }, it.round, G.name + ' roundness');
          })(si, isR, it);
        } else if (it.type === 'path') {
          var ps = inner().addProperty('ADBE Vector Shape - Group');
          (function (pi, it) { later(function () { return inner().property(pi).property('ADBE Vector Shape'); }, it.path, G.name + ' path'); })(ps.propertyIndex, it);
        } else if (it.type === 'merge') {
          var mg = inner().addProperty('ADBE Vector Filter - Merge');
          try { mg.property('ADBE Vector Merge Type').setValue(it.mode); } catch (e) { note('Merge Paths mode: ' + e.toString()); }
        }
      }
      var fill = inner().addProperty('ADBE Vector Graphic - Fill');
      var fi = fill.propertyIndex;
      var col = G.fill.color;
      setProp(inner().property(fi).property('ADBE Vector Fill Color'), { value: col.value.length === 3 ? [col.value[0], col.value[1], col.value[2], 1] : col.value, keys: col.keys ? fix4(col.keys) : null });
      if (G.fill.eg) egQueue.push({ get: (function (fi) { return function () { return inner().property(fi).property('ADBE Vector Fill Color'); }; })(fi), name: G.fill.eg });
      if (G.stroke) {
        var stk = inner().addProperty('ADBE Vector Graphic - Stroke');
        var sti = stk.propertyIndex;
        inner().property(sti).property('ADBE Vector Stroke Color').setValue([G.stroke.color[0], G.stroke.color[1], G.stroke.color[2], 1]);
        inner().property(sti).property('ADBE Vector Stroke Width').setValue(G.stroke.width);
      }
    }
  }
  function fix4(keys) {
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = k.v;
      var c = {}; for (var kk in k) if (k.hasOwnProperty(kk)) c[kk] = k[kk];
      c.v = v.length === 3 ? [v[0], v[1], v[2], 1] : v;
      out.push(c);
    }
    return out;
  }
  function buildEffects(layer, L) {
    for (var ei = 0; ei < L.effects.length; ei++) {
      var F = L.effects[ei], fx;
      try {
        fx = layer.property('ADBE Effect Parade').addProperty(F.match);
        fx.name = F.name;
      } catch (e) { problem('Effect ' + F.match + ' on "' + L.name + '" could not be added: ' + e.toString()); continue; }
      var fxIndex = fx.propertyIndex;
      for (var pi = 0; pi < F.params.length; pi++) {
        var P = F.params[pi];
        var getP = (function (fxIndex, sel) { return function () { return nthParam(layer.property('ADBE Effect Parade').property(fxIndex), sel); }; })(fxIndex, P.sel);
        try {
          var prop = getP();
          if (!prop) { if (!P.optional) note('No "' + P.sel + '" control on ' + F.name); continue; }
          if (P.self) prop.setValue(layer.index);
          else if (P.pct !== undefined) prop.setValue(P.pct * (prop.hasMax && prop.maxValue > 1 ? prop.maxValue : 100));
          else setProp(prop, P);
          if (P.expr) later(getP, P.expr, F.name);
          if (P.eg) egQueue.push({ get: getP, name: P.eg });
        } catch (e) { if (!P.optional) note(F.name + ': ' + e.toString()); }
      }
    }
  }
  function buildAnimators(layer, L) {
    var textProps = function () { return layer.property('ADBE Text Properties'); };
    var anyScale = false;
    for (var ai = 0; ai < L.animators.length; ai++) {
      var A = L.animators[ai];
      var an = textProps().property('ADBE Text Animators').addProperty('ADBE Text Animator');
      an.name = A.name;
      var anIndex = an.propertyIndex;
      var animator = (function (anIndex) { return function () { return layer.property('ADBE Text Properties').property('ADBE Text Animators').property(anIndex); }; })(anIndex);
      for (var m in A.props) {
        if (!A.props.hasOwnProperty(m)) continue;
        if (m === 'ADBE Text Scale 3D' || m === 'ADBE Text Rotation') anyScale = true;
        var added = animator().property('ADBE Text Animator Properties').addProperty(m);
        var spec = A.props[m];
        var getAP = (function (animator, m) { return function () { return animator().property('ADBE Text Animator Properties').property(m); }; })(animator, m);
        try {
          if (spec instanceof Array || typeof spec === 'number') setProp(getAP(), { value: spec });
          else {
            setProp(getAP(), { value: spec.value, keys: spec.keys });
            if (spec.expr) later(getAP, spec.expr, A.name);
          }
          if (A.eg) egQueue.push({ get: getAP, name: A.eg });
        } catch (e) { note(A.name + ': ' + e.toString()); }
      }
      var sel = A.selector || { type: 'all' };
      try {
        if (sel.type === 'expr') {
          var es = animator().property('ADBE Text Selectors').addProperty('ADBE Text Expressible Selector');
          var esIndex = es.propertyIndex;
          var getES = (function (animator, esIndex) { return function () { return animator().property('ADBE Text Selectors').property(esIndex); }; })(animator, esIndex);
          try { getES().property('ADBE Text Range Type2').setValue(sel.basedOn); } catch (e) { note('Based On: ' + e.toString()); }
          later((function (getES) { return function () { return getES().property('ADBE Text Expressible Amount'); }; })(getES), sel.expr, A.name);
        } else if (sel.type === 'range') {
          var rs = animator().property('ADBE Text Selectors').addProperty('ADBE Text Selector');
          var rsIndex = rs.propertyIndex;
          var R = function () { return animator().property('ADBE Text Selectors').property(rsIndex); };
          setProp(R().property('ADBE Text Percent Start'), sel.start);
          setProp(R().property('ADBE Text Percent End'), sel.end);
          setProp(R().property('ADBE Text Percent Offset'), sel.offset);
          var adv = function () { return R().property('ADBE Text Range Advanced'); };
          try { setProp(adv().property('ADBE Text Selector Max Amount'), sel.amount); } catch (e) { note('Amount: ' + e.toString()); }
          try { adv().property('ADBE Text Range Type2').setValue(sel.basedOn); } catch (e) {}
          try { adv().property('ADBE Text Range Shape').setValue(sel.shape); } catch (e) {}
        }
      } catch (e) { note(A.name + ' selector: ' + e.toString()); }
    }
    if (anyScale) {
      // Letters scale and rotate around their own centre, like the Thirdline preview.
      try {
        var mo = textProps().property('ADBE Text More Options');
        mo.property('ADBE Text Anchor Point Option').setValue(1);
        mo.property('ADBE Text Anchor Point Align').setValue([0, -50]);
      } catch (e) {}
    }
  }
  function buildMasks(layer, L) {
    for (var mi = 0; mi < L.masks.length; mi++) {
      var M = L.masks[mi];
      var atom = layer.property('ADBE Mask Parade').addProperty('ADBE Mask Atom');
      atom.name = M.name;
      atom.maskMode = M.mode === 'subtract' ? MaskMode.SUBTRACT : M.mode === 'intersect' ? MaskMode.INTERSECT : MaskMode.ADD;
      if (M.inverted) atom.inverted = true;
      var idx = atom.propertyIndex;
      var getM = (function (idx) { return function () { return layer.property('ADBE Mask Parade').property(idx); }; })(idx);
      later((function (getM) { return function () { return getM().property('ADBE Mask Shape'); }; })(getM), M.expr, M.name);
      if (M.feather) later((function (getM) { return function () { return getM().property('ADBE Mask Feather'); }; })(getM), M.feather, M.name + ' feather');
    }
  }
  function buildProps(layer, L) {
    for (var pi = 0; pi < L.props.length; pi++) {
      var P = L.props[pi];
      var getP = (function (path) { return function () { return group(layer, path); }; })(P.path);
      try { setProp(getP(), P); } catch (e) { note(L.name + ' ' + P.path.join('/') + ': ' + e.toString()); }
      if (P.expr) later(getP, P.expr, L.name + ' ' + P.path[P.path.length - 1]);
    }
  }

  var egQueue = [];
  for (var mi2 = 0; mi2 < made.length; mi2++) {
    var it2 = made[mi2];
    try {
      if (it2.L.groups) buildShapes(it2.layer, it2.L);
      if (it2.L.effects) buildEffects(it2.layer, it2.L);
      if (it2.L.animators) buildAnimators(it2.layer, it2.L);
      if (it2.L.masks) buildMasks(it2.layer, it2.L);
      if (it2.L.props) buildProps(it2.layer, it2.L);
      var eg = it2.L.eg || [];
      for (var gi2 = 0; gi2 < eg.length; gi2++) {
        if (eg[gi2].what === 'sourceText') egQueue.push({ text: true, get: (function (lyr) { return function () { return lyr.property('ADBE Text Properties').property('ADBE Text Document'); }; })(it2.layer), name: eg[gi2].name });
        if (eg[gi2].what === 'media') egQueue.push({ layer: it2.layer, name: eg[gi2].name });
      }
    } catch (e) { problem('"' + it2.L.name + '": ' + e.toString()); }
  }

  // ---------- expressions ----------
  var cfgSrc = 'var TLC = ' + toSrc(S.cfg) + ';\n';
  for (var xi = 0; xi < pendingExpr.length; xi++) {
    var X = pendingExpr[xi];
    try {
      var p = X.get();
      if (!p) { note('Missing property for ' + X.label); continue; }
      p.expression = X.expr.indexOf('TLC') >= 0 ? cfgSrc + X.expr : X.expr;
    } catch (e) { problem('Expression for ' + X.label + ': ' + e.toString()); }
  }
  // Report expressions that After Effects could not evaluate.
  try {
    comp.time = S.holdTime;
    for (var xj = 0; xj < pendingExpr.length; xj++) {
      var q = pendingExpr[xj].get();
      if (q && q.expressionError) { problem('Expression error (' + pendingExpr[xj].label + '): ' + q.expressionError); }
    }
  } catch (e) {}

  // ---------- Essential Graphics ----------
  comp.motionGraphicsTemplateName = S.name;
  var egNames = {};
  // Text fields first, then images, then colours: the order editors see in Premiere.
  var egOrdered = [];
  for (var pass = 0; pass < 3; pass++) {
    for (var qz = 0; qz < egQueue.length; qz++) {
      var rank = egQueue[qz].text ? 0 : egQueue[qz].layer ? 1 : 2;
      if (rank === pass) egOrdered.push(egQueue[qz]);
    }
  }
  for (var qi = 0; qi < egOrdered.length; qi++) {
    var Q = egOrdered[qi];
    if (egNames[Q.name]) continue;
    try {
      if (Q.layer) { if (Q.layer.canAddToMotionGraphicsTemplate(comp)) Q.layer.addToMotionGraphicsTemplateAs(comp, Q.name); }
      else {
        var ep = Q.get();
        if (ep && ep.canAddToMotionGraphicsTemplate(comp)) ep.addToMotionGraphicsTemplateAs(comp, Q.name);
      }
      egNames[Q.name] = true;
    } catch (e) { note('Essential Graphics "' + Q.name + '": ' + e.toString()); }
  }

  // ---------- responsive time ----------
  for (var ki = 0; ki < S.markers.length; ki++) {
    var mk = S.markers[ki];
    try {
      var mv = new MarkerValue(mk.comment);
      mv.duration = mk.dur;
      if (mk.protect) mv.protectedRegion = true;
      comp.markerProperty.setValueAtTime(mk.t, mv);
    } catch (e) { note('Marker ' + mk.comment + ': ' + e.toString()); }
  }

  comp.time = S.holdTime;
  comp.openInViewer();
  app.endUndoGroup();

  // ---------- save + export ----------
  var report = '';
  if (problems.length) report += '\n\nNeeds a look:\n- ' + problems.join('\n- ');
  if (notes.length) report += '\n\nNotes:\n- ' + notes.join('\n- ');
  var safeName = S.name.replace(/[\\\/:*?"<>|]+/g, '').replace(/^\s+|\s+$/g, '') || 'Lower third';
  var start = new File(Folder.desktop.fsName + '/' + safeName + '.mogrt');
  var target = start.saveDlg('Where should the .mogrt (and its After Effects project) be saved?', $.os.indexOf('Windows') >= 0 ? 'Motion Graphics Template:*.mogrt' : undefined);
  if (!target) {
    alert('Thirdline: your lower third is ready in the comp "' + S.name + '".\nTo make the .mogrt later, use File > Export > Export As Motion Graphics Template.' + report);
    return;
  }
  var base = decodeURI(target.name).replace(/\.mogrt$/i, '');
  var folder = target.parent;
  try {
    app.project.save(new File(folder.fsName + '/' + base + '.aep'));
  } catch (e) { problem('Saving the .aep failed: ' + e.toString()); }
  comp.name = base;
  comp.motionGraphicsTemplateName = base;
  var ok = false;
  try { ok = comp.exportAsMotionGraphicsTemplate(true, folder.fsName); } catch (e) { problem('Export failed: ' + e.toString()); }
  if (ok) {
    alert('Thirdline: saved "' + base + '.mogrt" and "' + base + '.aep" in\n' + folder.fsName + '\n\nIn Premiere Pro, open the Essential Graphics panel and drag the .mogrt in (or double-click it).' + report);
  } else {
    alert('Thirdline: the comp is built, but After Effects did not export the .mogrt.\nIf it says scripts may not write files, turn on Settings > Scripting & Expressions > "Allow Scripts to Write Files and Access Network" and run the export again, or use File > Export > Export As Motion Graphics Template.' + report);
  }
})();
