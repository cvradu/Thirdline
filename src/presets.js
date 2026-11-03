// Default document + built-in style presets.
(function (global) {
  const anim = (inType, outType, o = {}) => ({
    distance: o.distance ?? 80,
    stagger: o.stagger ?? 0.35,
    in: { type: inType, duration: o.inDur ?? 0.6, delay: o.delay ?? 0, easing: o.inEase ?? 'easeOutCubic', bezier: [0.25, 0.1, 0.25, 1] },
    out: { type: outType, duration: o.outDur ?? 0.45, offset: o.offset ?? 0, easing: o.outEase ?? 'easeInCubic', bezier: [0.42, 0, 1, 1] },
    loop: { type: 'none', amount: 50, period: 2.5, together: false },
  });

  const transform = (text) => ({ x: 0, y: 0, scale: 100, scaleX: 100, scaleY: 100, rotation: 0, opacity: 100, blur: 0, anchorX: 50, anchorY: 50, ...(text ? { tracking: 0 } : {}) });
  const mask = () => ({ enabled: false, shape: 'rect', x: 100, y: 760, w: 900, h: 240, radius: 0, corners: { on: false, tl: 0, tr: 0, br: 0, bl: 0 }, points: [], feather: 0, invert: false });

  function defaultState() {
    return {
      keys: {},
      // Easy-mode choices (motion recipe, speed, size step, position) so the controls show what was picked.
      ui: { motion: '', speed: 'normal', size: 'M', pos: 'bl' },
      version: 1,
      layers: {},
      order: ['backdrop', 'title', 'subtitle'],
      comp: { width: 1920, height: 1080, fps: 30, duration: 6, motionBlur: { enabled: false, shutter: 180, samples: 12, preview: false } },
      layout: { x: 144, y: 972, hAnchor: 'left', vAnchor: 'bottom', align: 'left', lineGap: 14 },
      backdrop: {
        type: 'shape',
        shape: 'accent',
        fill: '#101828',
        fill2: '#1d4ed8',
        gradient: false,
        fillType: 'solid',
        fill3: '#7c3aed',
        fill4: '#06b6d4',
        gradientAngle: 0,
        gradCX: 50,
        gradCY: 50,
        gradRadius: 75,
        gradAnim: 'none',
        gradStops: 2,
        gradSpeed: 4,
        shimmerColor: '#ffffff',
        shimmerOpacity: 0.45,
        texture: { enabled: false, src: '', name: '', blend: 'overlay', opacity: 0.6, fit: 'cover', scale: 1, offsetX: 0, offsetY: 0, driftX: 0, driftY: 0 },
        opacity: 0.92,
        accentColor: '#f59e0b',
        accentWidth: 10,
        accentGap: 8,
        radius: 6, corners: { on: false, tl: 0, tr: 0, br: 0, bl: 0 },
        skew: 28,
        padX: 36,
        padY: 22,
        minWidth: 0,
        fixedWidth: 0,
        fillOn: true,
        stroke: { on: false, width: 3, color: '#ffffff' },
        shadow: { on: true, color: '#000000', opacity: 0.35, blur: 24, offsetX: 0, offsetY: 8 },
        image: { src: '', name: '', fit: 'box', scale: 1, textOffsetX: 0, textOffsetY: 0 },
        anim: anim('wipeRight', 'wipeLeft', { inDur: 0.7, inEase: 'easeInOutQuart', outDur: 0.5, outEase: 'easeInOutQuart' }),
        transform: transform(false),
        mask: mask(),
      },
      title: {
        text: 'Guest Name',
        font: 'Montserrat', weight: 700, italic: false, size: 56, color: '#ffffff',
        letterSpacing: 0, uppercase: false, clipToBox: true,
        fillType: 'solid', color2: '#f59e0b', gradAngle: 90,
        stroke: { on: false, width: 2, color: '#000000' },
        glow: { on: false, color: '#f59e0b', size: 18, opacity: 0.8, strength: 1 },
        fitWidth: 0,
        shadow: { on: false, color: '#000000', opacity: 0.6, blur: 10, offsetX: 0, offsetY: 2 },
        anim: anim('maskUp', 'slideDown', { delay: 0.35, inDur: 0.6, inEase: 'easeOutQuart', offset: 0.15, outDur: 0.35, distance: 60 }),
        transform: transform(true),
        mask: mask(),
        animators: [],
      },
      subtitle: {
        text: 'Guest Title',
        font: 'Inter', weight: 500, italic: false, size: 30, color: '#cbd5e1',
        letterSpacing: 0.5, uppercase: false, clipToBox: true,
        fillType: 'solid', color2: '#f59e0b', gradAngle: 90,
        stroke: { on: false, width: 2, color: '#000000' },
        glow: { on: false, color: '#f59e0b', size: 18, opacity: 0.8, strength: 1 },
        fitWidth: 0,
        shadow: { on: false, color: '#000000', opacity: 0.6, blur: 10, offsetX: 0, offsetY: 2 },
        anim: anim('lettersFade', 'fade', { delay: 0.55, inDur: 0.8, inEase: 'easeOutCubic', offset: 0.2, outDur: 0.3, stagger: 0.15 }),
        transform: transform(true),
        mask: mask(),
        animators: [],
      },
    };
  }

  // Each preset is a partial patch applied over the default.
  const BUILTIN = [
    { name: 'News Accent (default)', patch: {} },
    {
      name: 'Clean Pill',
      patch: {
        backdrop: { shape: 'pill', fill: '#ffffff', opacity: 1, padX: 44, padY: 20, anim: anim('growXCenter', 'growXCenter', { inDur: 0.55, inEase: 'easeOutBack', outEase: 'easeInBack', outDur: 0.4 }) },
        title: { font: 'Poppins', weight: 600, color: '#111827', size: 50, clipToBox: false, anim: anim('fade', 'fade', { delay: 0.3, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Poppins', weight: 400, color: '#4b5563', size: 28, clipToBox: false, anim: anim('slideUp', 'fade', { delay: 0.4, inDur: 0.5, distance: 20, offset: 0.1, outDur: 0.25 }) },
        layout: { align: 'center' },
      },
    },
    {
      name: 'Sport Slant',
      patch: {
        backdrop: { shape: 'slant', fill: '#dc2626', fill2: '#7f1d1d', fillType: 'linear', opacity: 1, skew: 34, padX: 30, padY: 18, shadow: { on: true, color: '#000000', opacity: 0.5, blur: 0, offsetX: 10, offsetY: 10 }, anim: anim('slideLeft', 'slideLeft', { distance: 600, inDur: 0.5, inEase: 'easeOutExpo', outEase: 'easeInExpo', outDur: 0.4 }) },
        title: { font: 'Anton', weight: 400, size: 64, uppercase: true, letterSpacing: 1, color: '#ffffff', anim: anim('slideLeft', 'slideRight', { delay: 0.2, inDur: 0.5, inEase: 'easeOutExpo', distance: 200, offset: 0.15 }) },
        subtitle: { font: 'Barlow Condensed', weight: 600, size: 32, uppercase: true, letterSpacing: 2, color: '#fde68a', anim: anim('lettersRise', 'fade', { delay: 0.35, inDur: 0.5, stagger: 0.1, offset: 0.15, outDur: 0.25 }) },
      },
    },
    {
      name: 'Minimal Underline',
      patch: {
        backdrop: { shape: 'underline', accentColor: '#22d3ee', accentWidth: 4, accentGap: 12, padX: 0, padY: 0, shadow: { on: false }, anim: anim('growX', 'wipeRight', { inDur: 0.8, inEase: 'easeInOutExpo', outDur: 0.5, outEase: 'easeInOutExpo' }) },
        title: { font: 'Space Grotesk', weight: 700, size: 58, color: '#ffffff', clipToBox: false, shadow: { on: true }, anim: anim('lettersRise', 'lettersFade', { delay: 0.3, inDur: 0.7, stagger: 0.25, offset: 0.2, outDur: 0.4 }) },
        subtitle: { font: 'Space Grotesk', weight: 400, size: 28, color: '#a5f3fc', clipToBox: false, shadow: { on: true }, anim: anim('fade', 'fade', { delay: 0.7, inDur: 0.5, offset: 0.2, outDur: 0.3 }) },
      },
    },
    {
      name: 'Two-Tone Broadcast',
      patch: {
        backdrop: { shape: 'twoTone', fill: '#0f172a', accentColor: '#2563eb', radius: 0, padX: 28, padY: 16, opacity: 1, anim: anim('wipeRight', 'wipeLeft', { inDur: 0.6, inEase: 'easeOutQuart', outEase: 'easeInQuart' }) },
        title: { font: 'Roboto Condensed', weight: 700, size: 54, uppercase: true, anim: anim('slideUp', 'slideDown', { delay: 0.3, inDur: 0.5, distance: 70, offset: 0.1, outDur: 0.3 }) },
        subtitle: { font: 'Roboto Condensed', weight: 500, size: 30, color: '#ffffff', anim: anim('maskDown', 'fade', { delay: 0.45, inDur: 0.5, offset: 0.1, outDur: 0.3 }) },
        layout: { lineGap: 0 },
      },
    },
    {
      name: 'Elegant Serif',
      patch: {
        backdrop: { shape: 'sideBar', accentColor: '#d4af37', accentWidth: 3, accentGap: 22, padX: 0, padY: 6, shadow: { on: false }, anim: anim('growY', 'growY', { inDur: 0.9, inEase: 'easeInOutCubic' }) },
        title: { font: 'Playfair Display', weight: 600, size: 60, italic: false, color: '#ffffff', clipToBox: false, shadow: { on: true }, anim: anim('blur', 'blur', { delay: 0.4, inDur: 0.9, inEase: 'easeOutCubic', offset: 0.1 }) },
        subtitle: { font: 'Lato', weight: 400, size: 26, uppercase: true, letterSpacing: 4, color: '#e5e7eb', clipToBox: false, shadow: { on: true }, anim: anim('tracking', 'fade', { delay: 0.7, inDur: 1.0, offset: 0.1 }) },
      },
    },
    {
      name: 'Glass Rounded',
      patch: {
        backdrop: { shape: 'rounded', radius: 18, fill: '#ffffff', fill2: '#ffffff', opacity: 0.18, padX: 34, padY: 22, shadow: { on: true, color: '#000000', opacity: 0.25, blur: 30, offsetY: 10 }, anim: anim('pop', 'pop', { inDur: 0.5, inEase: 'easeOutBack', outEase: 'easeInBack' }) },
        title: { font: 'Inter', weight: 700, size: 52, color: '#ffffff', anim: anim('typewriter', 'fade', { delay: 0.3, inDur: 0.9, inEase: 'linear', offset: 0.1 }) },
        subtitle: { font: 'Inter', weight: 400, size: 28, color: '#f1f5f9', anim: anim('fade', 'fade', { delay: 1.1, inDur: 0.4, offset: 0.1 }) },
      },
    },
    {
      name: 'Bold Outline',
      patch: {
        backdrop: { shape: 'rect', fillOn: false, stroke: { on: true, width: 4, color: '#ffffff' }, padX: 34, padY: 18, shadow: { on: false }, anim: anim('wipeRight', 'wipeLeft', { inDur: 0.6, inEase: 'easeInOutQuart', outDur: 0.45, outEase: 'easeInOutQuart' }) },
        title: { font: 'Bebas Neue', weight: 400, size: 72, letterSpacing: 2, color: '#ffffff', anim: anim('slideUp', 'slideDown', { delay: 0.3, inDur: 0.5, inEase: 'easeOutQuart', distance: 60, offset: 0.1, outDur: 0.3 }) },
        subtitle: { font: 'Inter', weight: 500, size: 26, uppercase: true, letterSpacing: 3, color: '#e5e7eb', anim: anim('fade', 'fade', { delay: 0.55, inDur: 0.5, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Neon Glow',
      patch: {
        backdrop: { shape: 'rounded', radius: 14, fill: '#0b0b1a', opacity: 0.9, stroke: { on: true, width: 2.5, color: '#22d3ee' }, padX: 36, padY: 20, shadow: { on: true, color: '#22d3ee', opacity: 0.55, blur: 28, offsetX: 0, offsetY: 0 }, anim: anim('scale', 'fade', { inDur: 0.5, inEase: 'easeOutBack', outDur: 0.35 }) },
        title: { font: 'Space Grotesk', weight: 700, size: 56, color: '#ecfeff', glow: { on: true, color: '#22d3ee', size: 16, opacity: 0.9, strength: 2 }, anim: anim('lettersFade', 'fade', { delay: 0.3, inDur: 0.6, stagger: 0.3, offset: 0.1, outDur: 0.3 }) },
        subtitle: { font: 'Space Grotesk', weight: 500, size: 26, color: '#f0abfc', glow: { on: true, color: '#d946ef', size: 12, opacity: 0.8, strength: 1 }, anim: anim('fade', 'fade', { delay: 0.75, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Torn Paper',
      patch: {
        backdrop: { shape: 'rect', fill: '#fef3c7', opacity: 1, padX: 40, padY: 24, torn: { on: true, amount: 12, size: 26, edge: 3, paperColor: '#ffffff', seed: 4 }, shadow: { on: true, color: '#000000', opacity: 0.45, blur: 16, offsetX: 6, offsetY: 8 }, transform: { rotation: -1.5 }, anim: anim('pop', 'pop', { inDur: 0.5, inEase: 'easeOutBack', outEase: 'easeInBack', outDur: 0.35 }) },
        title: { font: 'Anton', weight: 400, size: 62, uppercase: true, color: '#111111', anim: anim('slideUp', 'fade', { delay: 0.3, inDur: 0.45, distance: 40, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Barlow Condensed', weight: 600, size: 30, uppercase: true, letterSpacing: 2, color: '#b91c1c', anim: anim('fade', 'fade', { delay: 0.5, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Gradient Title',
      patch: {
        backdrop: { type: 'none', shadow: { on: false } },
        title: { font: 'Montserrat', weight: 900, size: 74, fillType: 'linear', color: '#f97316', color2: '#ec4899', gradAngle: 0, clipToBox: false, shadow: { on: true, color: '#000000', opacity: 0.55, blur: 14, offsetX: 0, offsetY: 4 }, anim: anim('lettersRise', 'lettersFade', { delay: 0.1, inDur: 0.7, stagger: 0.3, offset: 0.15, outDur: 0.35 }) },
        subtitle: { font: 'Montserrat', weight: 600, size: 28, uppercase: true, letterSpacing: 4, color: '#ffffff', clipToBox: false, shadow: { on: true, color: '#000000', opacity: 0.55, blur: 10, offsetX: 0, offsetY: 2 }, anim: anim('tracking', 'fade', { delay: 0.5, inDur: 0.8, offset: 0.15, outDur: 0.3 }) },
      },
    },
    {
      name: 'Corporate Blue',
      patch: {
        backdrop: { shape: 'accent', fill: '#0b1f44', accentColor: '#38bdf8', accentWidth: 8, radius: 4, opacity: 0.96, padX: 34, padY: 20, anim: anim('wipeRight', 'wipeLeft', { inDur: 0.6, inEase: 'easeOutQuart', outEase: 'easeInQuart', outDur: 0.4 }) },
        title: { font: 'Inter', weight: 700, size: 52, color: '#ffffff', anim: anim('slideLeft', 'fade', { delay: 0.3, inDur: 0.5, distance: 40, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Inter', weight: 400, size: 26, color: '#bae6fd', anim: anim('slideLeft', 'fade', { delay: 0.42, inDur: 0.5, distance: 40, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Gold Luxury',
      patch: {
        backdrop: { shape: 'rect', fill: '#0c0a09', opacity: 0.94, stroke: { on: true, width: 2, color: '#d4af37' }, padX: 44, padY: 24, shadow: { on: true, color: '#000000', opacity: 0.5, blur: 24, offsetX: 0, offsetY: 8 }, anim: anim('fade', 'fade', { inDur: 0.8, inEase: 'easeInOutCubic', outDur: 0.6 }) },
        title: { font: 'Playfair Display', weight: 700, size: 58, fillType: 'linear', color: '#fde68a', color2: '#b45309', gradAngle: 90, anim: anim('blur', 'blur', { delay: 0.35, inDur: 0.9, offset: 0.1, outDur: 0.5 }) },
        subtitle: { font: 'Lato', weight: 400, size: 24, uppercase: true, letterSpacing: 5, color: '#e7e5e4', anim: anim('tracking', 'fade', { delay: 0.7, inDur: 1.0, offset: 0.1, outDur: 0.4 }) },
      },
    },
    {
      name: 'Podcast Pill',
      patch: {
        backdrop: { shape: 'pill', fillType: 'linear', fill: '#7c3aed', fill2: '#db2777', gradientAngle: 0, opacity: 1, padX: 48, padY: 20, anim: anim('growXCenter', 'growXCenter', { inDur: 0.6, inEase: 'easeOutBack', outEase: 'easeInBack', outDur: 0.4 }) },
        title: { font: 'Poppins', weight: 700, size: 50, color: '#ffffff', clipToBox: false, anim: anim('pop', 'fade', { delay: 0.35, inDur: 0.45, inEase: 'easeOutBack', offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Poppins', weight: 500, size: 26, color: '#fce7f3', clipToBox: false, anim: anim('fade', 'fade', { delay: 0.5, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
        layout: { align: 'center' },
      },
    },
    {
      name: 'Breaking News',
      patch: {
        backdrop: { shape: 'twoTone', fill: '#b91c1c', accentColor: '#ffffff', radius: 0, padX: 26, padY: 14, opacity: 1, anim: anim('wipeRight', 'wipeLeft', { inDur: 0.45, inEase: 'easeOutExpo', outEase: 'easeInExpo', outDur: 0.35 }) },
        title: { font: 'Oswald', weight: 700, size: 58, uppercase: true, color: '#ffffff', anim: anim('slideUp', 'slideDown', { delay: 0.25, inDur: 0.4, distance: 70, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Oswald', weight: 500, size: 30, uppercase: true, color: '#111827', anim: anim('maskDown', 'fade', { delay: 0.4, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
        layout: { lineGap: 0 },
      },
    },
    {
      name: 'Esports',
      patch: {
        backdrop: { shape: 'slant', skew: 26, fillType: 'linear', fill: '#a3e635', fill2: '#22d3ee', gradientAngle: 0, opacity: 1, padX: 34, padY: 16, shadow: { on: true, color: '#000000', opacity: 0.6, blur: 0, offsetX: 8, offsetY: 8 }, anim: anim('slideRight', 'slideLeft', { distance: 500, inDur: 0.45, inEase: 'easeOutExpo', outEase: 'easeInExpo', outDur: 0.35 }) },
        title: { font: 'Barlow Condensed', weight: 800, italic: true, size: 64, uppercase: true, color: '#0a0a0a', anim: anim('slideLeft', 'slideRight', { delay: 0.2, inDur: 0.4, inEase: 'easeOutExpo', distance: 120, offset: 0.1, outDur: 0.3 }) },
        subtitle: { font: 'Barlow Condensed', weight: 700, italic: true, size: 30, uppercase: true, letterSpacing: 2, color: '#1e1b4b', anim: anim('lettersRise', 'fade', { delay: 0.35, inDur: 0.4, stagger: 0.1, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Documentary',
      patch: {
        backdrop: { shape: 'sideBar', accentColor: '#ffffff', accentWidth: 2, accentGap: 20, padX: 0, padY: 4, shadow: { on: false }, anim: anim('growY', 'fade', { inDur: 1.0, inEase: 'easeInOutCubic', outDur: 0.6 }) },
        title: { font: 'DM Serif Display', weight: 400, size: 60, color: '#ffffff', clipToBox: false, shadow: { on: true, color: '#000000', opacity: 0.5, blur: 12, offsetX: 0, offsetY: 2 }, anim: anim('fade', 'fade', { delay: 0.5, inDur: 1.0, inEase: 'easeInOutCubic', offset: 0.1, outDur: 0.6 }) },
        subtitle: { font: 'Inter', weight: 400, size: 22, uppercase: true, letterSpacing: 4, color: '#d6d3d1', clipToBox: false, shadow: { on: true, color: '#000000', opacity: 0.5, blur: 8, offsetX: 0, offsetY: 2 }, anim: anim('fade', 'fade', { delay: 0.9, inDur: 0.9, offset: 0.1, outDur: 0.5 }) },
      },
    },
    {
      name: 'Corner Frame',
      patch: {
        backdrop: { shape: 'corners', accentColor: '#facc15', accentWidth: 4, padX: 30, padY: 18, shadow: { on: false }, anim: anim('scale', 'scale', { inDur: 0.55, inEase: 'easeOutBack', outEase: 'easeInBack', outDur: 0.35 }) },
        title: { font: 'Montserrat', weight: 800, size: 54, uppercase: true, color: '#ffffff', clipToBox: false, shadow: { on: true }, anim: anim('lettersScale', 'fade', { delay: 0.3, inDur: 0.6, stagger: 0.3, offset: 0.1, outDur: 0.3 }) },
        subtitle: { font: 'Montserrat', weight: 500, size: 26, color: '#fef9c3', clipToBox: false, shadow: { on: true }, anim: anim('fade', 'fade', { delay: 0.6, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Soft Card',
      patch: {
        backdrop: { shape: 'rounded', radius: 24, fill: '#ffffff', opacity: 1, padX: 40, padY: 24, shadow: { on: true, color: '#0f172a', opacity: 0.25, blur: 40, offsetX: 0, offsetY: 14 }, anim: anim('slideUp', 'slideDown', { distance: 60, inDur: 0.6, inEase: 'easeOutQuart', outEase: 'easeInQuart', outDur: 0.4 }) },
        title: { font: 'Montserrat', weight: 700, size: 50, color: '#0f172a', anim: anim('fade', 'fade', { delay: 0.3, inDur: 0.45, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Montserrat', weight: 500, size: 26, color: '#64748b', anim: anim('fade', 'fade', { delay: 0.45, inDur: 0.45, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Retro Sunset',
      patch: {
        backdrop: { shape: 'slant', skew: 30, fillType: 'linear', fill: '#f59e0b', fill2: '#7c3aed', gradStops: 3, fill3: '#7c3aed', gradientAngle: 90, opacity: 1, padX: 36, padY: 18, shadow: { on: true, color: '#1e1b4b', opacity: 0.8, blur: 0, offsetX: 10, offsetY: 10 }, anim: anim('wipeRight', 'wipeLeft', { inDur: 0.55, inEase: 'easeOutQuart', outEase: 'easeInQuart', outDur: 0.4 }) },
        title: { font: 'Bebas Neue', weight: 400, size: 74, letterSpacing: 2, color: '#fff7ed', stroke: { on: true, width: 3, color: '#1e1b4b' }, anim: anim('slideUp', 'fade', { delay: 0.3, inDur: 0.45, distance: 50, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Barlow Condensed', weight: 600, size: 30, uppercase: true, letterSpacing: 3, color: '#1e1b4b', anim: anim('fade', 'fade', { delay: 0.5, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Terminal',
      patch: {
        backdrop: { shape: 'rect', fill: '#020617', opacity: 0.92, stroke: { on: true, width: 2, color: '#22c55e' }, padX: 30, padY: 18, shadow: { on: false }, anim: anim('wipeDown', 'wipeUp', { inDur: 0.4, inEase: 'easeOutQuart', outDur: 0.3 }) },
        title: { font: 'Space Grotesk', weight: 600, size: 48, color: '#4ade80', anim: anim('typewriter', 'fade', { delay: 0.35, inDur: 1.0, inEase: 'linear', offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Space Grotesk', weight: 400, size: 24, color: '#86efac', anim: anim('typewriter', 'fade', { delay: 1.35, inDur: 0.7, inEase: 'linear', offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Comic Pop',
      patch: {
        backdrop: { shape: 'rect', fill: '#facc15', opacity: 1, stroke: { on: true, width: 5, color: '#111111' }, padX: 34, padY: 18, shadow: { on: true, color: '#111111', opacity: 1, blur: 0, offsetX: 10, offsetY: 10 }, transform: { rotation: -2 }, anim: anim('pop', 'pop', { inDur: 0.45, inEase: 'easeOutBack', outEase: 'easeInBack', outDur: 0.3 }) },
        title: { font: 'Anton', weight: 400, size: 64, uppercase: true, color: '#ffffff', stroke: { on: true, width: 4, color: '#111111' }, anim: anim('lettersDrop', 'fade', { delay: 0.3, inDur: 0.5, stagger: 0.3, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Barlow Condensed', weight: 800, size: 30, uppercase: true, color: '#111111', anim: anim('pop', 'fade', { delay: 0.6, inDur: 0.35, inEase: 'easeOutBack', offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Dark Glass',
      patch: {
        backdrop: { shape: 'rounded', radius: 12, fill: '#000000', opacity: 0.55, stroke: { on: true, width: 1, color: '#94a3b8' }, padX: 34, padY: 20, shadow: { on: false }, anim: anim('blur', 'blur', { inDur: 0.6, outDur: 0.4 }) },
        title: { font: 'Inter', weight: 600, size: 50, color: '#ffffff', anim: anim('wordsRise', 'fade', { delay: 0.3, inDur: 0.6, stagger: 0.35, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Inter', weight: 400, size: 26, color: '#cbd5e1', anim: anim('fade', 'fade', { delay: 0.6, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Sports Score',
      patch: {
        backdrop: { shape: 'accent', fillType: 'linear', fill: '#1e293b', fill2: '#020617', gradientAngle: 90, accentColor: '#ef4444', accentWidth: 12, radius: 0, opacity: 1, padX: 32, padY: 16, anim: anim('growX', 'wipeLeft', { inDur: 0.5, inEase: 'easeOutExpo', outEase: 'easeInExpo', outDur: 0.35 }) },
        title: { font: 'Roboto Condensed', weight: 800, size: 58, uppercase: true, color: '#ffffff', anim: anim('maskUp', 'slideDown', { delay: 0.3, inDur: 0.45, offset: 0.1, outDur: 0.3, distance: 60 }) },
        subtitle: { font: 'Roboto Condensed', weight: 600, size: 28, uppercase: true, letterSpacing: 2, color: '#fca5a5', anim: anim('maskUp', 'fade', { delay: 0.42, inDur: 0.45, offset: 0.1, outDur: 0.25 }) },
      },
    },
    {
      name: 'Centered Minimal',
      patch: {
        backdrop: { shape: 'underline', accentColor: '#ffffff', accentWidth: 2, accentGap: 14, padX: 0, padY: 0, shadow: { on: false }, anim: anim('growXCenter', 'growXCenter', { inDur: 0.8, inEase: 'easeInOutExpo', outEase: 'easeInOutExpo', outDur: 0.5 }) },
        title: { font: 'Lato', weight: 700, size: 56, color: '#ffffff', clipToBox: false, shadow: { on: true }, anim: anim('tracking', 'fade', { delay: 0.3, inDur: 1.0, offset: 0.1, outDur: 0.4 }) },
        subtitle: { font: 'Lato', weight: 400, size: 26, color: '#e5e7eb', clipToBox: false, shadow: { on: true }, anim: anim('fade', 'fade', { delay: 0.8, inDur: 0.5, offset: 0.1, outDur: 0.3 }) },
        layout: { align: 'center' },
      },
    },
    {
      name: 'Gritty Tape',
      patch: {
        backdrop: { shape: 'slant', skew: 18, fill: '#111111', opacity: 1, padX: 36, padY: 18, torn: { on: true, amount: 10, size: 18, edge: 2, paperColor: '#e7e5e4', seed: 9 }, shadow: { on: true, color: '#000000', opacity: 0.5, blur: 10, offsetX: 4, offsetY: 6 }, transform: { rotation: 1.5 }, anim: anim('wipeRight', 'wipeLeft', { inDur: 0.5, inEase: 'easeOutQuart', outEase: 'easeInQuart', outDur: 0.35 }) },
        title: { font: 'Bebas Neue', weight: 400, size: 70, letterSpacing: 2, color: '#ffffff', anim: anim('slideLeft', 'fade', { delay: 0.25, inDur: 0.45, distance: 60, offset: 0.1, outDur: 0.25 }) },
        subtitle: { font: 'Barlow Condensed', weight: 600, size: 28, uppercase: true, letterSpacing: 3, color: '#f87171', anim: anim('fade', 'fade', { delay: 0.45, inDur: 0.4, offset: 0.1, outDur: 0.25 }) },
      },
    },
  ];

  // Sample gradient looks for the backdrop (applied on top of the current design).
  const GRADIENTS = [
    { name: 'Sunset flow', patch: { fillType: 'linear', gradStops: 2, fill: '#f97316', fill2: '#db2777', gradientAngle: 0, gradAnim: 'slide', gradSpeed: 5 } },
    { name: 'Neon spin', patch: { fillType: 'linear', gradStops: 2, fill: '#7c3aed', fill2: '#06b6d4', gradientAngle: 0, gradAnim: 'rotate', gradSpeed: 6 } },
    { name: 'Gold shimmer', patch: { fillType: 'linear', gradStops: 2, fill: '#a16207', fill2: '#facc15', gradientAngle: 20, gradAnim: 'shimmer', gradSpeed: 3, shimmerColor: '#fffbeb', shimmerOpacity: 0.6 } },
    { name: 'Ocean pulse', patch: { fillType: 'radial', gradStops: 2, fill: '#22d3ee', fill2: '#0c4a6e', gradCX: 30, gradCY: 50, gradRadius: 90, gradAnim: 'pulse', gradSpeed: 3 } },
    { name: 'Midnight orbit', patch: { fillType: 'radial', gradStops: 2, fill: '#6366f1', fill2: '#020617', gradCX: 50, gradCY: 50, gradRadius: 70, gradAnim: 'orbit', gradSpeed: 6 } },
    { name: 'Aurora swirl', patch: { fillType: 'fourPoint', fill: '#22c55e', fill2: '#06b6d4', fill3: '#7c3aed', fill4: '#0f172a', gradAnim: 'swirl', gradSpeed: 6 } },
    { name: 'Candy breathe', patch: { fillType: 'fourPoint', fill: '#f472b6', fill2: '#fb923c', fill3: '#a78bfa', fill4: '#38bdf8', gradAnim: 'breathe', gradSpeed: 4 } },
    { name: 'Tricolour sweep', patch: { fillType: 'linear', gradStops: 3, fill: '#2563eb', fill2: '#a855f7', fill3: '#ec4899', gradientAngle: 0, gradAnim: 'slide', gradSpeed: 6 } },
    { name: 'Steel (static)', patch: { fillType: 'linear', gradStops: 2, fill: '#334155', fill2: '#0f172a', gradientAngle: 90, gradAnim: 'none' } },
  ];

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
    }
    return out;
  }

  // A new extra layer. Shapes default to an accent bar on the left of the box; text and logos sit above it.
  function newLayer(kind, o = {}) {
    const d = defaultState();
    const common = { kind, name: '', visible: true, attach: 'box', ax: 0, ay: 0, x: 0, y: 0, w: 0, h: 0, opacity: 1,
      anim: anim('fade', 'fade', { delay: 0.3, inDur: 0.4, offset: 0.1, outDur: 0.3 }), transform: transform(kind === 'text'), mask: mask(),
      shadow: { on: false, color: '#000000', opacity: 0.5, blur: 12, offsetX: 0, offsetY: 4 }, stroke: { on: false, width: 2, color: '#ffffff', cap: 'round' }, corners: { on: false, tl: 0, tr: 0, br: 0, bl: 0 } };
    if (kind === 'text') {
      const { stroke, shadow, ...place } = common;
      return deepMerge({ ...JSON.parse(JSON.stringify(d.subtitle)), ...place, name: 'Text', text: 'New text', size: 24, y: -40, animators: [] }, o);
    }
    if (kind === 'image') return deepMerge({ ...common, name: 'Logo', src: '', file: '', w: 120, ax: 1, ay: 0.5, x: 140, anim: anim('pop', 'fade', { delay: 0.4, inDur: 0.45, inEase: 'easeOutBack', offset: 0.1, outDur: 0.3 }) }, o);
    return deepMerge({ ...common, points: [], closed: false, fill: true, trim: { start: 0, end: 100, offset: 0 }, name: 'Accent bar', shape: 'rect', color: '#f59e0b', radius: 0, w: 8, h: 0, ax: 0, ay: 0, x: -14, anim: anim('growY', 'growY', { inDur: 0.45, outDur: 0.35 }) }, o);
  }

  global.Presets = {
    defaultState,
    BUILTIN,
    GRADIENTS,
    deepMerge,
    // Fill in any missing keys from an older/partial preset.
    normalize: (s) => {
      const out = deepMerge(defaultState(), s || {});
      // Older files used a boolean "gradient" flag.
      if (s && s.backdrop && s.backdrop.gradient && !s.backdrop.fillType) out.backdrop.fillType = 'linear';
      // Extra layers: fill in fields added after the file was saved.
      for (const [id, ly] of Object.entries(out.layers || {})) out.layers[id] = deepMerge(newLayer(ly.kind || 'shape'), ly);
      return out;
    },
    builtin: (i) => deepMerge(defaultState(), BUILTIN[i].patch),
    newLayer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
