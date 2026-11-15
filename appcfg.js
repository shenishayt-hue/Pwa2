// App appearance set from the admin dashboard: default theme, "force for everyone", and the app logo.
// Stored in the `settings` collection (_id 'app'). The logo also feeds the PWA icons (icons.js) and the Lynko Official avatar.
const icons = require('./icons');
const THEMES = ['love', 'wa', 'liquid'];
const state = { theme: 'love', force: false, logoV: 0 };
let logo = null, sharp = null; try { sharp = require('sharp'); } catch {}

const pub = () => ({ theme: state.theme, force: state.force, logoV: state.logoV, logo: !!logo });
const type = b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
  : b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
  : b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : '';

async function load(C) {
  C.G = C.db.collection('settings');
  const d = await C.G.findOne({ _id: 'app' }).catch(() => null);
  if (!d) return;
  if (THEMES.includes(d.theme)) state.theme = d.theme;
  state.force = !!d.force; state.logoV = d.logoV || 0;
  if (d.logo) { logo = { buf: Buffer.from(d.logo.buffer || d.logo), mime: d.logoMime || 'image/png' }; icons.setLogo(logo.buf); }
}
async function setTheme(C, theme, force) {
  if (!THEMES.includes(theme)) throw new Error('Unknown theme');
  state.theme = theme; state.force = !!force;
  await C.G.updateOne({ _id: 'app' }, { $set: { theme, force: state.force } }, { upsert: true });
  return pub();
}
async function setLogo(C, raw) {
  if (!Buffer.isBuffer(raw) || !raw.length) throw new Error('No image received');
  if (raw.length > 2 * 1024 * 1024) throw new Error('Image is too large (max 2 MB)');
  let mime = type(raw); if (!mime) throw new Error('Use a PNG, JPG or WebP image');
  let buf = raw;
  if (sharp) { try { buf = await sharp(raw).resize(512, 512, { fit: 'cover' }).png().toBuffer(); mime = 'image/png'; } catch { throw new Error('That image could not be read'); } }
  state.logoV = Date.now(); logo = { buf, mime };
  await C.G.updateOne({ _id: 'app' }, { $set: { logo: buf, logoMime: mime, logoV: state.logoV } }, { upsert: true });
  icons.setLogo(buf);
  return pub();
}
async function clearLogo(C) {
  logo = null; state.logoV = Date.now();
  await C.G.updateOne({ _id: 'app' }, { $unset: { logo: 1, logoMime: 1 }, $set: { logoV: state.logoV } }, { upsert: true });
  icons.setLogo(null);
  return pub();
}
module.exports = { THEMES, pub, load, setTheme, setLogo, clearLogo, logo: () => logo, state };
