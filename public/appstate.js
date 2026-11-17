// Maintenance screen + "update available" banner. Reads /api/appconfig (polled + pushed live by the admin dashboard).
(function () {
  var RK = 'lynko_rel', cur = null, busy = false;
  var css = document.createElement('style');
  css.textContent = '#mnt{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:radial-gradient(900px 700px at 10% 0%,#4a0d33,transparent 60%),#1a0713;color:#fff0f5;font:16px system-ui,sans-serif;text-align:center}' +
    '#mnt div{max-width:340px}#mnt h1{font-size:24px;margin:12px 0 8px}#mnt p{color:#d6a6ba;line-height:1.5;white-space:pre-wrap;margin:0}#mnt i{font-style:normal;font-size:54px}' +
    '#upb{position:fixed;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top,0px));z-index:99998;display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;background:#2b0d22ee;border:1px solid rgba(255,92,138,.6);color:#fff0f5;font:14px system-ui,sans-serif;box-shadow:0 10px 30px #0008;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}' +
    '#upb span{flex:1;line-height:1.35}#upb small{display:block;color:#d6a6ba;margin-top:2px}#upb button{border:0;border-radius:12px;padding:9px 14px;font:700 13px system-ui;cursor:pointer;color:#fff;background:linear-gradient(135deg,#ff5c8a,#c14bff)}#upb button.x{background:none;color:#d6a6ba;padding:9px 6px}';
  document.head.appendChild(css);

  function mk(tag, id, txt) { var e = document.createElement(tag); if (id) e.id = id; if (txt != null) e.textContent = txt; return e; }

  function showMaint(on, msg) {
    var o = document.getElementById('mnt');
    if (!on) { if (o) o.remove(); return; }
    if (!o) { o = mk('div', 'mnt'); var w = mk('div'); w.append(mk('i', '', '🛠️'), mk('h1', '', 'We’ll be right back'), mk('p', 'mntm')); o.appendChild(w); document.body.appendChild(o); }
    document.getElementById('mntm').textContent = msg || 'LYNKO CHAT is under maintenance. Please come back in a little while.';
  }

  async function applyUpdate() {   // fresh files, same login + chats (only the app-shell cache is cleared)
    if (busy) return; busy = true;
    try { localStorage.setItem(RK, String(cur)); } catch (e) {}
    try { var rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(function (r) { return r.unregister(); })); } catch (e) {}
    try { var ks = await caches.keys(); await Promise.all(ks.filter(function (k) { return /^lynko-(shell|ext)/.test(k); }).map(function (k) { return caches.delete(k); })); } catch (e) {}
    location.reload();
  }
  function showUpdate(note) {
    if (document.getElementById('upb')) return;
    var b = mk('div', 'upb'), t = mk('span'), s = mk('button', '', 'Update'), x = mk('button', '', 'Later');
    t.append(document.createTextNode('✨ A new update is ready'));
    if (note) t.append(mk('small', '', note));
    x.className = 'x'; s.onclick = applyUpdate; x.onclick = function () { b.remove(); };
    b.append(t, s, x); document.body.appendChild(b);
  }

  function set(d) {
    if (!d) return;
    showMaint(!!d.maint, d.maintMsg);
    var rel = +d.rel || 0; if (!rel) return;
    var seen = 0; try { seen = +localStorage.getItem(RK) || 0; } catch (e) {}
    cur = rel;
    if (!seen) { try { localStorage.setItem(RK, String(rel)); } catch (e) {} return; }   // first visit: nothing to update
    if (rel > seen) showUpdate(d.relNote);
  }
  function poll() { return fetch('/api/appconfig', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(set).catch(function () {}); }

  window.APPSTATE = { set: set, poll: poll, update: applyUpdate };
  var go = function () { poll(); setInterval(function () { if (!document.hidden) poll(); }, 30000); };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  addEventListener('online', poll);
})();
