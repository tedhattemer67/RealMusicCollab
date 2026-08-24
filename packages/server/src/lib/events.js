const prisma = require('../prisma');
const { notifyChannels } = require('./notify');

// The single seam between "something happened" and "something got logged
// and (optionally) posted to a notification channel." Every route that used
// to call prisma.auditLog.create directly now calls this instead, so a
// future new event type gets notified for free — same reason AuditLog's
// (entityType, entityId) pair is polymorphic rather than a fixed set of
// columns: a new kind of event shouldn't need a migration, and now it
// shouldn't need a second call site either.
//
// message is the human-readable line posted to Slack/Discord/etc, built by
// the caller (not rebuilt here) — the caller already has every name/title
// it needs loaded for its own response, so re-fetching them here would
// just be a duplicate query. Pass no message to log an event without
// notifying anyone (kept available for future silent/internal events).
async function recordEvent({ action, actorId, entityType, entityId, projectId, metadata, message }) {
  const entry = await prisma.auditLog.create({
    data: { action, actorId, entityType, entityId, metadata },
  });

  if (message) {
    // Deliberately not awaited — a slow or failing webhook must never delay
    // the response for the action that triggered it. notifyChannels never
    // throws, but this catch is cheap insurance against that changing later.
    notifyChannels(projectId, message).catch((err) => {
      console.error('Notification dispatch failed:', err);
    });
  }

  return entry;
}

module.exports = { recordEvent };
