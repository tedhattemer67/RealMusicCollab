// Deliberately not a full RFC 5322 validator (those are notoriously more
// trouble than they're worth) — just enough to reject obviously-malformed
// input before it lands in the User.email column: something@something,
// no whitespace, at least one dot in the domain part.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email);
}

module.exports = { isValidEmail };
