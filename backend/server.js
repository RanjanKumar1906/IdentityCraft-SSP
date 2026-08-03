require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');

// Database Initializers
const { useMongo, Admin, Server, Client, Incident } = require('./src/models/db-adapter');

// Middlewares & Auth Helpers
const { requireAuth, csrfProtection, verifyRecaptcha, hashPassword, comparePassword } = require('./src/auth');
const { sendAdminPasswordEmail, sendPasswordResetEmail } = require('./src/mail');
const { startCron, sendManualReminders } = require('./src/cron');
const { sendTransitionEmails } = require('./src/job-crons');

const app = express();
const PORT = process.env.PORT || 3001;

// Database initialization
if (!useMongo) {
  console.log('[DB] Running in local pure JS JSON file database mode.');
} else {
  console.log('[DB] Running in MongoDB/Mongoose database mode.');
}

// Configure Session Middleware
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'StatusPortalSecretKey1906!',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // Set to true in production if running HTTPS
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF Protection Middleware
app.use(csrfProtection);

// Start cron scheduler
startCron();

// =========================================================================
// ============================= API ENDPOINTS =============================
// =========================================================================

// Config details (CSRF + reCAPTCHA Key)
app.get('/api/config', (req, res) => {
  res.json({
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '',
    csrfToken: req.session.csrfToken
  });
});

// Admin Authentication Check
app.get('/api/auth/me', async (req, res) => {
  if (req.session && req.session.adminId) {
    try {
      const admin = await Admin.findById(req.session.adminId);
      if (admin) {
        return res.json({
          authenticated: true,
          admin: {
            username: admin.username,
            email: admin.email,
            secret_code: admin.secret_code
          }
        });
      }
    } catch (e) {
      console.error('Error fetching current session user details:', e);
    }
  }
  res.json({ authenticated: false });
});

// Admin Log In Route
app.post('/api/auth/login', async (req, res) => {
  const { email, password, grecaptcha_token } = req.body;
  const errors = [];

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }

  try {
    // reCAPTCHA v3 verification
    if (process.env.RECAPTCHA_SECRET_KEY) {
      const isHuman = await verifyRecaptcha(grecaptcha_token, req.ip);
      if (!isHuman) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed. Malicious agent score detected.' });
      }
    }

    const admin = await Admin.findByEmail(email);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid administrative email or password.' });
    }

    const isMatch = await comparePassword(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid administrative email or password.' });
    }

    // Set Session
    req.session.adminId = admin.id || admin._id;

    res.json({
      success: true,
      admin: {
        username: admin.username,
        email: admin.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal system error.' });
  }
});

// Admin Log Out Route
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out. Please try again.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Admin Password Recovery (Forgot Password)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, secret_code, grecaptcha_token } = req.body;

  if (!email || !secret_code) {
    return res.status(400).json({ error: 'All fields are mandatory.' });
  }

  try {
    if (process.env.RECAPTCHA_SECRET_KEY) {
      const isHuman = await verifyRecaptcha(grecaptcha_token, req.ip);
      if (!isHuman) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed.' });
      }
    }

    const admin = await Admin.findByEmail(email);
    if (!admin || admin.secret_code !== secret_code) {
      return res.status(401).json({ error: 'Invalid email address or recovery secret code.' });
    }

    // Generate password reset token
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 Minutes

    await Admin.update(admin.id || admin._id, {
      reset_token: token,
      reset_token_expires: expires
    });

    const resetLink = `http://localhost:${PORT}/reset-password?token=${token}`;
    await sendPasswordResetEmail(admin.email, resetLink);

    res.json({
      success: true,
      message: 'Administrative recovery verified successfully. A password reset link (valid for 15 minutes) has been sent to your email.'
    });
  } catch (err) {
    console.error('Password recovery error:', err);
    res.status(500).json({ error: 'Failed to process account recovery.' });
  }
});

