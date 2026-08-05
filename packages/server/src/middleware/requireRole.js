const { getEffectiveRole } = require('../lib/roles');

// requireRole(['ADMIN'], (req) => ({ projectId: req.body.projectId }))
// Must run after requireAuth (needs req.user already set). extractScope pulls
// whatever projectId/songId matters for this specific route out of params,
// query, or body — different routes will need this in different shapes.
function requireRole(allowedRoles, extractScope) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not logged in.' });
      }

      const scope = extractScope ? await extractScope(req) : {};
      const role = await getEffectiveRole(req.user.id, scope);

      if (!allowedRoles.includes(role)) {
        return res
          .status(403)
          .json({ error: `This action requires one of: ${allowedRoles.join(', ')}.` });
      }

      req.effectiveRole = role;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong checking permissions.' });
    }
  };
}

module.exports = requireRole;
