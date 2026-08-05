const prisma = require('../prisma');

// Walks the three-tier cascade, narrowest wins:
//   SongRoleOverride (this song only) > Membership (this project only) > instanceRole (everywhere)
// Pass whichever scope is relevant to the action being checked — a song-level
// action should pass songId (projectId gets resolved from it automatically
// if not also given); a project-level action passes projectId; an
// instance-wide action (like creating an instance-wide invite) passes neither,
// which falls straight through to instanceRole.
async function getEffectiveRole(userId, { projectId, songId } = {}) {
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { instanceRole: true },
  });
  return user ? user.instanceRole : null;
}

module.exports = { getEffectiveRole };
