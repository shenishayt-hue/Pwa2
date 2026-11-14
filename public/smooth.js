// LYNKO CHAT — smoothness on every phone: light mode for weak devices, keyboard handling, small input fixes.
(function () {
  const d = document.documentElement;
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4, c = navigator.connection || {};
  if (mem <= 2 || (cores <= 4 && mem <= 3) || c.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) d.classList.add('lite');
  const st = document.createElement('style');
  st.textContent = '.lite *,.lite *::before,.lite *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.lite .bh{display:none!important}'
    + 'input,textarea,select{font-size:max(16px,1em)}'      // iOS/Android never zoom into a field
    + '.msgs{overflow-anchor:auto;-webkit-overflow-scrolling:touch}';
  document.head.appendChild(st);

  const box = () => document.getElementById('msgs'), txt = () => document.getElementById('txt');
  let near = true;
  const watch = () => { const b = box(); if (!b || b._w) return; b._w = 1; b.addEventListener('scroll', () => { near = b.scrollHeight - b.scrollTop - b.clientHeight < 160 }, { passive: true }) };
  watch();

  // keyboard opens / closes: keep the newest message right above the typing box (only if you were already at the bottom)
  const vv = window.visualViewport; let last = vv ? vv.height : innerHeight, raf = 0;
  const stick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const b = box(); if (b && !b.hidden && near) b.scrollTop = b.scrollHeight }) };
  if (vv) vv.addEventListener('resize', () => { watch(); if (Math.abs(vv.height - last) > 60) stick(); last = vv.height });
  document.addEventListener('focusin', e => { if (e.target === txt()) { watch(); setTimeout(stick, 120); setTimeout(stick, 350) } });
  document.addEventListener('focusout', e => { if (e.target === txt()) setTimeout(() => { scrollTo(0, 0) }, 60) });

  // the typing box: sensible mobile keyboard
  const t = txt(); if (t) { t.setAttribute('autocomplete', 'off'); t.setAttribute('autocorrect', 'on'); t.setAttribute('autocapitalize', 'sentences'); t.setAttribute('inputmode', 'text') }

  // buttons feel instant (no 300 ms wait, no accidental text selection)
  document.addEventListener('touchstart', () => {}, { passive: true });
})();
