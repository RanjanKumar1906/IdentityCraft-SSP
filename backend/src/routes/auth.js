const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const { generateToken } = require('../middleware/auth');
const { sendAdminPasswordEmail, sendPasswordResetEmail } = require('../mail');

const router = express.Router();

router.post(
  '/login',
  body('email').trim().isEmail().withMessage('A valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array().map((e) => e.msg).join(' ') });
    }

    try {
      const email = req.body.email.trim().toLowerCase();
      const password = req.body.password;
      const admin = await Admin.findOne({ email });
      if (!admin) {
        return res.status(401).json({ error: 'Invalid email address or password.' });
      }

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email address or password.' });
      }

      const token = generateToken(admin);
      return res.json({ token });
    } catch (err) {
      console.error('Login failed:', err);
      return res.status(500).json({ error: 'An error occurred during sign in.' });
    }
  }
);

router.post(
  '/forgot-password',
  body('email').trim().isEmail().withMessage('A valid admin email is required.'),
  body('secret_code').trim().notEmpty().withMessage('Secret code is required.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array().map((e) => e.msg).join(' ') });
    }

    try {
      const email = req.body.email.trim().toLowerCase();
      const secretCode = req.body.secret_code.trim();
      const admin = await Admin.findOne({ email, secretCode });
      if (!admin) {
        return res.status(404).json({ error: 'Invalid email address or security secret code.' });
      }

      const tempPassword = 'Temp' + crypto.randomBytes(4).toString('hex') + '!' ;
      const newHash = await bcrypt.hash(tempPassword, 10);
      admin.passwordHash = newHash;
      admin.resetToken = null;
      admin.resetTokenExpires = null;
      await admin.save();

      await sendAdminPasswordEmail(admin.email, tempPassword);
      return res.json({ message: 'Temporary password sent to your admin email.' });
    } catch (err) {
      console.error('Forgot password failed:', err);
      return res.status(500).json({ error: 'Failed to recover password.' });
    }
  }
);

router.post(
  '/reset-password',
  body('token').trim().notEmpty().withMessage('Reset token is required.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array().map((e) => e.msg).join(' ') });
    }

    try {
      const token = req.body.token.trim();
      const password = req.body.password;
      const admin = await Admin.findOne({ resetToken: token, resetTokenExpires: { $gt: new Date() } });
      if (!admin) {
        return res.status(404).json({ error: 'Reset token has expired or is invalid.' });
      }

      admin.passwordHash = await bcrypt.hash(password, 10);
      admin.resetToken = null;
      admin.resetTokenExpires = null;
      await admin.save();

      return res.json({ message: 'Password reset complete. You can now sign in.' });
    } catch (err) {
      console.error('Reset password failed:', err);
      return res.status(500).json({ error: 'Failed to update password.' });
    }
  }
);

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authorization token missing.' });
  }

  try {
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'service-status-portal-secret');
    return res.json({ user: payload });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

module.exports = router;
