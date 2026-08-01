const { body, validationResult } = require('express-validator');
const { query } = require('./db');

// Handle validation errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsgs = errors.array().map(e => e.msg);
    // If it's an AJAX request, return JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(400).json({ error: errorMsgs.join(' ') });
    }
    // If it's standard form POST, store error in session and redirect back
    req.session.errors = errorMsgs;
    req.session.formData = req.body;
    return res.redirect('back');
  }
  next();
};

const serverRules = [
  body('server_name').trim().notEmpty().withMessage('Server Name is required.'),
  body('server_code')
    .trim()
    .notEmpty().withMessage('Server Code is required.')
    .custom(async (value, { req }) => {
      const serverId = req.body.id || req.params.id;
      let existing;
      if (serverId) {
        existing = await query.get('SELECT id FROM servers WHERE server_code = ? AND id != ?', [value, serverId]);
      } else {
        existing = await query.get('SELECT id FROM servers WHERE server_code = ?', [value]);
      }
      if (existing) {
        throw new Error('Server Code must be unique.');
      }
      return true;
    }),
  body('ip_address')
    .trim()
    .notEmpty().withMessage('IP Address is required.')
    .isIP().withMessage('IP Address must be a valid IP format.'),
  body('location').trim().notEmpty().withMessage('Location is required.'),
  body('status').trim().notEmpty().withMessage('Status is required.')
];

const clientRules = [
  body('client_name').trim().notEmpty().withMessage('Client Name is required.'),
  body('company_name').trim().notEmpty().withMessage('Company Name is required.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email Address is required.')
    .isEmail().withMessage('Email Address must be a valid email.'),
  body('service_id')
    .trim()
    .notEmpty().withMessage('Service ID (Domain Name) is required.')
    .matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,10}$/)
    .withMessage('Service ID must be a valid domain name (e.g. domain.com or mail.domain.com).')
    .custom(async (value, { req }) => {
      const originalServiceId = req.body.original_service_id;
      let existing;
      if (originalServiceId) {
        existing = await query.get('SELECT service_id FROM services WHERE service_id = ? AND service_id != ?', [value, originalServiceId]);
      } else {
        existing = await query.get('SELECT service_id FROM services WHERE service_id = ?', [value]);
      }
      if (existing) {
        throw new Error('Service ID (Domain Name) must be globally unique.');
      }
      return true;
    }),
  body('server_id').notEmpty().withMessage('Assigned Server is required.')
];

const incidentRules = [
  body('title').trim().notEmpty().withMessage('Incident Title is required.'),
  body('type').trim().notEmpty().withMessage('Incident Type is required.'),
  body('severity').trim().notEmpty().withMessage('Severity is required.'),
  body('start_time').trim().notEmpty().withMessage('Start Date & Time is required.'),
  body('end_time')
    .trim()
    .notEmpty().withMessage('End Date & Time is required.')
    .custom((value, { req }) => {
      const start = new Date(req.body.start_time);
      const end = new Date(value);
      if (end <= start) {
        throw new Error('End Date & Time must be greater than Start Date & Time.');
      }
      return true;
    }),
  body('servers')
    .custom(value => {
      if (!value || (Array.isArray(value) && value.length === 0) || (typeof value === 'string' && value.trim() === '')) {
        throw new Error('At least one server must be assigned to the incident.');
      }
      return true;
    })
];

module.exports = {
  validate,
  serverRules,
  clientRules,
  incidentRules
};
