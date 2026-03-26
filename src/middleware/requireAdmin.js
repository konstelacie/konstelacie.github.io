/**
 * Ensures the request has an active admin session. Otherwise redirects to login.
 */
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminLoggedIn === true) {
    return next();
  }
  const nextPath = req.originalUrl || '/admin/slots';
  res.redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
}

module.exports = { requireAdmin };
