// Brand kits: save colours/fonts/logo, switch style (brand carries over), apply to a fresh design,
// gallery thumbnails use the brand, kits persist across reloads.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 940 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto('file://' + require('path').resolve(__dirname, '../src/index.html'));
  await p.waitForTimeout(900);
  const logo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#e11d48"/></svg>').toString('base64');
  // Set a look + logo
  await p.evaluate((logo) => {
    const s = window.__l3rd.state;
    s.backdrop.fill = '#123456'; s.backdrop.accentColor = '#ff00aa'; s.title.color = '#fefefe'; s.subtitle.color = '#abcdef';
    s.title.font = 'Oswald'; s.subtitle.font = 'Lato';
    s.layers = { lg: Presets.newLayer('image', { src: logo, file: 'logo.svg', name: 'Logo' }) };
    s.order = ['backdrop', 'title', 'subtitle', 'lg'];
    window.__l3rd.replaceState(JSON.parse(JSON.stringify(s)));
  }, logo);
  await p.click('#btnBrand');
  await p.locator('#brandMenu button', { hasText: 'Save this design' }).click();
  await p.locator('dialog[open] input').fill('Acme');
  await p.locator('dialog[open] button.primary').click();
  await p.waitForTimeout(300);
  const label = await p.textContent('#btnBrand');
  // Switch style: brand stays
  await p.waitForTimeout(900);
  await p.locator('#styleGallery button.st').nth(2).click();
  await p.waitForTimeout(300);
  const afterStyle = await p.evaluate(() => { const s = window.__l3rd.state; return [s.backdrop.fill, s.backdrop.accentColor, s.title.color, s.title.font, s.subtitle.font, s.ui.style]; });
  // Fresh design: apply brand from menu adds the logo
  await p.evaluate(() => window.__l3rd.replaceState(Presets.defaultState()));
  await p.click('#btnBrand');
  await p.locator('#brandMenu .brand-item', { hasText: 'Acme' }).click();
  await p.waitForTimeout(200);
  const applied = await p.evaluate(() => { const s = window.__l3rd.state; return { fill: s.backdrop.fill, font: s.title.font, logos: Object.values(s.layers || {}).filter((l) => l.kind === 'image').length, brand: s.ui.brand }; });
  // Apply twice does not add a second logo
  await p.click('#btnBrand');
  await p.locator('#brandMenu .brand-item', { hasText: 'Acme' }).click();
  const logos2 = await p.evaluate(() => Object.values(window.__l3rd.state.layers || {}).filter((l) => l.kind === 'image').length);
  // Persists
  await p.reload(); await p.waitForTimeout(900);
  await p.click('#btnBrand');
  const kept = await p.locator('#brandMenu .brand-item', { hasText: 'Acme' }).count();
  await p.screenshot({ path: 'test/out/brand.png' });
  console.log({ label, afterStyle, applied, logos2, kept, errs });
  const ok = /Acme/.test(label) && afterStyle[0] === '#123456' && afterStyle[1] === '#ff00aa' && afterStyle[3] === 'Oswald' && afterStyle[4] === 'Lato' && afterStyle[5] === 2
    && applied.fill === '#123456' && applied.font === 'Oswald' && applied.logos === 1 && logos2 === 1 && kept === 1 && !errs.length;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
})();
