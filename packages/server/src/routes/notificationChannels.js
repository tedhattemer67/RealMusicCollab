const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { postToChannel } = require('../lib/notify');
const { assertPublicHttpUrl } = require('../lib/ssrf');

const router = express.Router();

const CHANNEL_TYPES = ['SLACK', 'DISCORD', 'GENERIC_WEBHOOK'];

// Resolves scope for a route identified by :channelId rather than
// :projectId — same "look the row up to find its scope" pattern as
// resolveSongIdForTake/resolveSongIdForMix elsewhere. A channel with
// projectId null resolves to no scope, which requireRole then checks
// against the instance-wide role, same as everywhere else in the cascade.
async function resolveProjectIdForChannel(req) {
  const channel = await prisma.notificationChannel.findUnique({
    where: { id: req.params.channelId },
    select: { projectId: true },
  });
  return { projectId: channel ? channel.projectId : undefined };
}

// GET /api/projects/:projectId/notification-channels — this project's own
// channels only. It says nothing about which instance-wide channels would
// actually fire for this project (see lib/notify.js for that override
// resolution) — those aren't manageable from this project-scoped route.
router.get(
  '/projects/:projectId/notification-channels',
  requireAuth,
  requireRole(['ADMIN'], (req) => ({ projectId: req.params.projectId })),
  async (req, res) => {
    try {
      const channels = await prisma.notificationChannel.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: 'asc' },
      });
      res.json(channels);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong fetching notification channels.' });
    }
  }
);

// POST /api/projects/:projectId/notification-channels
// body: { type, webhookUrl, label? }
router.post(
  '/projects/:projectId/notification-channels',
  requireAuth,
  requireRole(['ADMIN'], (req) => ({ projectId: req.params.projectId })),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const { type, webhookUrl, label } = req.body;

      if (!CHANNEL_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${CHANNEL_TYPES.join(', ')}` });
      }
      if (!webhookUrl || !/^https?:\/\//.test(webhookUrl)) {
        return res.status(400).json({ error: 'webhookUrl must be a valid http(s) URL.' });
      }
      try {
        await assertPublicHttpUrl(webhookUrl);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }

      const channel = await prisma.notificationChannel.create({
        data: { projectId, type, webhookUrl, label: label || null },
      });
      res.status(201).json(channel);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong creating the notification channel.' });
    }
  }
);

// DELETE /api/notification-channels/:channelId
router.delete(
  '/notification-channels/:channelId',
  requireAuth,
  requireRole(['ADMIN'], resolveProjectIdForChannel),
  async (req, res) => {
    try {
      const { channelId } = req.params;
      const existing = await prisma.notificationChannel.findUnique({ where: { id: channelId } });
      if (!existing) {
        return res.status(404).json({ error: `No notification channel found with id ${channelId}.` });
      }
      await prisma.notificationChannel.delete({ where: { id: channelId } });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong deleting the notification channel.' });
    }
  }
);

// POST /api/notification-channels/:channelId/test — sends a one-off message
// so an admin can confirm a webhook URL actually works before trusting it.
router.post(
  '/notification-channels/:channelId/test',
  requireAuth,
  requireRole(['ADMIN'], resolveProjectIdForChannel),
  async (req, res) => {
    try {
      const { channelId } = req.params;
      const channel = await prisma.notificationChannel.findUnique({ where: { id: channelId } });
      if (!channel) {
        return res.status(404).json({ error: `No notification channel found with id ${channelId}.` });
      }
      await postToChannel(channel, `🎵 Test notification from RealMusicCollab — sent by ${req.user.name}.`);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong sending the test notification.' });
    }
  }
);

module.exports = router;
