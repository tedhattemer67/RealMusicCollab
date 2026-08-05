const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');

const router = express.Router();

const VALID_ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

// POST /api/invites
// Creates a shareable invite link. No real auth yet — createdById is passed
// directly for now, same temporary simplification as the upload endpoint.
// body: { role, createdById, projectId? (optional -> instance-wide invite
//         if omitted), expiresInDays? (optional) }
router.post('/invites', async (req, res) => {
  try {
    const { role, createdById, projectId, expiresInDays } = req.body;

    if (!role || !createdById) {
      return res.status(400).json({ error: 'role and createdById are required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const invite = await prisma.invite.create({
      data: { role, createdById, projectId: projectId || null, expiresAt },
    });

    // redeemUrl is just a suggested shape for the frontend route —
    // nothing here actually serves that URL yet.
    res.status(201).json({ ...invite, redeemUrl: `/invite/${invite.token}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the invite.' });
  }
});

// GET /api/invites/:token
// Lets a signup page preview what an invite grants before asking for a
// name/password — "you've been invited as a Contributor to Midnight Drive."
router.get('/invites/:token', async (req, res) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
      include: { project: true },
    });

    if (!invite) return res.status(404).json({ error: 'This invite link is not valid.' });
    if (invite.usedAt) return res.status(410).json({ error: 'This invite has already been used.' });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This invite has expired.' });
    }

    res.json({
      role: invite.role,
      scope: invite.project ? 'project' : 'instance',
      projectName: invite.project ? invite.project.name : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong looking up the invite.' });
  }
});

// POST /api/invites/:token/redeem
// body: { name, email, password }
router.post('/invites/:token/redeem', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are all required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const invite = await prisma.invite.findUnique({ where: { token: req.params.token } });

    if (!invite) return res.status(404).json({ error: 'This invite link is not valid.' });
    if (invite.usedAt) return res.status(410).json({ error: 'This invite has already been used.' });
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This invite has expired.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Not handled yet: an existing user redeeming a second invite to join
      // another project. That merge needs real login to exist first, so
      // someone can prove they own that account — refusing cleanly for now
      // rather than silently doing something wrong.
      return res.status(409).json({
        error:
          'An account with this email already exists. Log in instead (not built yet) rather than signing up again.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      // A project-scoped invite still needs some baseline instanceRole,
      // since the three-tier cascade always falls back to it eventually.
      // VIEWER is the safe minimum — real access for this project comes
      // from the Membership row created below, not from this default.
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          instanceRole: invite.projectId ? 'VIEWER' : invite.role,
        },
      });

      if (invite.projectId) {
        await tx.membership.create({
          data: { userId: newUser.id, projectId: invite.projectId, role: invite.role },
        });
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedById: newUser.id },
      });

      return newUser;
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      instanceRole: user.instanceRole,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong redeeming the invite.' });
  }
});

module.exports = router;
