const { getEffectiveRole } = require('../lib/roles');

// requireRole(['ADMIN'], (req) => ({ projectId: req.body.projectId }))
// Must run after requireAuth (needs req.user already set). extractScope pulls
// whatever projectId/songId matters for this specific route out of params,
// query, or body — different routes will need this in different shapes.
//
// options.notFoundOnNoAccess: on a read route, a caller with NO grant at all
// for the scope (getEffectiveRole -> null: not a member, not an instance
// admin) gets 404 instead of 403, so they can't tell another band's resource
// even exists. A caller who IS a member but whose role is too low still gets
// a normal 403.
function requireRole(allowedRoles, extractScope, options = {}) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not logged in.' });
      }

      const scope = extractScope ? await extractScope(req) : {};
      const role = await getEffectiveRole(req.user.id, scope);

      if (role === null && options.notFoundOnNoAccess) {
        return res.status(404).json({ error: 'Not found.' });
      }

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
