// Blocks outbound webhook requests from reaching internal/private
// infrastructure (localhost, RFC1918 ranges, link-local — which also
// covers the 169.254.169.254 cloud metadata endpoint — etc). Checked both
// when a NotificationChannel's webhookUrl is saved (routes/
// notificationChannels.js) and again immediately before every send
// (lib/notify.js), since the hostname a channel points at can be
// repointed via DNS at any point after creation.
//
// Allow-list, not a block-list: ipaddr.js's range() only returns
// 'unicast' for a normal, globally-routable address, so anything odd
// (IPv4-mapped IPv6, 6to4/Teredo tunneling, reserved/benchmarking blocks,
// etc — the kind of thing a hand-rolled CIDR blocklist tends to miss) is
// rejected by default instead of needing its own explicit rule.
//
// Known limitation: like most SSRF guards built on plain fetch(), the
// underlying HTTP client re-resolves DNS a second time when it actually
// connects, so a sufficiently active DNS-rebinding attacker (repointing
// the hostname between this check and the connection) isn't fully closed
// off. Channels can only be created by project ADMINs — a role already
// broadly trusted in this app — so that residual gap isn't worth a
// custom pinned-IP HTTP client here.
const dns = require('dns').promises;
const ipaddr = require('ipaddr.js');

function isDisallowedAddress(address) {
  try {
    return ipaddr.parse(address).range() !== 'unicast';
  } catch {
    return true;
  }
}

// Throws with a user-facing message on rejection; resolves with nothing on
// success.
async function assertPublicHttpUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('Not a valid URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must be http or https.');
  }

  const hostname = parsed.hostname;

  // A bare IP literal — check it directly, no DNS involved.
  if (ipaddr.isValid(hostname)) {
    if (isDisallowedAddress(hostname)) {
      throw new Error('That URL resolves to a private or internal address.');
    }
    return;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve that URL's host.");
  }
  if (records.length === 0 || records.some((r) => isDisallowedAddress(r.address))) {
    throw new Error('That URL resolves to a private or internal address.');
  }
}

module.exports = { assertPublicHttpUrl };
