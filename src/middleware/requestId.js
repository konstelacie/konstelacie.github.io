const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  req.id = req.get('X-Request-Id') || crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = requestIdMiddleware;
