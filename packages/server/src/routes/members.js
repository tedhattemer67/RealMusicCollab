const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { recordEvent } = require('../lib/events');

const router = express.Router();

const VALID_ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

// Managing who is on a project — and at what role — is instance-ADMIN only,
// per the access model: the person who spins up a project is also the one
// who decides who gets into it. An empty scope means only an instance admin
// clears requireRole.
const instanceAdminOnly = requireRole(['ADMIN'], () => ({}));

// GET /api/projects/:projectId/members — the project's roster.
router.get('/projects/:projectId/members', requireAuth, instanceAdminOnly, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    if (!project) {
      return res.status(404).json({ error: `No project found with id ${req.params.projectId}.` });
    }
    const memberships = await prisma.membership.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true, active: true } } },
    });
    res.json(
      memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        active: m.user.active,
        role: m.role,
        since: m.createdAt,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching project members.' });
  }
});

// POST /api/projects/:projectId/members  body: { userId, role }
router.post('/projects/:projectId/members', requireAuth, instanceAdminOnly, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ error: 'userId and role are both required.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const [project, user] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!project) return res.status(404).json({ error: `No project found with id ${projectId}.` });
    if (!user) return res.status(404).json({ error: `No user found with id ${userId}.` });

    const existing = await prisma.membership.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (existing) {
      return res.status(409).json({
        error: 'That user is already a member of this project — change their role instead.',
      });
    }

    const membership = await prisma.membership.create({ data: { userId, projectId, role } });

    await recordEvent({
      action: 'MEMBER_ADDED',
      actorId: req.user.id,
      entityType: 'Project',
      entityId: projectId,
      projectId,
      metadata: { userId, role },
      message: `${req.user.name} added ${user.name} to "${project.name}" as ${role}.`,
    });

    res.status(201).json({ userId, name: user.name, email: user.email, role: membership.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adding the member.' });
  }
});

// PATCH /api/projects/:projectId/members/:userId  body: { role }
router.patch(
  '/projects/:projectId/members/:userId',
  requireAuth,
  instanceAdminOnly,
  async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      const { role } = req.body;

      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }

      const existing = await prisma.membership.findUnique({
        where: { userId_projectId: { userId, projectId } },
        include: { user: { select: { name: true } }, project: { select: { name: true } } },
      });
      if (!existing) {
        return res.status(404).json({ error: 'That user is not a member of this project.' });
      }

      const updated = await prisma.membership.update({
        where: { userId_projectId: { userId, projectId } },
        data: { role },
      });

      await recordEvent({
        action: 'MEMBER_ROLE_CHANGED',
        actorId: req.user.id,
        entityType: 'Project',
        entityId: projectId,
        projectId,
        metadata: { userId, from: existing.role, to: role },
        message: `${req.user.name} changed ${existing.user.name}'s role on "${existing.project.name}" from ${existing.role} to ${role}.`,
      });

      res.json({ userId, role: updated.role });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong updating the member role.' });
    }
  }
);

// DELETE /api/projects/:projectId/members/:userId — revoke access.
router.delete(
  '/projects/:projectId/members/:userId',
  requireAuth,
  instanceAdminOnly,
  async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      const existing = await prisma.membership.findUnique({
        where: { userId_projectId: { userId, projectId } },
        include: { user: { select: { name: true } }, project: { select: { name: true } } },
      });
      if (!existing) {
        return res.status(404).json({ error: 'That user is not a member of this project.' });
      }

      await prisma.membership.delete({
        where: { userId_projectId: { userId, projectId } },
      });

      await recordEvent({
        action: 'MEMBER_REMOVED',
        actorId: req.user.id,
        entityType: 'Project',
        entityId: projectId,
        projectId,
        metadata: { userId },
        message: `${req.user.name} removed ${existing.user.name} from "${existing.project.name}".`,
      });

      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong removing the member.' });
    }
  }
);

module.exports = router;
