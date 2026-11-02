// Easing functions. All map t in [0,1] -> [0,1] (back/elastic may overshoot).
(function (global) {
  const c1 = 1.70158, c3 = c1 + 1, c4 = (2 * Math.PI) / 3;
  const bounceOut = (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  };

  const EASINGS = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
    easeInOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
    easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutExpo: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    easeInBack: (t) => c3 * t * t * t - c1 * t * t,
    easeOutBack: (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
    easeInOutBack: (t) => {
      const c2 = c1 * 1.525;
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },
    easeOutElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
    easeInElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4),
    easeOutBounce: bounceOut,
    easeInBounce: (t) => 1 - bounceOut(1 - t),
  };

  const EASING_LABELS = {
    linear: 'Linear',
    easeInQuad: 'Ease In (Quad)', easeOutQuad: 'Ease Out (Quad)', easeInOutQuad: 'Ease In-Out (Quad)',
    easeInCubic: 'Ease In (Cubic)', easeOutCubic: 'Ease Out (Cubic)', easeInOutCubic: 'Ease In-Out (Cubic)',
    easeInQuart: 'Ease In (Quart)', easeOutQuart: 'Ease Out (Quart)', easeInOutQuart: 'Ease In-Out (Quart)',
    easeInExpo: 'Ease In (Expo)', easeOutExpo: 'Ease Out (Expo)', easeInOutExpo: 'Ease In-Out (Expo)',
    easeInBack: 'Back In (anticipate)', easeOutBack: 'Back Out (overshoot)', easeInOutBack: 'Back In-Out',
    easeInElastic: 'Elastic In', easeOutElastic: 'Elastic Out',
    easeInBounce: 'Bounce In', easeOutBounce: 'Bounce Out',
    custom: 'Custom bezier…',
  };

  // Cubic-bezier solver (same semantics as CSS cubic-bezier(x1,y1,x2,y2)).
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    const solve = (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return t;
        const d = dsx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1; t = x;
      for (let i = 0; i < 30; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-6) return t;
        if (x > v) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return t;
    };
    return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
  }

  function getEasing(name, bezier) {
    if (name === 'custom' && Array.isArray(bezier) && bezier.length === 4) return cubicBezier(...bezier);
    return EASINGS[name] || EASINGS.linear;
  }

  global.Easing = { EASINGS, EASING_LABELS, cubicBezier, getEasing };
})(typeof window !== 'undefined' ? window : globalThis);
