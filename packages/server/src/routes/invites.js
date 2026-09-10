const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { SESSION_COOKIE_NAME, SESSION_DURATION_MS, getSessionCookieOptions } = require('../constants');
const { generateSecureToken } = require('../lib/tokens');
const { authLimiter } = require('../middleware/rateLimit');
const { isValidEmail } = require('../lib/validation');

const router = express.Router();

const VALID_ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

const INVITE_TAKEN = Symbol('invite-already-used');
const ALREADY_HAS_ACCESS = Symbol('already-has-access');

// An already-logged-in visitor (valid session cookie) redeeming an invite is
// an existing user joining a second project (or, for a projectless invite,
// picking up instance-admin) — not a new signup. The session cookie already
// proves who they are, so no name/email/password is needed; just attach the
// grant to that account. Never throws for "no session" — returns null so the
// caller can fall back to the signup flow.
async function getSessionUser(req) {
  const sessionId = req.cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  return session.user;
}

// Rolls back (leaves the invite unused) on ALREADY_HAS_ACCESS so a no-op
// redeem doesn't burn a single-use invite that's still good for someone else.
async function redeemForExistingUser(user, invite) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { usedAt: new Date(), usedById: user.id },
    });
    if (claimed.count === 0) throw INVITE_TAKEN;

    if (invite.projectId) {
      const existingMembership = await tx.membership.findUnique({
        where: { userId_projectId: { userId: user.id, projectId: invite.projectId } },
      });
      if (existingMembership) throw ALREADY_HAS_ACCESS;

      await tx.membership.create({
        data: { userId: user.id, projectId: invite.projectId, role: invite.role },
      });
    } else {
      if (user.instanceRole === 'ADMIN') throw ALREADY_HAS_ACCESS;
      await tx.user.update({ where: { id: user.id }, data: { instanceRole: 'ADMIN' } });
    }
  });
}

// POST /api/invites — instance-ADMIN only, same as project membership
// management: with per-project isolation the instance operator decides who
// gets into which project.
//   - Give a projectId to invite someone straight onto that project at `role`
//     (a Membership is created on redeem).
//   - Omit projectId only to mint another instance administrator — role must
//     then be ADMIN. A non-ADMIN instance-wide invite would grant nothing.
// body: { role, projectId?, expiresInDays? }
router.post(
  '/invites',
  requireAuth,
  requireRole(['ADMIN'], () => ({})),
  async (req, res) => {
    try {
      const { role, projectId, expiresInDays } = req.body;
      const createdById = req.user.id;

      if (!role) {
        return res.status(400).json({ error: 'role is required.' });
      }
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }

      if (projectId) {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
          return res.status(404).json({ error: `No project found with id ${projectId}.` });
        }
      } else if (role !== 'ADMIN') {
        return res.status(400).json({
          error:
            'An invite with no project must be role ADMIN (it creates an instance administrator). Give a projectId to invite someone onto a project.',
        });
      }

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const invite = await prisma.invite.create({
        data: { token: generateSecureToken(), role, createdById, projectId: projectId || null, expiresAt },
      });

      // redeemUrl is just a suggested shape for the frontend route —
      // nothing here actually serves that URL yet.
      res.status(201).json({ ...invite, redeemUrl: `/invite/${invite.token}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong creating the invite.' });
    }
  }
);

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
router.post('/invites/:token/redeem', authLimiter, async (req, res) => {
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

    const sessionUser = await getSessionUser(req);
    if (sessionUser) {
      try {
        await redeemForExistingUser(sessionUser, invite);
      } catch (e) {
        if (e === INVITE_TAKEN) {
          return res.status(410).json({ error: 'This invite has already been used.' });
        }
        if (e === ALREADY_HAS_ACCESS) {
          return res.status(409).json({
            error: invite.projectId
              ? `You're already a member of "${invite.project.name}".`
              : 'Your account is already an instance administrator.',
          });
        }
        throw e;
      }

      return res.status(200).json({
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        instanceRole: invite.projectId ? sessionUser.instanceRole : 'ADMIN',
        joinedProjectId: invite.projectId || null,
      });
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are all required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'That email address does not look valid.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // A real account with this email exists but isn't the one making this
      // request (no session cookie, or it didn't check out) — send them to
      // log in first, then reopen this same invite link so the branch above
      // can attach it to that account instead of trying to create a new one.
      return res.status(409).json({
        accountExists: true,
        error: 'An account with this email already exists. Log in, then open this invite link again to join.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        // Claim the invite first, conditionally on it still being unused, so
        // two redeems racing on the same token can't both create an account.
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count === 0) throw INVITE_TAKEN;

        // A project-scoped invite still needs some baseline instanceRole (the
        // column is required); it's inert under per-project access control —
        // real access comes from the Membership created below. VIEWER is the
        // safe minimum. An invite with no project is an instance-admin invite.
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
          data: { usedById: newUser.id },
        });

        return newUser;
      });
    } catch (e) {
      if (e === INVITE_TAKEN) {
        return res.status(410).json({ error: 'This invite has already been used.' });
      }
      // The findUnique(email) check above has its own, smaller gap: two
      // different invites redeemed for the same email at nearly the same
      // moment could both pass it and then collide on the DB's unique
      // email constraint here. Same friendly response as catching it
      // up front, instead of a raw 500.
      if (e && e.code === 'P2002') {
        return res.status(409).json({
          accountExists: true,
          error: 'An account with this email already exists. Log in, then open this invite link again to join.',
        });
      }
      throw e;
    }

    // Redeeming an invite should log you straight in, not dump you at a
    // login screen right after signing up — same session-creation logic
    // as the real login route, using the same shared constants.
    const session = await prisma.session.create({
      data: {
        id: generateSecureToken(),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });
    res.cookie(SESSION_COOKIE_NAME, session.id, getSessionCookieOptions());

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
