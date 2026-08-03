const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'service-status-portal-secret';

function generateToken(admin) {
  return jwt.sign(
    {
      id: admin._id,
      username: admin.username,
      email: admin.email
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication token is required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

module.exports = {
  generateToken,
  requireAuth
};
