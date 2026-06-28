function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Bu işlem için giriş yapmalısın.' });
  }
  next();
}

module.exports = { requireAuth };
