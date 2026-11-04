/* Thirdline — sample projects shown on the start screen. Each one is a finished design built from a
   built-in style, so they stay valid as the engine grows. */
(function (global) {
  'use strict';
  const P = () => global.Presets;
  const byName = (name) => Math.max(0, P().BUILTIN.findIndex((b) => b.name.replace(' (default)', '') === name));
  function make(style, title, subtitle, extras = [], tweak) {
    const st = P().builtin(byName(style));
    st.title.text = title; st.subtitle.text = subtitle;
    st.ui = { ...st.ui, style: byName(style) };
    extras.forEach(([kind, o], i) => {
      const id = `sample${i + 1}`;
      st.layers[id] = P().newLayer(kind, o);
      st.order = [...(st.order || ['backdrop', 'title', 'subtitle']), id];
    });
    if (tweak) tweak(st);
    return st;
  }
  const SAMPLES = [
    {
      name: 'Podcast guest',
      about: 'Pill style with an episode tag above the name.',
      build: () => make('Podcast Pill', 'Maya Okafor', 'Founder, Northwind Audio', [
        ['text', { name: 'Episode tag', text: 'EPISODE 42', size: 24, weight: 700, letterSpacing: 3, color: '#fde68a', y: -26, ax: 0, ay: 0 }],
      ]),
    },
    {
      name: 'Sports interview',
      about: 'Bold broadcast look with a team line and accent bar.',
      build: () => make('Sports Score', 'Luca Romano', 'Midfielder · #8', [
        ['text', { name: 'Team', text: 'FC RIVERSIDE', size: 24, weight: 700, letterSpacing: 2, color: '#ef4444', y: -24, ax: 0, ay: 0 }],
      ], (st) => { st.comp.duration = 7; }),
    },
    {
      name: 'Event announcement',
      about: 'Soft card for churches, schools and events: what, when, where.',
      build: () => make('Soft Card', 'Sunday Gathering', '10:30 AM · Main Hall'),
    },
    {
      name: 'Breaking news',
      about: 'Two-line news strap with a live tag.',
      build: () => make('Breaking News', 'Council approves transit plan', 'Live from City Hall', [
        ['text', { name: 'Live tag', text: '● LIVE', size: 24, weight: 800, letterSpacing: 2, color: '#ffffff', y: -26, ax: 0, ay: 0 }],
      ]),
    },
  ];
  global.Samples = SAMPLES;
})(typeof window !== 'undefined' ? window : globalThis);
