const bcrypt = require('bcryptjs');
const crypto = require('crypto');

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  // If it is an AJAX request, return 401
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  res.redirect('/login');
}

function csrfProtection(req, res, next) {
  // Generate CSRF token if not exists in session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  
  // Make token available to templates
  res.locals.csrfToken = req.session.csrfToken;
  
  // Ignore CSRF check for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  // Check CSRF token from body, query parameters, or request headers
  const clientToken = req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  if (!clientToken || clientToken !== req.session.csrfToken) {
    console.warn(`CSRF validation failed for path: ${req.path}`);
    return res.status(403).send('Forbidden: CSRF validation failed.');
  }
  
  next();
}

async function verifyRecaptcha(token, remoteIp) {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.log('reCAPTCHA secret key is not set. Bypassing verification (Mock Approval).');
    return true;
  }

  if (!token) {
    console.warn('reCAPTCHA token is missing.');
    return false;
  }

  try {
    const url = 'https://www.google.com/recaptcha/api/siteverify';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: remoteIp || ''
      })
    });
    
    const data = await response.json();
    console.log('reCAPTCHA validation response:', data);
    
    if (data.success && data.score >= 0.7) {
      return true;
    }
    
    console.warn(`reCAPTCHA validation failed. Score: ${data.score || 0}, Success: ${data.success}`);
    return false;
  } catch (error) {
    console.error('Error validating reCAPTCHA token:', error);
    return false;
  }
}

module.exports = {
  hashPassword,
  comparePassword,
  requireAuth,
  csrfProtection,
  verifyRecaptcha
};
