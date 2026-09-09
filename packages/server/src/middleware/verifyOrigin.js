// Lightweight CSRF defense. Production cookies use sameSite:'none' (needed
// for a genuinely cross-origin deployed frontend/backend), which means the
// browser attaches them automatically to a cross-site request too — the
// exact mechanism a forged request relies on. That includes the multipart
// upload routes, which a plain auto-submitting cross-site <form> can hit
// even though it could never set a custom header or read the JSON
// response.
//
// The browser attaches an Origin header to every state-changing
// fetch/XHR/form submission, cross-site or not, so rejecting a mismatched
// one blocks the forgery without needing a token round-trip. A request
// with NO Origin header is let through: that's either a same-origin
// request an older engine chose not to label, or a non-browser API
// caller — and CSRF is specifically about a *browser* silently attaching
// credentials on someone else's behalf, so a missing Origin isn't the
// attack this guards against.
const { CLIENT_ORIGIN } = require('../constants');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function verifyOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (origin && origin !== CLIENT_ORIGIN) {
    return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
}

module.exports = verifyOrigin;
