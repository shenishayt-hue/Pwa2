// LYNKO CHAT — auto error / bug fix.
// 1) the app is watched: a burst of script errors, or a page that never finishes starting, triggers a safe self-repair
// 2) "🛠 Fix problems" in the ⋮ menu runs the same repair by hand
// The repair NEVER touches your login, your keys, saved chats (offline.js) or saved media — it only resets the app files (service worker + shell cache) and reloads.
// Errors are reported to the admin panel by install.js, so you can see what broke.
(function () {
  const K = 'lk_heal', say = t => { try { typeof toast == 'function' ? toast(t) : 0 } catch {} };
  const hist = () => { try { return (JSON.parse(localStorage.getItem(K) || '[]')).filter(t => Date.now() - t < 18e5) } catch { return [] } };
  const canAuto = () => hist().length < 2 && navigator.onLine !== false;   // at most 2 automatic repairs per 30 min: never a reload loop
  const mark = () => { try { localStorage.setItem(K, JSON.stringify([...hist(), Date.now()])) } catch {} };

  async function repair() {
    try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())) } catch {}
    try { for (const k of await caches.keys()) if (/^lynko-(shell|ext)/.test(k)) await caches.delete(k) } catch {}
    try { await navigator.serviceWorker.register('/sw.js') } catch {}
  }
  async function run(manual) {
    if (manual && navigator.onLine === false) return say('You are offline — your saved chats are safe, nothing to fix');
    if (manual) say('Fixing… the app will restart');
    await repair(); mark();
    setTimeout(() => { try { sessionStorage.setItem('lk_reload', '1') } catch {} location.reload() }, manual ? 700 : 100);
  }
  window.HEAL = { run, repair };

  // burst of errors -> repair
  const hits = [];
  const bad = msg => { msg = String(msg || ''); return !/ResizeObserver|Script error\.?$|Non-Error promise rejection|AbortError|NetworkError|Failed to fetch|Load failed|The user aborted/i.test(msg) };
  const note = msg => {
    if (!bad(msg)) return; const n = Date.now(); hits.push(n); while (hits.length && n - hits[0] > 15e3) hits.shift();
    if (hits.length >= 6 && canAuto()) { hits.length = 0; run(false) }
  };
  addEventListener('error', e => { if (e.target && e.target !== window) return; note(e.message) });   // resource (image) failures are ignored
  addEventListener('unhandledrejection', e => note(e.reason && e.reason.message || e.reason));

  // the chat page never started (white screen) -> repair
  if (location.pathname == '/chat') setTimeout(() => {
    const loggedIn = localStorage.getItem('lynko_enc') && sessionStorage.getItem('lynko_priv');   // locked app waiting for the password is not a fault
    if (!window.__lynkoReady && loggedIn && canAuto() && !(window.OFF && !OFF.online)) run(false);
  }, 20000);
})();
