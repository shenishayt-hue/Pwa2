// LYNKO CHAT — offline store.
// Every chat list / message list the app loads (and every message that arrives live) is saved on the phone in IndexedDB.
// Offline = the saved copy is shown exactly like normal. Everything saved is the same ENCRYPTED data the server sends
// (the key never leaves the phone) and it is wiped on logout. Messages older than 24 h are dropped, like on the server.
(function () {
  const DB = 'lynko-offline', ST = 'kv', KEEP = 864e5, MAXMSG = 300;
  const uid = () => localStorage.getItem('lynko_id') || '0';
  const P = () => uid() + '|';
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  }).catch(e => { dbp = null; throw e }));
  const run = (mode, f) => db().then(d => new Promise((res, rej) => {
    const t = d.transaction(ST, mode), s = t.objectStore(ST); let out;
    const q = f(s); if (q) q.onsuccess = () => { out = q.result };
    t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error);
  }));
  const get = k => run('readonly', s => s.get(P() + k)).catch(() => undefined);
  const set = (k, v) => run('readwrite', s => s.put(v, P() + k)).catch(() => {});
  const del = k => run('readwrite', s => s.delete(P() + k)).catch(() => {});
  const keys = prefix => run('readonly', s => s.getAllKeys()).then(a => (a || []).filter(k => typeof k == 'string' && k.startsWith(P() + prefix)).map(k => k.slice(P().length))).catch(() => []);
  const live = m => Date.now() - new Date(m.ts) < KEEP;

  // ── what is worth saving ──
  const SAVE = /^\/api\/(me|config|chats|messages|statuses|official|calls)(\?|$)/;
  const ok = url => SAVE.test(url);
  const parts = url => { const u = new URL(url, location.origin); return { path: u.pathname, w: u.searchParams.get('with'), after: u.searchParams.get('after') } };

  async function mergeMsgs(w, add, replace) {
    let list = replace ? [] : (await get('msgs:' + w)) || [];
    const at = new Map(list.map((m, i) => [m.id, i]));
    for (const m of add) { if (!m || !m.id || m.pending) continue; if (at.has(m.id)) list[at.get(m.id)] = { ...list[at.get(m.id)], ...m }; else { at.set(m.id, list.length); list.push(m) } }
    list = list.filter(live).sort((a, b) => String(a.ts).localeCompare(String(b.ts))).slice(-MAXMSG);
    await set('msgs:' + w, list); return list;
  }
  async function save(url, data) {
    try {
      const { path, w, after } = parts(url);
      if (path == '/api/messages' && w && Array.isArray(data)) return mergeMsgs(w, data, !after);
      if (path == '/api/me' && data && data.contacts) { await set('me', data); return }
      await set('u:' + path, data);
    } catch {}
  }
  async function read(url) {
    try {
      const { path, w, after } = parts(url);
      if (path == '/api/messages' && w) {
        let l = ((await get('msgs:' + w)) || []).filter(live);
        if (after) l = l.filter(m => String(m.ts) > after);
        return l;
      }
      if (path == '/api/me') return await get('me');
      if (path == '/api/chats') {   // rebuilt from saved messages so chats that received live messages are up to date too
        const old = (await get('u:/api/chats')) || [], by = new Map(old.map(c => [c.peer, c])), me = uid();
        for (const k of await keys('msgs:')) {
          const peer = k.slice(5), l = ((await get(k)) || []).filter(live); if (!l.length) { by.delete(peer); continue }
          const last = l[l.length - 1], o = by.get(peer), unread = l.filter(m => m.from != me && !m.r).length;
          if (!o || String(last.ts) >= String(o.last && o.last.ts || '')) by.set(peer, { peer, unread: Math.max(unread, 0), last });
        }
        return [...by.values()];
      }
      return await get('u:' + path);
    } catch { return undefined }
  }

  // ── network state + banner ──
  let online = navigator.onLine !== false, bar = null; const back = [];
  function paint() {
    if (!bar) {
      const st = document.createElement('style');
      st.textContent = '#offbar{position:fixed;left:50%;transform:translate(-50%,-140%);top:calc(46px + env(safe-area-inset-top));z-index:90;background:#3a1230;color:#ffe3ee;border:1px solid rgba(255,255,255,.18);border-radius:20px;padding:7px 14px;font:500 13px/1.2 "DM Sans",system-ui,sans-serif;box-shadow:0 6px 24px #0008;transition:transform .25s ease;pointer-events:none;max-width:92vw;text-align:center}#offbar.on{transform:translate(-50%,0)}';
      document.head.appendChild(st);
      bar = document.createElement('div'); bar.id = 'offbar'; bar.textContent = '📴 Offline — showing saved chats'; bar.setAttribute('role', 'status'); document.body.appendChild(bar);
    }
    bar.classList.toggle('on', !online);
  }
  function net(v) {
    v = !!v; if (v === online) return; online = v;
    if (document.body) paint(); else addEventListener('DOMContentLoaded', paint);
    if (v) back.forEach(f => { try { f() } catch {} });
  }
  addEventListener('online', () => net(true)); addEventListener('offline', () => net(false));
  addEventListener('DOMContentLoaded', () => { if (!online) paint() });

  // ── pre-download small media (photos, voice) so they open offline too ──
  const warmed = new Set(), q = []; let busy = 0;
  function warm(m, p) {
    if (!online || !m || !p || m.pending || warmed.has(m.id) || !m.media && !/^(img|aud)$/.test(p.k)) return;
    if (!/^(img|aud)$/.test(p.k) || (p.size || 0) > 3 * 1048576) return;
    warmed.add(m.id); q.push('/api/blob/' + m.id); pump();
  }
  function pump() {
    if (busy >= 2 || !q.length) return; busy++;
    const u = q.shift();
    fetch(u).catch(() => {}).finally(() => { busy--; setTimeout(pump, 120) });
  }

  window.OFF = {
    ok, read, save, net, warm, get, set,
    get online() { return online },
    onBack: f => back.push(f),
    addMsg: (peer, m) => mergeMsgs(peer, [m], false).catch(() => {}),
    delMsg: id => keys('msgs:').then(ks => Promise.all(ks.map(async k => { const l = (await get(k)) || []; if (l.some(m => m.id == id)) await set(k, l.filter(m => m.id != id)) }))).catch(() => {}),
    wipe: () => { try { indexedDB.deleteDatabase(DB) } catch {} dbp = null },
  };
})();
