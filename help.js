// Help desk + account recovery.
//  · Help requests: anyone (even logged out) can write to the admins; the admin answers in /admin → Help. A request is a small chat thread.
//  · "Forgot password": (1) best: the Recovery Key (client-side, zero admin work)  (2) otherwise a help request of kind 'forgot'.
//    After the admin checks that the person is the owner, he presses "Allow reset" → a one-time code (24 h) appears inside that request.
//    With the code the person sets a NEW password + NEW keys. Old chats cannot be read any more (they vanish after 24 h anyway) — the server wipes them.
const crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0 O 1 I L
const newCode = () => { let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[crypto.randomInt(ALPHA.length)]; return s.slice(0, 4) + '-' + s.slice(4); };
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const clean = (t, n) => String(t || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

function create({ app, auth, optAuth, C, bcrypt, normPhone, human, limited, mon, sess, fire }) {
  const hits = new Map();   // ip -> [timestamps]  (new requests: 6 / hour / IP)
  const tooMany = ip => { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 36e5); a.push(n); hits.set(ip, a); if (hits.size > 5e3) hits.clear(); return a.length > 6; };
  const fails = new Map();  // phone -> {n,until}   (wrong recovery key / wrong reset code)
  const locked = k => { const f = fails.get(k); return !!f && f.n >= 8 && Date.now() < f.until; };
  const fail = k => { const f = fails.get(k) || { n: 0, until: 0 }; f.n++; f.until = Date.now() + 15 * 60e3; fails.set(k, f); if (fails.size > 5e3) fails.clear(); };
  const ok = k => fails.delete(k);
  const DUMMY = bcrypt.hashSync('lynko-dummy-recovery', 10);

  const view = (t, withReset) => {
    const r = withReset && t.resetCode && t.resetExp > new Date() ? { code: t.resetCode, exp: t.resetExp } : null;
    return { tid: t.tid, kind: t.kind, status: t.status, msgs: t.msgs.map(m => ({ from: m.from, t: m.t, ts: m.ts })), reset: r };
  };
  async function access(req) {   // ticket + permission: the secret key from the device that made it, or the logged-in owner
    const b = req.body || {}, tid = String(b.tid || '').slice(0, 20);
    const t = await C.T.findOne({ tid }); if (!t) return null;
    const me = await optAuth(req);
    if (me && t.uid && me.id === t.uid) return t;
    if (b.key && same(sha(b.key), t.keyHash)) return t;
    return null;
  }

  function mount() {
    app.post('/api/help/new', async (req, res) => {
      const b = req.body || {}, me = await optAuth(req);
      if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
      if (!me && !(await human(req))) return res.status(403).json({ error: 'Security check failed. Please try again.' });
      const kind = b.kind === 'forgot' ? 'forgot' : 'problem', text = clean(b.text, 1000), name = clean(b.name, 30);
      if (text.length < 3) return res.status(400).json({ error: 'Please write a few words about the problem' });
      let phone = null;
      if (kind === 'forgot' || (!me && b.phone)) { phone = normPhone(b.phone); if (!phone) return res.status(400).json({ error: 'Enter your phone number' }); }
      if (me && !phone) { const u = await C.U.findOne({ id: me.id }, { projection: { phone: 1 } }); phone = (u && u.phone) || null; }
      const tid = crypto.randomBytes(5).toString('hex'), key = crypto.randomBytes(16).toString('hex'), now = new Date();
      await C.T.insertOne({ tid, keyHash: sha(key), kind, phone, name, uid: me ? me.id : null, status: 'open', msgs: [{ from: 'user', t: text, ts: now }], createdAt: now, updatedAt: now, adminUnread: 1 });
      mon.count('help');
      res.json({ tid, key });
    });
    app.post('/api/help/get', async (req, res) => {
      const t = await access(req); if (!t) return res.status(404).json({ error: 'Request not found' });
      res.json(view(t, true));
    });
    app.post('/api/help/reply', async (req, res) => {
      const t = await access(req); if (!t) return res.status(404).json({ error: 'Request not found' });
      if (t.status !== 'open') return res.status(409).json({ error: 'This request is closed. Please open a new one.' });
      if (t.msgs.length >= 60) return res.status(429).json({ error: 'Too many messages in this request' });
      const text = clean((req.body || {}).text, 1000); if (!text) return res.status(400).json({ error: 'Write a message' });
      const now = new Date();
      await C.T.updateOne({ tid: t.tid }, { $push: { msgs: { from: 'user', t: text, ts: now } }, $set: { updatedAt: now, adminUnread: 1 } });
      res.json(view({ ...t, msgs: [...t.msgs, { from: 'user', t: text, ts: now }] }, true));
    });
    app.get('/api/help/mine', auth, async (req, res) => {   // my requests (any device)
      const rows = await C.T.find({ uid: req.u.id }).sort({ updatedAt: -1 }).limit(20).toArray();
      res.json(rows.map(t => ({ tid: t.tid, kind: t.kind, status: t.status, last: t.msgs[t.msgs.length - 1].t.slice(0, 80), updatedAt: t.updatedAt })));
    });

    // ── set a NEW password with the one-time code from the admin ──
    app.post('/api/reset', async (req, res) => {
      const b = req.body || {};
      if (limited(req.ip)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
      if (!(await human(req))) return res.status(403).json({ error: 'Security check failed. Please try again.' });
      const phone = normPhone(b.phone), code = normCode(b.code);
      if (!phone || code.length !== 8 || typeof b.auth !== 'string' || !/^[a-f0-9]{64}$/.test(b.auth) || typeof b.pub !== 'string' || typeof b.encPriv !== 'string' || b.pub.length > 1500 || b.encPriv.length > 3000)
        return res.status(400).json({ error: 'Check the number, the code and the new password' });
      const lk = 'r:' + phone; if (locked(lk)) return res.status(429).json({ error: 'Too many wrong codes. Wait 15 minutes.' });
      const t = await C.T.findOne({ phone, kind: 'forgot', resetHash: sha(code), resetExp: { $gt: new Date() } });
      const u = t && await C.U.findOne({ phone });
      if (!t || !u) { fail(lk); return res.status(401).json({ error: 'Wrong or expired code' }); }
      ok(lk);
      await C.U.updateOne({ id: u.id }, { $set: { hash: await bcrypt.hash(b.auth, 12), pub: b.pub, encPriv: b.encPriv, minIat: Date.now() }, $unset: { recPriv: 1, recAuthHash: 1 } });
      await sess.revokeAll(u.id);
      await Promise.all([C.M.deleteMany({ $or: [{ from: u.id }, { to: u.id }] }), C.S.deleteMany({ from: u.id })]);   // unreadable now (old keys) → clean them
      await C.T.updateOne({ tid: t.tid }, { $unset: { resetCode: 1, resetHash: 1, resetExp: 1 }, $set: { status: 'closed', updatedAt: new Date() }, $push: { msgs: { from: 'system', t: 'Password was reset with the admin’s code.', ts: new Date() } } });
      fire((u.contacts || []), 'prof', { id: u.id });   // friends fetch the new public key
      mon.count('reset');
      res.json({ ok: 1 });
    });

    // ── Recovery Key: a spare lock on the private key, made on the phone ──
    app.get('/api/recovery', auth, async (req, res) => { const u = await C.U.findOne({ id: req.u.id }, { projection: { recAuthHash: 1, recAt: 1 } }); res.json({ set: !!(u && u.recAuthHash), at: (u && u.recAt) || null }); });
    app.post('/api/recovery', auth, async (req, res) => {
      const b = req.body || {};
      if (typeof b.recAuth !== 'string' || !/^[a-f0-9]{64}$/.test(b.recAuth) || typeof b.recPriv !== 'string' || b.recPriv.length > 3000) return res.status(400).json({ error: 'Bad recovery data' });
      await C.U.updateOne({ id: req.u.id }, { $set: { recAuthHash: await bcrypt.hash(b.recAuth, 10), recPriv: b.recPriv, recAt: new Date() } });
      res.json({ ok: 1 });
    });
    const recCheck = async (req, res, checkHuman) => {   // -> user or null (response already sent)
      const b = req.body || {};
      if (limited(req.ip)) { res.status(429).json({ error: 'Too many tries. Wait a few minutes.' }); return null; }
      if (checkHuman && !(await human(req))) { res.status(403).json({ error: 'Security check failed. Please try again.' }); return null; }
      const phone = normPhone(b.phone), lk = 'k:' + (phone || 'x');
      if (locked(lk)) { res.status(429).json({ error: 'Too many wrong tries. Wait 15 minutes.' }); return null; }
      const u = phone ? await C.U.findOne({ phone }) : null;
      const good = typeof b.recAuth === 'string' && /^[a-f0-9]{64}$/.test(b.recAuth) && await bcrypt.compare(b.recAuth, u && u.recAuthHash ? u.recAuthHash : DUMMY);
      if (!u || !u.recAuthHash || !good) { fail(lk); res.status(401).json({ error: 'Wrong number or recovery key' }); return null; }
      ok(lk); return u;
    };
    app.post('/api/recover/start', async (req, res) => { const u = await recCheck(req, res, true); if (u) res.json({ recPriv: u.recPriv }); });
    app.post('/api/recover/finish', async (req, res) => {
      const u = await recCheck(req, res, false); if (!u) return;
      const b = req.body || {};
      if (typeof b.auth !== 'string' || !/^[a-f0-9]{64}$/.test(b.auth) || typeof b.encPriv !== 'string' || b.encPriv.length > 3000) return res.status(400).json({ error: 'Bad new password data' });
      await C.U.updateOne({ id: u.id }, { $set: { hash: await bcrypt.hash(b.auth, 12), encPriv: b.encPriv, minIat: Date.now() } });
      await sess.revokeAll(u.id); mon.count('recover');
      res.json({ ok: 1 });
    });
  }
  return { mount };
}

// ── admin side (called from admin.js with its own guard) ──
function adminRoutes(app, guard, C) {
  const sum = t => ({ tid: t.tid, kind: t.kind, status: t.status, phone: t.phone, name: t.name, n: t.msgs.length, last: t.msgs[t.msgs.length - 1].t.slice(0, 90), lastFrom: t.msgs[t.msgs.length - 1].from, unread: !!t.adminUnread, updatedAt: t.updatedAt, createdAt: t.createdAt, resetOpen: !!(t.resetExp && t.resetExp > new Date()) });
  app.get('/admin/api/tickets', guard, async (req, res) => {
    const st = ['open', 'closed'].includes(req.query.status) ? { status: req.query.status } : {};
    const rows = await C.T.find(st).sort({ updatedAt: -1 }).limit(100).toArray();
    res.json({ items: rows.map(sum), open: await C.T.countDocuments({ status: 'open' }) });
  });
  app.get('/admin/api/tickets/:tid', guard, async (req, res) => {
    const t = await C.T.findOne({ tid: String(req.params.tid).slice(0, 20) }); if (!t) return res.status(404).json({ error: 'Not found' });
    await C.T.updateOne({ tid: t.tid }, { $set: { adminUnread: 0 } });
    let acct = null;
    const u = t.uid ? await C.U.findOne({ id: t.uid }) : t.phone ? await C.U.findOne({ phone: t.phone }) : null;
    if (u) acct = { id: u.id, username: u.username, phone: u.phone || null, createdAt: u.createdAt, lastSeen: u.lastSeen || null, hasRecovery: !!u.recAuthHash, contacts: (u.contacts || []).length };
    res.json({ ...sum(t), msgs: t.msgs, acct, resetCode: t.resetExp && t.resetExp > new Date() ? t.resetCode : null });
  });
  app.post('/admin/api/tickets/:tid/reply', guard, async (req, res) => {
    const text = clean((req.body || {}).text, 1000); if (!text) return res.status(400).json({ error: 'Write a message' });
    const r = await C.T.updateOne({ tid: String(req.params.tid).slice(0, 20) }, { $push: { msgs: { from: 'admin', t: text, ts: new Date() } }, $set: { updatedAt: new Date(), adminUnread: 0 } });
    res.json({ ok: r.matchedCount > 0 });
  });
  const setStatus = st => async (req, res) => { const r = await C.T.updateOne({ tid: String(req.params.tid).slice(0, 20) }, { $set: { status: st, updatedAt: new Date() } }); res.json({ ok: r.matchedCount > 0 }); };
  app.post('/admin/api/tickets/:tid/close', guard, setStatus('closed'));
  app.post('/admin/api/tickets/:tid/reopen', guard, setStatus('open'));
  app.post('/admin/api/tickets/:tid/reset', guard, async (req, res) => {   // allow ONE password reset for this person
    const t = await C.T.findOne({ tid: String(req.params.tid).slice(0, 20) }); if (!t) return res.status(404).json({ error: 'Not found' });
    if (t.kind !== 'forgot' || !t.phone) return res.status(400).json({ error: 'Only “forgot password” requests with a phone number can be reset' });
    if (!(await C.U.findOne({ phone: t.phone }, { projection: { _id: 1 } }))) return res.status(404).json({ error: 'No account has this number' });
    const code = newCode(), exp = new Date(Date.now() + 864e5);
    await C.T.updateOne({ tid: t.tid }, { $set: { resetCode: code, resetHash: sha(normCode(code)), resetExp: exp, status: 'open', updatedAt: new Date() }, $push: { msgs: { from: 'system', t: 'Reset approved by admin. Use the code below on the login page → Forgot password → “I have a code”. It works for 24 hours, once.', ts: new Date() } } });
    res.json({ code, exp });
  });
}
module.exports = { create, adminRoutes, newCode, normCode };
