
// ======================================================
// LYNKO CHAT — PREMIUM 3D ANIMATED EMOJI STUDIO
// Neon Love Edition | Mobile Optimized
// ======================================================

(function () {
  const CATS = {
    '🕘': null,

    '🥰': '😀 😃 😄 😁 😆 🥹 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤗 🤭 🫢 🤫 🤔 🫡 😏 😒 🙄 😬 😮‍💨 😴 🤤 😪 😵‍💫 🥴 🤒 🤕 🥳 🥸 😎 🤓 🥺 😢 😭 😤 😡 😱 😨 😰 🫠 🫣',

    '💖': '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ 💔 ❤️‍🔥 💌 💋 🫶 💐 🌹 🌷 🌸 🌺 🌼 🪷 💫 ✨ ⭐ 🌟 🎀',

    '🧸': '🧸 🎀 🍓 🍒 🍑 🍭 🍬 🍰 🧁 🎂 🍩 🍪 🍫 🍦 🧋 🍼 🌈 ☁️ 🌙 ☀️ ⛅ 🫧 🎈 🎁 🎉 🎊 🪩 🪄 🔮 🧿 🩷 🩵 🩶 🛍️ 👑 💎 💍 👛 🩰 🪞 🕊️ 🦢',

    '🐰': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦉 🦋 🐝 🐞 🐢 🐙 🦄 🐬 🐳 🐠 🦭 🦦 🦥 🐿️ 🦔',

    '👍': '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 🤲 🙏 🤝 💅 💪 🫂 👀 🧠 🫦',

    '🍕': '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🍜 🍝 🍣 🍙 🍚 🍡 🍦 🍩 🍪 ☕ 🧃 🥤 🍹',

    '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🎮 🎧 🎤 🎵 🎶 🎬 📸 📱 💻 🚗 ✈️ 🏖️ 🏝️ 🌍 🎂 🔥 💯 ✅ ❌ ⚡ 💥 💤 💢 💬 💭',

    '🌌': '🌌 🌙 ⭐ 🌟 ✨ 💫 ☄️ 🌈 🌠 🪐 🌍 🌎 🌏 🌊 🔥 ❄️ ☀️ 🌤️ 🌧️ ⛈️ 🌪️ 🌫️ 🌺 🪷 🦋',

    '👑': '👑 💎 💍 💅 👜 👛 🕶️ 👗 👠 👟 🥻 🪞 🎀 🩷 🩵 💜 ✨ 🪄 🦢 🕊️'
  };

  const STORAGE = 'lk_emo';

  const rec = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) || '[]');
    } catch {
      return [];
    }
  };

  const push = e => {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify([
          e,
          ...rec().filter(x => x !== e)
        ].slice(0, 30))
      );
    } catch {}
  };

  function init() {
    const pill = document.querySelector('.pill');
    const txt = document.getElementById('txt');
    const comp = document.getElementById('comp');

    if (!pill || !txt || !comp ||
        document.getElementById('emoBtn')) return;

    // =========================
    // PREMIUM 3D DESIGN
    // =========================

    const style = document.createElement('style');

    style.textContent = `
      #emoBtn {
        width: 43px;
        height: 46px;
        flex: none;
        border: 0;
        background: transparent;
        color: #ff83c5;
        font-size: 25px;
        cursor: pointer;
        transition: .3s;
        filter: drop-shadow(0 0 7px #ff42b5);
      }

      #emoBtn:hover {
        transform: scale(1.2) rotate(-10deg);
      }

      #emoBtn.active {
        transform: rotate(20deg) scale(1.15);
        color: #8b7cff;
      }

      #emoP {
        position: relative;
        flex: none;
        margin: 8px 10px 0;
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid rgba(255,130,210,.3);
        background:
          radial-gradient(circle at 10% 0%,
          rgba(255,50,160,.2), transparent 45%),
          radial-gradient(circle at 100% 100%,
          rgba(100,70,255,.2), transparent 45%),
          rgba(12,8,27,.97);
        box-shadow:
          0 12px 40px rgba(0,0,0,.5),
          0 0 20px rgba(255,50,170,.12),
          inset 0 1px 1px rgba(255,255,255,.12);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        transform-origin: bottom;
        animation: emoOpen .35s cubic-bezier(.2,1.5,.4,1);
      }

      #emoP[hidden] {
        display: none;
      }

      @keyframes emoOpen {
        from {
          opacity: 0;
          transform: translateY(18px) scale(.92);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      #emoHead {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px 5px;
      }

      #emoHead strong {
        font-size: 13px;
        letter-spacing: 1.5px;
        color: #ffb3e1;
      }

      #emoHead span {
        font-size: 10px;
        color: #a89abf;
      }

      #emoT {
        display: flex;
        gap: 5px;
        padding: 9px 10px 10px;
        overflow-x: auto;
        scrollbar-width: none;
      }

      #emoT::-webkit-scrollbar {
        display: none;
      }

      #emoT button {
        flex: none;
        width: 39px;
        height: 39px;
        border-radius: 13px;
        border: 1px solid transparent;
        background: rgba(255,255,255,.045);
        font-size: 21px;
        cursor: pointer;
        transition: .25s;
      }

      #emoT button.on {
        background: linear-gradient(
          135deg,
          rgba(255,65,165,.35),
          rgba(115,75,255,.35)
        );
        border-color: rgba(255,125,220,.55);
        box-shadow: 0 0 14px rgba(255,70,190,.3);
        transform: translateY(-3px);
      }

      #emoT button:active {
        transform: scale(.82);
      }

      #emoG {
        display: grid;
        grid-template-columns: repeat(8,minmax(0,1fr));
        gap: 5px;
        padding: 9px 10px 14px;
        height: 214px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        scrollbar-color: #a54dba transparent;
      }

      #emoG button {
        position: relative;
        min-width: 0;
        aspect-ratio: 1;
        border: 1px solid transparent;
        border-radius: 13px;
        background: rgba(255,255,255,.035);
        font-size: clamp(22px, 7vw, 29px);
        line-height: 1;
        cursor: pointer;

        transform-style: preserve-3d;
        perspective: 300px;

        text-shadow:
          0 3px 1px rgba(0,0,0,.3),
          0 6px 8px rgba(0,0,0,.35);

        filter: drop-shadow(0 3px 3px rgba(0,0,0,.25));

        transition:
          transform .22s cubic-bezier(.2,1.5,.4,1),
          background .2s,
          box-shadow .2s;
        animation: emojiAppear .35s both;
      }

      @keyframes emojiAppear {
        from {
          opacity: 0;
          transform: translateY(12px) scale(.6);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      #emoG button:hover {
        background: rgba(255,90,190,.14);
        border-color: rgba(255,140,225,.25);
        transform: translateY(-5px) scale(1.15)
                   rotateX(12deg);
        box-shadow:
          0 7px 15px rgba(0,0,0,.3),
          0 0 13px rgba(255,75,190,.22);
      }

      #emoG button:active {
        transform: scale(.75) rotate(-10deg);
        background: rgba(255,80,180,.3);
      }

      #emoG p {
        grid-column: 1/-1;
        text-align: center;
        color: #d6a6ba;
        font-size: 13px;
        margin-top: 65px;
      }

      #emoFoot {
        display: flex;
        justify-content: center;
        padding: 7px;
        border-top: 1px solid rgba(255,255,255,.07);
        color: #9f8da9;
        font-size: 10px;
        letter-spacing: 1px;
      }

      @media (max-width: 360px) {
        #emoG {
          grid-template-columns: repeat(7,minmax(0,1fr));
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #emoP, #emoG button {
          animation: none !important;
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);

    // =========================
    // EMOJI BUTTON
    // =========================

    const b = document.createElement('button');

    b.id = 'emoBtn';
    b.type = 'button';
    b.innerHTML = `
      <span aria-hidden="true">✨</span>
    `;

    b.setAttribute('aria-label', 'Open emoji studio');
    b.setAttribute('aria-expanded', 'false');

    pill.insertBefore(b, txt);

    // =========================
    // EMOJI PANEL
    // =========================

    const p = document.createElement('div');

    p.id = 'emoP';
    p.hidden = true;

    p.innerHTML = `
      <div id="emoHead">
        <strong>✦ EMOJI STUDIO</strong>
        <span>3D COLLECTION</span>
      </div>

      <div id="emoT"></div>

      <div id="emoG"></div>

      <div id="emoFoot">
        LYNKO CHAT · EXPRESS YOURSELF ✨
      </div>
    `;

    comp.parentNode.insertBefore(p, comp);

    const T = p.querySelector('#emoT');
    const G = p.querySelector('#emoG');

    let cur = '🥰';

    // =========================
    // RENDER EMOJIS
    // =========================

    const draw = k => {
      cur = k;

      [...T.children].forEach(x => {
        x.classList.toggle('on', x.dataset.k === k);
      });

      const list = k === '🕘'
        ? rec()
        : (CATS[k] || '').split(' ').filter(Boolean);

      G.innerHTML = '';

      if (!list.length) {
        G.innerHTML = '<p>No recent emojis yet 🕘</p>';
        return;
      }

      list.forEach((e, i) => {
        const x = document.createElement('button');

        x.type = 'button';
        x.textContent = e;
        x.setAttribute('aria-label', e);

        x.style.animationDelay = `${Math.min(i * 12, 180)}ms`;

        G.appendChild(x);
      });

      G.scrollTop = 0;
    };

    // =========================
    // CATEGORY BUTTONS
    // =========================

    Object.keys(CATS).forEach(k => {
      const x = document.createElement('button');

      x.type = 'button';
      x.dataset.k = k;
      x.textContent = k;

      x.setAttribute('aria-label',
        k === '🕘' ? 'Recent emojis' : 'Emoji category ' + k
      );

      T.appendChild(x);
    });

    T.onclick = e => {
      const x = e.target.closest('button');

      if (x) draw(x.dataset.k);
    };

    // =========================
    // INSERT EMOJI INTO CHAT
    // =========================

    G.onclick = e => {
      const x = e.target.closest('button');

      if (!x) return;

      const emoji = x.textContent;

      const s = txt.selectionStart == null
        ? txt.value.length
        : txt.selectionStart;

      const en = txt.selectionEnd == null
        ? s
        : txt.selectionEnd;

      txt.value =
        txt.value.slice(0, s) +
        emoji +
        txt.value.slice(en);

      txt.selectionStart =
      txt.selectionEnd = s + emoji.length;

      txt.dispatchEvent(
        new Event('input', { bubbles: true })
      );

      push(emoji);

      // Keep keyboard focus on message input
      txt.focus();

      // Refresh recent category
      if (cur === '🕘') draw('🕘');
    };

    // =========================
    // OPEN / CLOSE
    // =========================

    b.onmousedown = e => e.preventDefault();

    b.onclick = () => {
      p.hidden = !p.hidden;

      b.classList.toggle('active', !p.hidden);

      b.setAttribute(
        'aria-expanded',
        String(!p.hidden)
      );

      if (!p.hidden) {
        draw(rec().length ? '🕘' : cur);
      }
    };

    txt.addEventListener('focus', () => {
      p.hidden = true;
      b.classList.remove('active');
      b.setAttribute('aria-expanded', 'false');
    });

    // Close with Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !p.hidden) {
        p.hidden = true;
        b.classList.remove('active');
        b.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 300);
  }

})();
