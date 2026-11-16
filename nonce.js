// Strict script CSP: no 'unsafe-inline'. Every page gets a fresh random nonce; only <script> tags carrying it may run.
const crypto = require('crypto');
module.exports = (html, res) => {
  const n = crypto.randomBytes(16).toString('base64');
  const csp = String(res.get('Content-Security-Policy') || '');
  if (csp) res.set('Content-Security-Policy', csp.replace(/script-src 'self'/, `script-src 'self' 'nonce-${n}'`));
  return html.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${n}"`);
};
