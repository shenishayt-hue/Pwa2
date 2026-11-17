// Attack watch for LYNKO CHAT: records suspicious requests with the IP, scores them and blocks repeat offenders automatically.
//   路 strike(req|ip, kind, points, detail)  -> logs an event (`secevents`) and adds points to that IP
//   路 10 points inside 10 minutes -> auto block (1 h; 24 h if the IP was blocked before in the last 7 days)
//   路 scanners (/wp-login.php, /.env, /.git ...) are blocked at once
//   路 blocked IPs live in `blockedips` (kept in memory too, refreshed every 60 s so several servers agree)
//   路 SECURITY_ALLOW_IPS=1.2.3.4,5.6.7.8 -> IPs that are never blocked (put your own home IP here)
const LIMIT = 10, WINDOW = 10 * 6e4, HOUR = 36e5;
const SCAN = /(^\/(wp-|wordpress|xmlrpc|phpmyadmin|pma|adminer|cgi-bin|vendor\/phpunit|actuator|boaform|HNAP1|owa\/|solr|jenkins|\.git|\.svn|\.env|\.aws|\.ssh|\.DS_Store|config\.(php|json|yml)|backup|database\.sql|server-status|console))|(\.\.\/|\.\.%2f|%2e%2e|etc\/passwd|\.php($|\?)|\.asp|\.jsp)/i;

module.exports = function security({ C }) {
  const allow = new Set(String(process.env.SECURITY_ALLOW_IPS || '').split(',').map(s => s.trim()).filter(Boolean));
  const clean = ip => String(ip || '').replace(/^::ffff:/, '').slice(0, 64);
  const isLocal = ip => !ip || ip === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const safe = ip => allow.has(ip) || isLocal(ip);

  const blocked = new Map();     // ip -> { until: ms|0 (0 = forever), reason }
  const score = new Map();       // ip -> { n, t }
  const isBlocked = ip => { const b = blocked.get(ip); if (!b) return false; if (b.until && b.until < Date.now()) { blocked.delete(ip); return false; } return true; };

  async function refresh() {
    if (!C.BL) return;
    try {
      const rows = await C.BL.find({ $or: [{ until: null }, { until: { $gt: new Date() } }] }).limit(5000).toArray();
      blocked.clear();
      for (const r of rows) blocked.set(r.ip, { until: r.until ? +r.until : 0, reason: r.reason });
    } catch (e) { console.warn('security refresh:', e.message); }
  }
  setInterval(refresh, 6e4).unref();
  setInterval(() => { const o = Date.now() - WINDOW; for (const [k, v] of score) if (v.t < o) score.delete(k); }, 6e5).unref();

  async function block(ip, hours, reason, by = 'auto') {
    ip = clean(ip); if (!ip || safe(ip)) return false;
    const until = hours ? new Date(Date.now() + hours * HOUR) : null;
    blocked.set(ip, { until: until ? +until : 0, reason });
    if (C.BL) await C.BL.updateOne({ ip }, { $set: { ip, until, reason: String(reason || '').slice(0, 120), by, at: new Date() }, $inc: { times: 1 } }, { upsert: true }).catch(() => {});
    return true;
  }
  async function unblock(ip) { ip = clean(ip); blocked.delete(ip); score.delete(ip); if (C.BL) await C.BL.deleteOne({ ip }).catch(() => {}); }

  // req can be an express request or a bare IP string
  function strike(req, kind, points = 1, detail = '') {
    const ip = clean(typeof req === 'string' ? req : req.ip); if (!ip || safe(ip)) return;
    const now = Date.now(), r = typeof req === 'string' ? {} : req;
    if (C.SE) C.SE.insertOne({ ip, kind, pts: points, detail: String(detail || r.originalUrl || '').slice(0, 160), ua: String(r.headers && r.headers['user-agent'] || '').slice(0, 160),
      cc: String(r.headers && (r.headers['cf-ipcountry'] || r.headers['x-vercel-ip-country']) || '').slice(0, 2), ts: new Date(now) }).catch(() => {});
    let s = score.get(ip); if (!s || now - s.t > WINDOW) s = { n: 0, t: now }; s.n += points; s.t = now; score.set(ip, s);
    if (s.n >= LIMIT && !isBlocked(ip)) {
      score.delete(ip);
      (async () => {
        let hrs = 1;
        try { const prev = C.BL && await C.BL.findOne({ ip }); if (prev && now - +prev.at < 7 * 864e5) hrs = 24; } catch {}
        await block(ip, hrs, 'auto: ' + kind, 'auto');
        console.warn(`馃洝 blocked ${ip} for ${hrs} h (${kind})`);
      })();
    }
  }

  // runs first on every request (except /health): blocked IP -> stop; scanner path -> block now
  const gate = (req, res, next) => {
    const ip = clean(req.ip);
    if (isBlocked(ip)) return res.status(403).type('text').send('Blocked');
    if (SCAN.test(req.path) || SCAN.test(req.originalUrl.slice(0, 300))) { strike(req, 'scanner', LIMIT, req.originalUrl); return res.status(404).end(); }
    next();
  };

  async function report() {
    const since = new Date(Date.now() - 864e5);
    const [ev, top, kinds, bl] = await Promise.all([
      C.SE.find().sort({ ts: -1 }).limit(80).toArray(),
      C.SE.aggregate([{ $match: { ts: { $gt: since } } }, { $group: { _id: '$ip', pts: { $sum: '$pts' }, n: { $sum: 1 }, last: { $max: '$ts' }, kinds: { $addToSet: '$kind' }, cc: { $last: '$cc' } } }, { $sort: { pts: -1 } }, { $limit: 15 }]).toArray(),
      C.SE.aggregate([{ $match: { ts: { $gt: since } } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]).toArray(),
      C.BL.find().sort({ at: -1 }).limit(100).toArray(),
    ]);
    const live = bl.filter(b => !b.until || +b.until > Date.now());
    return {
      blockedNow: live.length,
      events24: kinds.reduce((a, k) => a + k.n, 0),
      kinds: Object.fromEntries(kinds.map(k => [k._id, k.n])),
      blocked: live.map(b => ({ ip: b.ip, reason: b.reason, by: b.by, at: b.at, until: b.until, times: b.times || 1 })),
      top: top.map(t => ({ ip: t._id, pts: t.pts, n: t.n, last: t.last, kinds: t.kinds, cc: t.cc, blocked: isBlocked(t._id) })),
      events: ev.map(e => ({ ip: e.ip, kind: e.kind, detail: e.detail, cc: e.cc, ts: e.ts, ua: e.ua })),
    };
  }
  async function init() {
    await C.SE.createIndex({ ts: 1 }, { expireAfterSeconds: 30 * 864e5 }); await C.SE.createIndex({ ip: 1, ts: -1 });
    await C.BL.createIndex({ ip: 1 }, { unique: true });
    await refresh();
  }
  return { gate, strike, block, unblock, isBlocked, report, init, safe, clean };
};