// Admin Password Reset (Validate Token & Update Password)
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  try {
    const admin = await Admin.findByResetToken(token);
    if (!admin) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    const now = new Date();
    const expiry = new Date(admin.reset_token_expires);
    if (expiry < now) {
      return res.status(400).json({ error: 'The password reset token has expired (15-minute limit exceeded).' });
    }

    const hash = await hashPassword(password);
    await Admin.updatePassword(admin.id || admin._id, hash);

    res.json({
      success: true,
      message: 'Your administrative password has been updated successfully. Please log in with your new credentials.'
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Edit Admin Details (Protected)
app.post('/api/auth/edit-profile', requireAuth, async (req, res) => {
  const { username, email, secret_code, password } = req.body;
  const adminId = req.session.adminId;

  if (!username || !email || !secret_code || !password) {
    return res.status(400).json({ error: 'All profile fields are mandatory.' });
  }

  try {
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin account not found.' });
    }

    // Check if new email is taken by other admin
    const emailConflict = await Admin.findByEmail(email);
    if (emailConflict && String(emailConflict.id || emailConflict._id) !== String(adminId)) {
      return res.status(400).json({ error: 'Email address is already in use by another administrator.' });
    }

    // Hash the password directly (it's mandatory to confirm password changes)
    const hash = await hashPassword(password);

    await Admin.update(adminId, {
      username,
      email,
      secret_code,
      password_hash: hash
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Admin profile edit error:', err);
    res.status(500).json({ error: 'Failed to update administrative profile.' });
  }
});

// =========================================================================
// ========================== PUBLIC API ROUTES ============================
// =========================================================================

// Public Operational Banner Stats Summary
app.get('/api/status-summary', async (req, res) => {
  try {
    const summary = await Incident.getActiveSummary();
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve banner summary.' });
  }
});

// Public Incident Log Lists (Active, Scheduled, and Paginated Resolved)
app.get('/api/public-incidents', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  try {
    const lists = await Incident.getPublicLists(page, limit);
    
    // Sanitize to hide internal notes and root cause from public visibility
    const sanitizeIncident = (inc) => {
      if (!inc) return null;
      const obj = typeof inc.toObject === 'function' ? inc.toObject() : { ...inc };
      delete obj.internal_notes;
      delete obj.root_cause;
      return obj;
    };

    res.json({
      active: (lists.active || []).map(sanitizeIncident),
      upcoming: (lists.upcoming || []).map(sanitizeIncident),
      past: (lists.past || []).map(sanitizeIncident),
      pages: lists.pages
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch incident log lists.' });
  }
});

// Public Domain Service Status Search (Hiding server nodes mapping)
app.get('/api/services/search', async (req, res) => {
  const domain = req.query.domain;
  if (!domain) {
    return res.status(400).json({ error: 'Query domain is required.' });
  }

  try {
    const service = await Client.getServiceByDomain(domain);
    if (!service) {
      return res.status(404).json({ error: 'No registered hosted service found for this domain.' });
    }

    // Find if the service hosts on a server node containing active incidents
    const activeIncidents = await Incident.all();
    let attachedIncident = null;

    for (const inc of activeIncidents) {
      if (inc.status === 'Active') {
        const relations = await Incident.getRelations(inc.id || inc._id);
        if (relations.affectedServices.includes(service.service_id)) {
          attachedIncident = inc;
          break;
        }
      }
    }

    res.json({
      service_id: service.service_id,
      client_name: service.client_name,
      company_name: service.company_name,
      server_status: service.server_status,
      active_status: service.active_status,
      incident: attachedIncident ? {
        title: attachedIncident.title,
        severity: attachedIncident.severity,
        type: attachedIncident.type,
        public_message: attachedIncident.public_message,
        description: attachedIncident.description,
        expected_resolution: attachedIncident.expected_resolution
      } : null
    });
  } catch (err) {
    console.error('Service status search error:', err);
    res.status(500).json({ error: 'Failed to process search query.' });
  }
});

// =========================================================================
// ========================== ADMIN API CONTROLS ===========================
// =========================================================================

// Counter stats for admin cards
app.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const serversList = await Server.all();
    const clientsList = await Client.all();
    const incidentsList = await Incident.all();

    const activeCount = incidentsList.filter(i => i.status === 'Active').length;

    res.json({
      servers: serversList.length,
      clients: clientsList.length,
      incidents: activeCount
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to compile admin dashboard stats.' });
  }
});

// SERVERS CRUD
app.get('/api/admin/servers', requireAuth, async (req, res) => {
  try {
    const list = await Server.all();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch servers.' });
  }
});

app.post('/api/admin/servers', requireAuth, async (req, res) => {
  const { server_name, server_code, ip_address, location, status, description } = req.body;
  if (!server_name || !server_code || !ip_address || !location) {
    return res.status(400).json({ error: 'Required fields are missing.' });
  }
  try {
    const exists = await Server.findByCode(server_code);
    if (exists) return res.status(400).json({ error: 'Server code code already registered.' });

    const server = await Server.create({ server_name, server_code, ip_address, location, status, description });
    res.status(201).json(server);
  } catch (e) {
    res.status(500).json({ error: 'Failed to register server node.' });
  }
});

app.put('/api/admin/servers/:id', requireAuth, async (req, res) => {
  const { server_name, server_code, ip_address, location, status, description } = req.body;
  try {
    const server = await Server.update(req.params.id, { server_name, server_code, ip_address, location, status, description });
    res.json(server);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update server node.' });
  }
});

app.delete('/api/admin/servers/:id', requireAuth, async (req, res) => {
  try {
    await Server.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// CLIENT SERVICES CRUD
app.get('/api/admin/clients', requireAuth, async (req, res) => {
  try {
    const list = await Client.all();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch client list.' });
  }
});

app.post('/api/admin/clients', requireAuth, async (req, res) => {
  const { client_name, company_name, contact_person, email, phone, service_id, server_id, notify_client } = req.body;
  if (!client_name || !company_name || !contact_person || !email || !phone || !service_id || !server_id) {
    return res.status(400).json({ error: 'All fields are mandatory.' });
  }
  try {
    const domainConflict = await Client.getServiceByDomain(service_id);
    if (domainConflict) return res.status(400).json({ error: 'Domain/Service ID is already registered.' });

    const client = await Client.create({ client_name, company_name, contact_person, email, phone, service_id, server_id });
    res.status(201).json(client);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to register client service.' });
  }
});

app.put('/api/admin/clients/:id', requireAuth, async (req, res) => {
  const { client_name, company_name, contact_person, email, phone, service_id, server_id } = req.body;
  try {
    const client = await Client.update(req.params.id, { client_name, company_name, contact_person, email, phone, service_id, server_id });
    res.json(client);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update client details.' });
  }
});

app.delete('/api/admin/clients/:id', requireAuth, async (req, res) => {
  try {
    await Client.delete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete client service.' });
  }
});

// INCIDENTS CRUD
app.get('/api/admin/incidents', requireAuth, async (req, res) => {
  try {
    const list = await Incident.all();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch incident log.' });
  }
});

app.get('/api/admin/incidents/:id', requireAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    const relations = await Incident.getRelations(req.params.id);
    res.json({
      incident,
      serverIds: relations.serverIds,
      affectedServices: relations.affectedServices
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load incident detail.' });
  }
});

app.post('/api/admin/incidents', requireAuth, async (req, res) => {
  const { title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window, servers, services } = req.body;
  
  if (!title || !start_time || !end_time) {
    return res.status(400).json({ error: 'Title and timelines are mandatory.' });
  }

  const serversList = servers || [];
  const servicesList = services || [];

  const now = new Date().toISOString();

  try {
    // If Active, enforce single active incident constraint
    if (status === 'Active') {
      const resolvedList = await Incident.resolveOtherActive(null, now);
      for (const oldInc of resolvedList) {
        if (oldInc.type !== 'Maintenance') {
          await sendTransitionEmails(oldInc, 'Resolved');
        }
      }
    }

    const admin = await Admin.findById(req.session.adminId);
    const incident = await Incident.create({
      title, type, severity, status, start_time, end_time, description,
      public_message, internal_notes, root_cause, expected_resolution,
      maintenance_window, servers: serversList, services: servicesList, created_by: admin ? admin.username : 'admin'
    });

    // Send notifications if active and not maintenance
    if (status === 'Active' && type !== 'Maintenance') {
      await sendTransitionEmails(incident, 'Active');
    }

    res.status(201).json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to declare incident.' });
  }
});

app.put('/api/admin/incidents/:id', requireAuth, async (req, res) => {
  const { title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window, servers, services } = req.body;
  const serversList = servers || [];
  const servicesList = services || [];
  const now = new Date().toISOString();

  try {
    const oldIncident = await Incident.findById(req.params.id);
    if (!oldIncident) return res.status(404).json({ error: 'Incident not found.' });

    // Single active incident constraint
    if (status === 'Active' && oldIncident.status !== 'Active') {
      const resolvedList = await Incident.resolveOtherActive(req.params.id, now);
      for (const oldInc of resolvedList) {
        if (oldInc.type !== 'Maintenance') {
          await sendTransitionEmails(oldInc, 'Resolved');
        }
      }
    }

    const updated = await Incident.update(req.params.id, {
      title, type, severity, status, start_time, end_time, description,
      public_message, internal_notes, root_cause, expected_resolution,
      maintenance_window, servers: serversList, services: servicesList
    });

    // Alert triggers on transition change
    if (status !== oldIncident.status && type !== 'Maintenance') {
      if (status === 'Active' || status === 'Resolved') {
        await sendTransitionEmails(updated, status);
      }
    }

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save incident edits.' });
  }
});

app.delete('/api/admin/incidents/:id', requireAuth, async (req, res) => {
  try {
    await Incident.delete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete incident.' });
  }
});

app.post('/api/admin/incidents/:id/notify', requireAuth, async (req, res) => {
  try {
    const sentCount = await sendManualReminders(req.params.id);
    res.json({ success: true, message: `Alert notifications successfully dispatched to ${sentCount} subscriber(s).` });
  } catch (e) {
    res.status(500).json({ error: 'Failed to dispatch manual alert notifications.' });
  }
});

// HELPERS FOR INCIDENT FORMS
app.get('/api/servers/services', requireAuth, async (req, res) => {
  const serverIds = req.query.serverIds;
  if (!serverIds) return res.json([]);
  try {
    const ids = Array.isArray(serverIds) ? serverIds.map(Number) : [Number(serverIds)];
    const list = await Client.getServicesByServer(ids);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load server services.' });
  }
});

app.get('/api/servers/:id/active-incidents', requireAuth, async (req, res) => {
  try {
    const active = await Incident.all();
    let hasIncident = false;
    for (const inc of active) {
      if (inc.status === 'Active') {
        const relations = await Incident.getRelations(inc.id || inc._id);
        if (relations.serverIds.map(String).includes(String(req.params.id))) {
          hasIncident = true;
          break;
        }
      }
    }
    res.json({ hasIncident });
  } catch (e) {
    res.status(500).json({ error: 'Error checking server incidents.' });
  }
});

// =========================================================================
// ======================== STATIC & SPA WILDCARD ==========================
// =========================================================================

// Serve React production build statically
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// SPA Wildcard Route Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// Start Server Listen
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`Web Portal running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

module.exports = app;
