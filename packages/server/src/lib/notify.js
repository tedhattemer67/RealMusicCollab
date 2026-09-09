// ============================================================
// Outbound notification webhooks — Slack, Discord, or a generic JSON
// webhook. One-way only (post a message out, never read a reply back), no
// OAuth app to register or maintain. This is the only file that talks to a
// NotificationChannel's webhookUrl directly — same "one file owns the
// integration" precedent as storage.js.
// ============================================================

const prisma = require('../prisma');
const { assertPublicHttpUrl } = require('./ssrf');

// A project's own channels take over entirely once it has any — same
// override semantics as StorageConfig (a project-specific config replaces
// the instance default rather than adding to it). Falls back to the
// instance-wide (projectId: null) channels only when the project has none
// of its own.
async function getChannelsForProject(projectId) {
  if (projectId) {
    const projectChannels = await prisma.notificationChannel.findMany({ where: { projectId } });
    if (projectChannels.length > 0) return projectChannels;
  }
  return prisma.notificationChannel.findMany({ where: { projectId: null } });
}

function buildPayload(channel, message) {
  // Discord's incoming webhooks read "content"; Slack's read "text". A
  // generic webhook gets both plus the raw text again under a neutral key,
  // since we don't know what shape the receiving end actually expects.
  if (channel.type === 'DISCORD') {
    return { content: message };
  }
  return { text: message };
}

// Never throws — a bad or unreachable webhook must never take down the
// action that triggered it. Errors are logged, not surfaced to the caller.
async function postToChannel(channel, message) {
  try {
    // Re-checked at send time, not just at channel-creation time — the
    // hostname a channel points at can be repointed via DNS at any point
    // after it was saved. See lib/ssrf.js for what this rejects and why.
    try {
      await assertPublicHttpUrl(channel.webhookUrl);
    } catch (err) {
      console.error(`Refusing to post to notification channel ${channel.id}: ${err.message}`);
      return;
    }

    const res = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(channel, message)),
    });
    if (!res.ok) {
      console.error(
        `Notification channel ${channel.id} (${channel.label || channel.type}) responded with ${res.status}`
      );
    }
  } catch (err) {
    console.error(`Failed to post to notification channel ${channel.id} (${channel.label || channel.type}):`, err);
  }
}

// Also never throws, for the same reason. Every matching channel is
// notified independently, in parallel, so one bad webhook URL can't hold
// up or block the others.
async function notifyChannels(projectId, message) {
  try {
    const channels = await getChannelsForProject(projectId);
    await Promise.all(channels.map((channel) => postToChannel(channel, message)));
  } catch (err) {
    console.error('Failed to resolve notification channels:', err);
  }
}

module.exports = { notifyChannels, postToChannel };
