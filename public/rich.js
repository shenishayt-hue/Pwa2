// Message text: WhatsApp-style formatting (*bold* _italic_ ~strike~ `mono` ```block```), clickable links, @mentions in groups,
// the "Aa" style button (fancy letters) and the @mention picker. Everything is built with DOM nodes (never innerHTML), so message text cannot inject HTML.
(function () {
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var T = function (s) { return document.createTextNode(s); };

  function styled(el, s) {   // *bold*  _italic_  ~strike~ : marker must touch the text, and sit at a word edge
    var re = /(^|[\s(])([*_~])(?=\S)([^\n]*?\S)\2(?=$|[\s.,!?:;)])/;
    for (;;) {
      var m = re.exec(s);
      if (!m) { if (s) el.appendChild(T(s)); return; }
      var pre = s.slice(0, m.index) + m[1]; if (pre) el.appendChild(T(pre));
      var n = document.createElement(m[2] == '*' ? 'b' : m[2] == '_' ? 'i' : 's');
      styled(n, m[3]); el.appendChild(n);
      s = s.slice(m.index + m[0].length);
    }
  }

  function link(el, part) {
    var u = part.replace(/[.,!?;:)\]]+$/, ''), tail = part.slice(u.length), href = /^www\./i.test(u) ? 'https://' + u : u, ok = false;
    try { ok = /^https?:$/.test(new URL(href).protocol); } catch (e) {}
    if (!ok) { el.appendChild(T(part)); return; }
    var a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; a.textContent = u;
    a.addEventListener('click', function (e) { e.stopPropagation(); });   // a tap on a link opens it (no message menu)
    el.appendChild(a); if (tail) el.appendChild(T(tail));
  }

  // opt = { names: [member usernames], me: my username }  -> returns true when the text mentions me
  function render(el, txt, opt) {
    txt = String(txt == null ? '' : txt);
    var names = (opt && opt.names) || [], me = opt && opt.me, hit = false;
    var pat = '(```[\\s\\S]+?```|`[^`\\n]+`|https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+' +
      (names.length ? '|@(?:' + names.slice().sort(function (a, b) { return b.length - a.length; }).map(esc).join('|') + ')(?![\\p{L}\\p{N}_])' : '') + ')';
    var parts = txt.split(new RegExp(pat, 'iu'));
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p) continue;
      if (i % 2 == 0) { styled(el, p); continue; }
      if (p.slice(0, 3) == '```') { var pre = document.createElement('pre'); pre.className = 'rmono'; pre.textContent = p.slice(3, -3).replace(/^\n/, ''); el.appendChild(pre); }
      else if (p[0] == '`') { var c = document.createElement('code'); c.className = 'rmono'; c.textContent = p.slice(1, -1); el.appendChild(c); }
      else if (p[0] == '@') { var s = document.createElement('span'); s.className = 'rmn'; s.textContent = p; if (me && p.slice(1).toLowerCase() == String(me).toLowerCase()) { s.className += ' me'; hit = true; } el.appendChild(s); }
      else link(el, p);
    }
    return hit;
  }
  function ctx(gid) { var g = window.GX && GX.groups.get(gid); return g ? { names: g.members.map(function (u) { return u.username; }).filter(Boolean), me: me.username } : null; }
  window.RICH = { render: render, ctx: ctx };

  if (typeof document == 'undefined' || !document.head) return;
  var css = document.createElement('style');
  css.textContent = '.tx a{text-decoration:underline;text-underline-offset:2px}.rmn{color:#7fe3ff;font-weight:600}.rmn.me{background:rgba(255,200,60,.22);border-radius:6px;padding:0 3px;color:#ffd666}' +
    '.rmono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em;background:rgba(0,0,0,.28);border-radius:6px;padding:1px 5px}pre.rmono{display:block;white-space:pre-wrap;padding:8px 10px;margin:4px 0}' +
    '.b.mnt-me{box-shadow:0 0 0 2px rgba(255,200,60,.55)}' +
    '#mpop{position:fixed;left:8px;right:8px;z-index:60;max-width:520px;margin:0 auto;background:var(--panel,#240b1d);border:1px solid var(--line,#ffffff1f);border-radius:16px;box-shadow:0 10px 30px #0009;overflow:hidden}' +
    '#mpop button{display:flex;gap:10px;align-items:center;width:100%;padding:11px 14px;text-align:left;color:inherit;background:none;border:0;font:15px inherit;border-bottom:1px solid var(--line,#ffffff14)}#mpop button:last-child{border:0}' +
    '#mpop i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 14px system-ui;font-style:normal;color:#fff;background:#ff5c8a}' +
    '.rfx{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.rfx button,.rfy button{padding:11px 6px;border-radius:12px;background:rgba(255,255,255,.1);border:0;color:inherit;font:16px system-ui}.rfy{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:6px}';
  document.head.appendChild(css);

  var txt = document.getElementById('txt'); if (!txt) return;

  // ── @mention picker (groups) ──
  var pop = null; var close = function () { if (pop) { pop.remove(); pop = null; } };
  txt.addEventListener('input', function () {
    if (!(window.GX && GX.is(cur))) return close();
    var before = txt.value.slice(0, txt.selectionStart), m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    var g = m && GX.groups.get(cur.slice(2)); if (!g) return close();
    var q = m[2].toLowerCase(), list = g.members.filter(function (u) { return u.id != me.id && u.username && u.username.toLowerCase().indexOf(q) == 0; }).slice(0, 6);
    if (!list.length) return close();
    close(); pop = document.createElement('div'); pop.id = 'mpop';
    list.forEach(function (u) {
      var b = document.createElement('button'), i = document.createElement('i'), n = document.createElement('span');
      b.type = 'button'; i.textContent = u.username[0].toUpperCase(); n.textContent = u.username; b.append(i, n);
      b.onpointerdown = function (e) { e.preventDefault(); };   // keep the keyboard open
      b.onclick = function () {
        var pos = txt.selectionStart, v = txt.value, start = pos - m[2].length - 1;
        txt.value = v.slice(0, start) + '@' + u.username + ' ' + v.slice(pos);
        var np = start + u.username.length + 2; txt.setSelectionRange(np, np); close(); txt.focus(); txt.dispatchEvent(new Event('input'));
      };
      pop.appendChild(b);
    });
    var r = (document.getElementById('comp') || txt).getBoundingClientRect();
    pop.style.bottom = Math.max(8, innerHeight - r.top + 6) + 'px'; document.body.appendChild(pop);
  });
  txt.addEventListener('blur', function () { setTimeout(close, 150); });

  // ── "Aa" button: bold / italic / strike / mono + fancy letters ──
  var MAPS = [['𝗕𝗼𝗹𝗱', 0x1D5D4, 0x1D5EE, 0x1D7EC], ['𝘐𝘵𝘢𝘭𝘪𝘤', 0x1D608, 0x1D622, 0], ['𝓢𝓬𝓻𝓲𝓹𝓽', 0x1D4D0, 0x1D4EA, 0], ['𝕲𝖔𝖙𝖍𝖎𝖈', 0x1D56C, 0x1D586, 0],
    ['𝙼𝚘𝚗𝚘', 0x1D670, 0x1D68A, 0x1D7F6], ['Ⓑⓤⓑⓑⓛⓔ', 0x24B6, 0x24D0, 0], ['Ｗｉｄｅ', 0xFF21, 0xFF41, 0xFF10]];
  function fancy(s, up, lo, dg) {
    return Array.from(s).map(function (ch) {
      var c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(up + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(lo + c - 97);
      if (dg && c >= 48 && c <= 57) return String.fromCodePoint(dg + c - 48);
      return ch;
    }).join('');
  }
  window.RICH.fancy = fancy;
  var att = document.getElementById('att');
  if (att && att.parentNode) {
    var fb = document.createElement('button'); fb.className = 'ib'; fb.id = 'fmt'; fb.type = 'button'; fb.setAttribute('aria-label', 'Text style'); fb.textContent = 'Aa'; fb.style.fontWeight = '700'; fb.style.fontSize = '15px';
    att.parentNode.insertBefore(fb, att);
    fb.onpointerdown = function (e) { e.preventDefault(); };
    fb.onclick = function () {
      var s = txt.selectionStart, e = txt.selectionEnd;
      var o = sheet('<h3 style="margin-bottom:4px">Text style ✨</h3><small style="color:var(--mut)">Select some text first, or just tap a style to start typing with it.</small>' +
        '<div class="rfx"><button data-w="*"><b>B</b></button><button data-w="_"><i>I</i></button><button data-w="~"><s>S</s></button><button data-w="`">{ }</button></div>' +
        '<div class="rfy">' + MAPS.map(function (m, i) { return '<button data-f="' + i + '">' + m[0] + '</button>'; }).join('') + '</div>');
      var put = function (v, a, b) { txt.value = v; txt.focus(); txt.setSelectionRange(a, b); txt.dispatchEvent(new Event('input')); };
      o.querySelectorAll('[data-w]').forEach(function (b) {
        b.onclick = function () {
          var w = b.dataset.w, v = txt.value; o.remove();
          if (s == e) put(v.slice(0, s) + w + w + v.slice(e), s + 1, s + 1);
          else put(v.slice(0, s) + w + v.slice(s, e) + w + v.slice(e), s + 1, e + 1);
        };
      });
      o.querySelectorAll('[data-f]').forEach(function (b) {
        b.onclick = function () {
          var m = MAPS[+b.dataset.f], v = txt.value; o.remove();
          if (!v.trim()) return toast('Type something first, then pick a style');
          var a = s == e ? 0 : s, z = s == e ? v.length : e, out = fancy(v.slice(a, z), m[1], m[2], m[3]);
          put(v.slice(0, a) + out + v.slice(z), a, a + out.length);
        };
      });
    };
  }
})();
