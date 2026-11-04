// Licence logic without the network: trial, plans, activation, revalidation, offline grace.
// Run: node test/license-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLicensing } = require('../license');

const DAY = 86400000;
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'BAD '} ${msg}`); if (!cond) fails++; };

function setup({ enforce = true, storeId = 7, responses = {}, start = Date.UTC(2026, 10, 4) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-lic-'));
  const clock = { t: start };
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const action = url.split('/').pop();
    calls.push({ action, body: Object.fromEntries(new URLSearchParams(opts.body)) });
    const r = responses[action];
    if (r instanceof Error) throw r;
    return { ok: true, json: async () => (typeof r === 'function' ? r() : r) || {} };
  };
  delete process.env.THIRDLINE_LICENSING;
  const lic = createLicensing({ userDir: () => dir, config: { enforce, storeId, trialDays: 14, buyUrl: 'https://example.com/buy' }, fetchImpl, now: () => clock.t });
  return { lic, clock, calls, dir };
}
const meta = (variant, store = 7) => ({ store_id: store, product_name: 'Thirdline', variant_name: variant, customer_email: 'a@b.c' });

(async () => {
  // Not enforced: everything on.
  { const { lic } = setup({ enforce: false }); const s = lic.status(); ok(!s.enforce && s.plan === 'studio' && s.features.mogrt, 'not enforced → everything unlocked'); }

  // Trial, then Free.
  { const { lic, clock } = setup();
    let s = lic.status(); ok(s.trial && s.plan === 'studio' && s.daysLeft === 14, `fresh install → 14-day Studio trial (${s.daysLeft})`);
    clock.t += 10 * DAY; s = lic.status(); ok(s.trial && s.daysLeft === 4, `day 10 → 4 days left (${s.daysLeft})`);
    clock.t += 5 * DAY; s = lic.status(); ok(!s.trial && s.plan === 'free' && s.features.watermark && !s.features.advanced, 'trial over → Free with watermark, no Advanced');
    ok(!lic.can('batch') && !lic.can('mogrt') && !lic.can('live'), 'Free can’t batch, mogrt or go live'); }

  // Activation: Pro and Studio from the variant name, wrong store rejected, server errors shown.
  { const { lic, clock } = setup({ responses: { activate: { activated: true, instance: { id: 'i1' }, meta: meta('Pro') } } });
    clock.t += 30 * DAY;
    const s = await lic.activate('KEY-PRO-1234');
    ok(s.licensed && s.plan === 'pro' && !s.features.watermark && s.features.advanced && !s.features.batch, 'Pro key → Pro (no watermark, Advanced, no batch)');
    ok(s.key === 'KEY-…1234', `key is masked (${s.key})`); }
  { const { lic } = setup({ responses: { activate: { activated: true, instance: { id: 'i2' }, meta: meta('Studio licence') } } });
    const s = await lic.activate('KEY-STUDIO'); ok(s.plan === 'studio' && s.features.mogrt, 'Studio key → Studio'); }
  { const { lic } = setup({ responses: { activate: { activated: true, instance: { id: 'i3' }, meta: meta('Pro', 99) } } });
    const s = await lic.activate('KEY-OTHER'); ok(s.error && /different product/.test(s.error), 'key from another store is rejected'); }
  { const { lic } = setup({ responses: { activate: { activated: false, error: 'This license key has reached the activation limit.' } } });
    const s = await lic.activate('KEY-FULL'); ok(s.error === 'This license key has reached the activation limit.', 'server error is passed through'); }
  { const { lic } = setup({ responses: { activate: new Error('getaddrinfo ENOTFOUND') } });
    const s = await lic.activate('KEY-OFFLINE'); ok(s.error && /Couldn’t reach/.test(s.error), 'offline activation explains itself'); }

  // Weekly revalidation; refunds turn it off; offline keeps working within the grace period.
  { let valid = true;
    const { lic, clock, calls } = setup({ responses: { activate: { activated: true, instance: { id: 'i4' }, meta: meta('Pro') }, validate: () => ({ valid, meta: meta('Pro') }) } });
    clock.t += 20 * DAY; await lic.activate('KEY-R');
    await lic.refresh(); ok(calls.filter((c) => c.action === 'validate').length === 0, 'no revalidation within a week');
    clock.t += 8 * DAY; await lic.refresh(); ok(calls.filter((c) => c.action === 'validate').length === 1 && calls.at(-1).body.instance_id === 'i4', 'revalidates after a week with the instance id');
    valid = false; clock.t += 8 * DAY; const s = await lic.refresh(); ok(s.plan === 'free' && s.expired, 'refunded/disabled key → Free'); }
  { const { lic, clock } = setup({ responses: { activate: { activated: true, instance: { id: 'i5' }, meta: meta('Pro') }, validate: new Error('offline') } });
    clock.t += 20 * DAY; await lic.activate('KEY-O');
    clock.t += 25 * DAY; let s = await lic.refresh(); ok(s.plan === 'pro', 'offline for 25 days → still Pro');
    clock.t += 10 * DAY; s = lic.status(); ok(s.plan === 'free', 'offline for 35 days → Free until it can check again'); }

  // Deactivate.
  { const { lic, calls } = setup({ responses: { activate: { activated: true, instance: { id: 'i6' }, meta: meta('Pro') }, deactivate: { deactivated: true } } });
    await lic.activate('KEY-D'); const s = await lic.deactivate();
    ok(!s.licensed && calls.at(-1).action === 'deactivate' && calls.at(-1).body.instance_id === 'i6', 'deactivate frees the seat and removes the key'); }

  console.log(fails ? `FAIL (${fails})` : 'PASS');
  process.exit(fails ? 1 : 0);
})();
