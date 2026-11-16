// Group chats. End-to-end: the creator makes a random group key; it is wrapped (ECDH) for every member. The server only stores ciphertext.
// Messages vanish after 24 h like everything else. Members are checked on the server for every read / write.
const { ObjectId } = require('mongodb');
const MAXM = 64;
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const idOk = s => typeof s === 'string' && /^\d{8}$/.test(s);
const wrapOk = w => w && typeof w.iv === 'string' && typeof w.ct === 'string' && w.iv.length < 64 && w.ct.length < 400;

module.exports = function groups({ app, auth, C, fire, store, seal, unseal, mine, push, mon, PUB }) {
  const oid = s => { try { return new ObjectId(String(s)); } catch { return null; } };
  const getG = async (gid, uid) => { const _id = oid(gid); if (!_id) return null; const g = await C.GR.findOne({ _id }); return g && g.members.includes(uid) ? g : null; };
  const isAdmin = (g, uid) => g.owner === uid || (g.admins || []).includes(uid);
  const outM = m => ({ id: m._id.toString(), gid: m.gid, from: m.from, kind: m.kind, iv: m.iv, bIv: m.bIv || null, ct: unseal(m.ct).toString('base64'), media: !!m.bkey, ts: m.createdAt.toISOString() });
  const changed = (g, extra) => fire(g.members.concat(extra || []), 'ggrp', { gid: g._id.toString() });

  async function card(g, uid, withLast = true) {
    const ids = [...new Set(g.members)];
    const us = await C.U.find({ id: { $in: ids } }, { projection: PUB }).toArray();
    const k = g.keys && g.keys[uid];
    const r = { id: g._id.toString(), name: g.name, owner: g.owner, admins: g.admins || [], members: us.map(u => ({ id: u.id, username: u.username, pub: u.pub, dpv: u.dpv || 0 })), key: k ? { by: k.by, iv: k.iv, ct: k.ct } : null, createdAt: g.createdAt };
    if (withLast) {
      const last = await C.GM.find({ gid: r.id }).sort({ createdAt: -1 }).limit(1).toArray();
      const since = (g.reads && g.reads[uid]) || new Date(0);
      r.last = last[0] ? outM(last[0]) : null;
      r.unread = await C.GM.countDocuments({ gid: r.id, from: { $ne: uid }, createdAt: { $gt: since } });
    }
    return r;
  }

  app.get('/api/groups', auth, async (req, res) => {
    const gs = await C.GR.find({ members: req.u.id }).limit(100).toArray();
    res.json(await Promise.all(gs.map(g => card(g, req.u.id))));
  });
  app.post('/api/groups', auth, async (req, res) => {
    const me = req.u.id, b = req.body || {}, name = clean(b.name, 40);
    if (!name) return res.status(400).json({ error: 'Give the group a name' });
    const ids = [...new Set((Array.isArray(b.members) ? b.members : []).filter(idOk).filter(x => x !== me))];
    if (!ids.length) return res.status(400).json({ error: 'Pick at least one member' });
    if (ids.length + 1 > MAXM) return res.status(400).json({ error: 'A group can have up to ' + MAXM + ' members' });
    const my = await C.U.findOne({ id: me }, { projection: { contacts: 1 } });
    if (!ids.every(i => (my.contacts || []).includes(i))) return res.status(400).json({ error: 'You can only add people from your contacts' });
    const all = [me, ...ids], keys = {};
    for (const id of all) { const w = b.keys && b.keys[id]; if (!wrapOk(w)) return res.status(400).json({ error: 'Missing encryption key for a member' }); keys[id] = { by: me, iv: w.iv, ct: w.ct }; }
    const g = { name, owner: me, admins: [], members: all, keys, reads: {}, createdAt: new Date() };
    const r = await C.GR.insertOne(g); g._id = r.insertedId; mon.count('group');
    changed(g); res.json(await card(g, me));
  });
  app.post('/api/groups/:id/add', auth, async (req, res) => {
    const me = req.u.id, g = await getG(req.params.id, me); if (!g) return res.status(404).json({ error: 'Group not found' });
    if (!isAdmin(g, me)) return res.status(403).json({ error: 'Only admins can add people' });
    const b = req.body || {}, ids = [...new Set((Array.isArray(b.members) ? b.members : []).filter(idOk))].filter(x => !g.members.includes(x));
    if (!ids.length) return res.status(400).json({ error: 'Nobody to add' });
    if (g.members.length + ids.length > MAXM) return res.status(400).json({ error: 'A group can have up to ' + MAXM + ' members' });
    const my = await C.U.findOne({ id: me }, { projection: { contacts: 1 } });
    if (!ids.every(i => (my.contacts || []).includes(i))) return res.status(400).json({ error: 'You can only add people from your contacts' });
    const set = {}; for (const id of ids) { const w = b.keys && b.keys[id]; if (!wrapOk(w)) return res.status(400).json({ error: 'Missing encryption key' }); set['keys.' + id] = { by: me, iv: w.iv, ct: w.ct }; }
    await C.GR.updateOne({ _id: g._id }, { $addToSet: { members: { $each: ids } }, $set: set });
    const g2 = { ...g, members: [...g.members, ...ids] }; changed(g2); res.json(await card({ ...g2, keys: { ...g.keys, ...Object.fromEntries(ids.map(i => [i, set['keys.' + i]])) } }, me));
  });
  app.post('/api/groups/:id/remove', auth, async (req, res) => {
    const me = req.u.id, g = await getG(req.params.id, me), t = String((req.body || {}).id || '');
    if (!g) return res.status(404).json({ error: 'Group not found' });
    if (!isAdmin(g, me)) return res.status(403).json({ error: 'Only admins can remove people' });
    if (!g.members.includes(t) || t === g.owner) return res.status(400).json({ error: 'Can’t remove this person' });
    await C.GR.updateOne({ _id: g._id }, { $pull: { members: t, admins: t }, $unset: { ['keys.' + t]: 1 } });
    changed(g); res.json({ ok: 1 });
  });
  app.post('/api/groups/:id/leave', auth, async (req, res) => {
    const me = req.u.id, g = await getG(req.params.id, me); if (!g) return res.status(404).json({ error: 'Group not found' });
    const left = g.members.filter(x => x !== me);
    if (!left.length) { await Promise.all([C.GR.deleteOne({ _id: g._id }), C.GM.deleteMany({ gid: g._id.toString() })]); fire([me], 'ggrp', { gid: g._id.toString() }); return res.json({ ok: 1 }); }
    const owner = g.owner === me ? ((g.admins || []).find(a => a !== me && left.includes(a)) || left[0]) : g.owner;
    await C.GR.updateOne({ _id: g._id }, { $set: { owner }, $pull: { members: me, admins: me }, $unset: { ['keys.' + me]: 1 } });
    changed(g); res.json({ ok: 1 });
  });
  app.post('/api/groups/:id/rename', auth, async (req, res) => {
    const g = await getG(req.params.id, req.u.id), name = clean((req.body || {}).name, 40);
    if (!g) return res.status(404).json({ error: 'Group not found' }); if (!isAdmin(g, req.u.id)) return res.status(403).json({ error: 'Only admins can rename' });
    if (!name) return res.status(400).json({ error: 'Give the group a name' });
    await C.GR.updateOne({ _id: g._id }, { $set: { name } }); changed(g); res.json({ ok: 1 });
  });
  app.post('/api/groups/:id/admin', auth, async (req, res) => {   // owner makes / removes an admin
    const g = await getG(req.params.id, req.u.id), t = String((req.body || {}).id || ''), on = !!(req.body || {}).on;
    if (!g) return res.status(404).json({ error: 'Group not found' }); if (g.owner !== req.u.id) return res.status(403).json({ error: 'Only the group owner can do this' });
    if (!g.members.includes(t) || t === g.owner) return res.status(400).json({ error: 'Bad member' });
    await C.GR.updateOne({ _id: g._id }, on ? { $addToSet: { admins: t } } : { $pull: { admins: t } }); changed(g); res.json({ ok: 1 });
  });
  app.post('/api/groups/:id/read', auth, async (req, res) => {
    const g = await getG(req.params.id, req.u.id); if (!g) return res.status(404).json({ error: 'Group not found' });
    await C.GR.updateOne({ _id: g._id }, { $set: { ['reads.' + req.u.id]: new Date() } }); res.json({ ok: 1 });
  });

  app.get('/api/gmessages', auth, async (req, res) => {
    const g = await getG(req.query.gid, req.u.id); if (!g) return res.status(404).json({ error: 'Group not found' });
    const q = { gid: g._id.toString() }; if (req.query.after) { const d = new Date(String(req.query.after)); if (!isNaN(d)) q.createdAt = { $gt: d }; }
    res.json((await C.GM.find(q).sort({ createdAt: 1 }).limit(300).toArray()).map(outM));
  });
  app.post('/api/gmessages', auth, async (req, res) => {
    const me = req.u.id, b = req.body || {}, g = await getG(b.gid, me); if (!g) return res.status(404).json({ error: 'Group not found' });
    const kind = String(b.kind || ''), iv = String(b.iv || ''), ct = String(b.ct || '');
    if (!['text', 'img', 'vid', 'aud'].includes(kind) || !iv || !ct || iv.length > 64 || ct.length > 400000) return res.status(400).json({ error: 'Bad message' });
    const cbuf = Buffer.from(ct, 'base64'), _id = oid(undefined) || new ObjectId(), now = new Date();
    const doc = { _id, gid: g._id.toString(), from: me, kind, iv, ct: seal(cbuf), createdAt: now };
    if (kind !== 'text') { if (!mine(me, b.bkey) || !b.bIv) return res.status(400).json({ error: 'Missing media' }); Object.assign(doc, { bkey: b.bkey, bIv: String(b.bIv) }); }
    const m = { id: _id.toString(), gid: doc.gid, from: me, kind, iv, bIv: doc.bIv || null, ct: cbuf.toString('base64'), media: !!doc.bkey, ts: now.toISOString() };
    if (typeof b.tmp === 'string' && /^t[\w]{3,24}$/.test(b.tmp)) m.tmp = b.tmp;
    const small = m.ct.length < 6000;
    if (small) fire(g.members, 'gmsg', m);
    try { await C.GM.insertOne(doc); } catch (e) { if (small) fire(g.members, 'gdel', { id: m.id, gid: doc.gid }); throw e; }
    if (!small) fire(g.members, 'gmsg', { id: m.id, gid: m.gid, from: me });
    mon.count('msg');
    g.members.filter(x => x !== me).forEach(x => push(x, { type: 'msg', title: g.name, body: 'New message', tag: 'g' + doc.gid, from: doc.gid }));
    res.json(m);
  });
  app.delete('/api/gmessages/:id', auth, async (req, res) => {
    const _id = oid(req.params.id), m = _id && await C.GM.findOne({ _id }); if (!m) return res.status(404).json({ error: 'Not found' });
    const g = await getG(m.gid, req.u.id); if (!g) return res.status(403).json({ error: 'Not allowed' });
    if (m.from !== req.u.id && !isAdmin(g, req.u.id)) return res.status(403).json({ error: 'Only the sender or a group admin can delete' });
    await C.GM.deleteOne({ _id }); fire(g.members, 'gdel', { id: req.params.id, gid: m.gid }); res.json({ ok: 1 });
  });
  app.get('/api/gblob/:id', auth, async (req, res) => {
    const _id = oid(req.params.id), m = _id && await C.GM.findOne({ _id });
    if (!m || !m.bkey || !store || !(await getG(m.gid, req.u.id))) return res.status(404).end();
    await store.send(m.bkey, res, { 'X-IV': m.bIv, 'Cache-Control': 'private, max-age=3600' });
  });
};
