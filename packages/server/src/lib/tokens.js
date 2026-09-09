// Bearer secrets (session ids, invite tokens) need to be unguessable, not
// just unique — cuid (Prisma's schema-level @default) is optimized for the
// latter, not the former. This is the one place that generates them.
const crypto = require('crypto');

function generateSecureToken() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = { generateSecureToken };
