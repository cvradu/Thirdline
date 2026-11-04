// Licence keys, trial and plan (Free / Pro / Studio), checked in the main process.
//
// Keys are sold through Lemon Squeezy, whose licence API needs no secret in the app:
//   POST https://api.lemonsqueezy.com/v1/licenses/{activate,validate,deactivate}
// The plan comes from the product or variant name: anything with "Studio" in it is Studio, any
// other valid key is Pro. Nothing is enforced until app-config.json says "enforce": true (or
// THIRDLINE_LICENSING=1 is set), so builds can ship before the store is live.
const fs = require('fs');
const path = require('path');
const os = require('os');

const API = 'https://api.lemonsqueezy.com/v1/licenses';
const DAY = 86400000;
const REVALIDATE_EVERY = 7 * DAY; // check the key with the server at most once a week
const OFFLINE_GRACE = 30 * DAY; // keep working this long without reaching the server

// What each plan can do. The renderer only reads this; main.js re-checks the gated IPC calls.
const PLANS = {
  free: { name: 'Free', watermark: true, maxHeight: 1080, advanced: false, batch: false, live: false, mogrt: false },
  pro: { name: 'Pro', watermark: false, maxHeight: Infinity, advanced: true, batch: false, live: false, mogrt: false },
  studio: { name: 'Studio', watermark: false, maxHeight: Infinity, advanced: true, batch: true, live: true, mogrt: true },
};

function createLicensing({ userDir, config, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const cfg = { enforce: false, storeId: null, buyUrl: '', trialDays: 14, ...(config || {}) };
  const enforce = process.env.THIRDLINE_LICENSING === '1' || (cfg.enforce === true && process.env.THIRDLINE_LICENSING !== '0');
  const file = () => path.join(userDir(), 'license.json');
  const trialFile = () => path.join(userDir(), 'trial.json');
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };

  function trial() {
    let t = read(trialFile());
    if (!t || !t.started) { t = { started: now() }; try { write(trialFile(), t); } catch {} }
    const left = Math.ceil((t.started + cfg.trialDays * DAY - now()) / DAY);
    return { daysLeft: Math.max(0, left), active: left > 0 };
  }
  const planOf = (meta = {}) => (/studio/i.test(`${meta.variant_name || ''} ${meta.product_name || ''}`) ? 'studio' : 'pro');
  const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');

  async function call(action, body) {
    const r = await fetchImpl(`${API}/${action}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    let j = {};
    try { j = await r.json(); } catch {}
    return { ok: r.ok, ...j };
  }
  const wrongStore = (meta) => cfg.storeId != null && meta && meta.store_id != null && String(meta.store_id) !== String(cfg.storeId);

  // The current plan and why, for the UI.
  function status() {
    if (!enforce) return { enforce: false, plan: 'studio', features: PLANS.studio, buyUrl: cfg.buyUrl };
    const lic = read(file());
    const base = { enforce: true, buyUrl: cfg.buyUrl };
    if (lic && lic.key && lic.valid !== false && now() - (lic.checkedAt || 0) < OFFLINE_GRACE) {
      return { ...base, plan: lic.plan, features: PLANS[lic.plan] || PLANS.pro, licensed: true, key: mask(lic.key), email: lic.email || '', product: lic.product || '' };
    }
    const t = trial();
    if (t.active) return { ...base, plan: 'studio', features: PLANS.studio, trial: true, daysLeft: t.daysLeft, expired: !!(lic && lic.key) };
    return { ...base, plan: 'free', features: PLANS.free, trialEnded: true, expired: !!(lic && lic.key) };
  }

  async function activate(key) {
    key = String(key || '').trim();
    if (!key) return { error: 'Paste your licence key.' };
    let r;
    try { r = await call('activate', { license_key: key, instance_name: `${os.hostname()} (${process.platform})` }); } catch (e) { return { error: `Couldn’t reach the licence server (${e.message}). Check your connection and try again.` }; }
    if (!r.activated) return { error: r.error || 'That key wasn’t accepted.' };
    if (wrongStore(r.meta)) return { error: 'That key is for a different product.' };
    write(file(), { key, instanceId: r.instance && r.instance.id, plan: planOf(r.meta), product: [r.meta && r.meta.product_name, r.meta && r.meta.variant_name].filter(Boolean).join(' · '), email: r.meta && r.meta.customer_email, checkedAt: now(), valid: true });
    return status();
  }

  async function deactivate() {
    const lic = read(file());
    if (lic && lic.key && lic.instanceId) { try { await call('deactivate', { license_key: lic.key, instance_id: lic.instanceId }); } catch {} }
    try { fs.rmSync(file(), { force: true }); } catch {}
    return status();
  }

  // Re-checks the key with the server once a week. Offline is fine (grace period above); only a
  // definite "not valid" (refunded, disabled, expired) turns the plan off.
  async function refresh() {
    if (!enforce) return status();
    const lic = read(file());
    if (!lic || !lic.key || now() - (lic.checkedAt || 0) < REVALIDATE_EVERY) return status();
    try {
      const r = await call('validate', { license_key: lic.key, ...(lic.instanceId ? { instance_id: lic.instanceId } : {}) });
      if (r.valid === true && !wrongStore(r.meta)) write(file(), { ...lic, plan: planOf(r.meta), checkedAt: now(), valid: true });
      else if (r.valid === false) write(file(), { ...lic, valid: false, checkedAt: now() });
    } catch {}
    return status();
  }

  // The trial clock starts on first launch, not the first time a trial is needed (otherwise a
  // refunded key would hand out a fresh trial).
  if (enforce) trial();
  const can = (feature) => !!status().features[feature];
  return { status, activate, deactivate, refresh, can, enforce };
}

module.exports = { createLicensing, PLANS };
