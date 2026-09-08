const prisma = require('../prisma');

// Resolves the Role a user effectively has for a given scope, or null if they
// have no access there at all.
//
// Access model (per-project isolation — one instance can host unrelated bands):
//   - Instance ADMIN is the instance operator: unconditional ADMIN everywhere,
//     no membership needed. This is the only role that means anything on its own.
//   - Everyone else gets access ONLY through a grant for the specific scope:
//       SongRoleOverride (this song only)  >  Membership (this project only)
//     A plain non-ADMIN instanceRole is NOT a grant — it's just the default
//     role a project invite assigns. No grant for the scope => null.
//
// Pass whichever scope the action touches: a song-level action passes songId
// (projectId is derived from it); a project-level action passes projectId; a
// genuinely instance-wide action passes neither, so only instance ADMIN clears it.
async function getEffectiveRole(userId, { projectId, songId } = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { instanceRole: true },
  });
  if (!user) return null;

  // Instance operator — bypasses every membership check, by design.
  if (user.instanceRole === 'ADMIN') return 'ADMIN';

  // Narrowest grant wins: a per-song override beats a per-project membership.
  if (songId) {
    const override = await prisma.songRoleOverride.findUnique({
      where: { userId_songId: { userId, songId } },
    });
    if (override) return override.role;
  }

  let resolvedProjectId = projectId;
  if (!resolvedProjectId && songId) {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { projectId: true },
    });
    if (song) resolvedProjectId = song.projectId;
  }

  if (resolvedProjectId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_projectId: { userId, projectId: resolvedProjectId } },
    });
    if (membership) return membership.role;
  }

  // No override, no membership, not an instance admin — no access to this scope.
  return null;
}

// True when the user can see/act on the project at all (any role). Handy for
// route handlers that want to choose 404 (hide existence from non-members) vs
// 403 (member, but role too low) themselves.
async function hasProjectAccess(userId, { projectId, songId } = {}) {
  const role = await getEffectiveRole(userId, { projectId, songId });
  return role !== null;
}

// Every role — i.e. "any member of the project." Read routes and comment/
// unfreeze-request routes (which Viewers are explicitly allowed to use) pass
// this to requireRole.
const MEMBER_ROLES = ['ADMIN', 'CONTRIBUTOR', 'REVIEWER', 'VIEWER'];

module.exports = { getEffectiveRole, hasProjectAccess, MEMBER_ROLES };
