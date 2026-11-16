// Logged-in devices: every login gets a session id (sid) inside the cookie; the list can be viewed and any device logged out.
// Old cookies (made before this feature) have no sid: they stay valid until the user presses "Log out everywhere" (U.minIat).
const crypto = require('crypto');
module.exports = function sessions({ C }) {
  const cache = new Map(), mins = new Map();   // sid -> {ok,t}   uid -> {v,t}
  const fresh = t => Date.now() - t < 60000;
  const label = ua => {
    ua = String(ua || '');
    const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Unknown device';
    const br = /Edg\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Firefox\//i.test(ua) ? 'Firefox' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
    return br + ' · ' + os;
  };
  const maskIp = ip => { ip = String(ip || '').replace(/^::ffff:/, ''); return ip.includes(':') ? ip.split(':').slice(0, 3).join(':') + ':…' : ip.split('.').slice(0, 2).join('.') + '.•.•'; };
  async function create(req, u) {
    const sid = crypto.randomBytes(9).toString('base64url'), now = new Date();
    await C.SS.insertOne({ sid, uid: u.id, ua: String(req.headers['user-agent'] || '').slice(0, 200), ip: req.ip || '', createdAt: now, lastSeen: now });
    cache.set(sid, { ok: true, t: Date.now() });
    return sid;
  }
  async function minIat(uid) {
    const c = mins.get(uid); if (c && fresh(c.t)) return c.v;
    const u = await C.U.findOne({ id: uid }, { projection: { minIat: 1 } }); const v = (u && u.minIat) || 0;
    mins.set(uid, { v, t: Date.now() }); return v;
  }
  async function valid(p) {
    if (p.sid) {
      const c = cache.get(p.sid); if (c && fresh(c.t)) return c.ok;
      const d = await C.SS.findOne({ sid: p.sid, uid: p.id }); const ok = !!d;
      cache.set(p.sid, { ok, t: Date.now() });
      if (ok) C.SS.updateOne({ sid: p.sid }, { $set: { lastSeen: new Date() } }).catch(() => {});
      return ok;
    }
    const m = await minIat(p.id); return !m || p.iat * 1000 >= m;
  }
  async function list(uid, current) {
    const rows = await C.SS.find({ uid }).sort({ lastSeen: -1 }).limit(30).toArray();
    return rows.map(r => ({ sid: r.sid, device: label(r.ua), ip: maskIp(r.ip), createdAt: r.createdAt, lastSeen: r.lastSeen, current: r.sid === current }));
  }
  async function revoke(uid, sid) { const r = await C.SS.deleteOne({ sid, uid }); cache.set(sid, { ok: false, t: Date.now() }); return r.deletedCount > 0; }
  async function revokeAll(uid) {   // every device, including old cookies without a sid
    const rows = await C.SS.find({ uid }).limit(100).toArray();
    await C.SS.deleteMany({ uid }); rows.forEach(r => cache.set(r.sid, { ok: false, t: Date.now() }));
    const v = Date.now(); await C.U.updateOne({ id: uid }, { $set: { minIat: v } }); mins.set(uid, { v, t: Date.now() });
  }
  return { create, valid, list, revoke, revokeAll, label };
};
