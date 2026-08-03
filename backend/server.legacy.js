require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { initDb, query } = require('./src/db');
const { requireAuth, csrfProtection, verifyRecaptcha, hashPassword, comparePassword } = require('./src/auth');
const { sendIncidentEmail, sendAdminPasswordEmail, sendPasswordResetEmail } = require('./src/mail');
const { startCron, sendManualReminders } = require('./src/cron');
const { activateIncident, resolveIncident } = require('./src/job-crons');
const { validate, serverRules, clientRules, incidentRules } = require('./src/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Template Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'frontend', 'views'));

// Static assets
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Request parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Session management
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_key_12345!',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 60 * 1000, // 30 minutes session timeout
    secure: false, // Set to true if running over HTTPS
    httpOnly: true
  }
}));

// Apply CSRF Protection Globally
app.use(csrfProtection);

// Global middleware to expose message variables and login status
app.use(async (req, res, next) => {
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.errors = req.session.errors || null;
  res.locals.success_msg = req.session.success_msg || null;
  res.locals.formData = req.session.formData || null;
  res.locals.isAdminLoggedIn = !!(req.session && req.session.adminId);
  res.locals.adminUsername = req.session.adminUsername || null;
  res.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY || '';

  if (req.session && req.session.adminId) {
    try {
      const admin = await query.get('SELECT email, secret_code FROM admins WHERE id = ?', [req.session.adminId]);
      if (admin) {
        res.locals.adminEmail = admin.email;
        res.locals.adminSecretCode = admin.secret_code;
      }
    } catch (e) {
      console.error('Error fetching admin profile in middleware:', e);
    }
  }

  // Clear flash variables
  delete req.session.errors;
  delete req.session.success_msg;
  delete req.session.formData;
  next();
});

// =========================================================================
// ========================== PUBLIC PAGES ROUTES ==========================
// =========================================================================

// Public status page home
app.get('/', async (req, res) => {
  const currentPage = parseInt(req.query.current_page) || 1;
  const scheduledPage = parseInt(req.query.scheduled_page) || 1;
  const pastPage = parseInt(req.query.past_page) || 1;
  const limit = 5;

  try {
    // Determine overall status based on whether there are active incidents affecting services
    const activeIncidentCountRow = await query.get(`
      SELECT COUNT(DISTINCT i.id) as count 
      FROM incidents i 
      JOIN incident_services ise ON i.id = ise.incident_id 
      WHERE i.status = 'Active' AND ise.is_affected = 1
    `);
    const activeIncidentsCount = activeIncidentCountRow.count;

    let bannerClass = 'operational';
    let bannerTitle = 'All Systems Operational';
    let bannerText = 'Everything is working as expected.';

    if (activeIncidentsCount > 0) {
      // Check if there are active outages (Down, Major Outage) or just Degradation/Maintenance
      const outageCountRow = await query.get(`
        SELECT COUNT(*) as count 
        FROM incidents i 
        JOIN incident_services ise ON i.id = ise.incident_id
        WHERE i.status = 'Active' AND ise.is_affected = 1 
          AND (i.type = 'Down' OR i.type = 'Major Outage' OR i.type = 'Partial Outage')
      `);
      if (outageCountRow.count > 0) {
        bannerClass = 'outage';
        bannerTitle = 'System Outages Reported';
        bannerText = 'We are currently experiencing service interruptions.';
      } else {
        bannerClass = 'maintenance';
        bannerTitle = 'System Maintenance / Performance Issues';
        bannerText = 'Some services are undergoing scheduled maintenance or experiencing degraded performance.';
      }
    }

    // Get active servers with their latest incident details
    const activeServers = await query.all(`
      SELECT DISTINCT s.server_name, s.server_code, s.location, i.title as incident_title, i.type as incident_type, i.start_time, i.end_time, i.public_message, i.description
      FROM servers s
      JOIN incident_servers isv ON s.id = isv.server_id
      JOIN incidents i ON isv.incident_id = i.id
      WHERE i.status = 'Active'
    `);

    // Paginated current incidents
    const currentOffset = (currentPage - 1) * limit;
    const currentIncidents = await query.all(`
      SELECT * FROM incidents WHERE status = 'Active' ORDER BY start_time DESC LIMIT ? OFFSET ?
    `, [limit, currentOffset]);
    const currentTotalRow = await query.get("SELECT COUNT(*) as count FROM incidents WHERE status = 'Active'");
    const currentTotalPages = Math.ceil(currentTotalRow.count / limit);

    // Paginated scheduled incidents
    const scheduledOffset = (scheduledPage - 1) * limit;
    const scheduledIncidents = await query.all(`
      SELECT * FROM incidents WHERE status = 'Scheduled' ORDER BY start_time ASC LIMIT ? OFFSET ?
    `, [limit, scheduledOffset]);
    const scheduledTotalRow = await query.get("SELECT COUNT(*) as count FROM incidents WHERE status = 'Scheduled'");
    const scheduledTotalPages = Math.ceil(scheduledTotalRow.count / limit);

    // Paginated past incidents (grouping server names together)
    const pastOffset = (pastPage - 1) * limit;
    const pastIncidents = await query.all(`
      SELECT i.*, group_concat(s.server_name, ', ') as server_names
      FROM incidents i
      LEFT JOIN incident_servers isv ON i.id = isv.incident_id
      LEFT JOIN servers s ON isv.server_id = s.id
      WHERE i.status = 'Resolved'
      GROUP BY i.id
      ORDER BY i.end_time DESC
      LIMIT ? OFFSET ?
    `, [limit, pastOffset]);
    const pastTotalRow = await query.get("SELECT COUNT(*) as count FROM incidents WHERE status = 'Resolved'");
    const pastTotalPages = Math.ceil(pastTotalRow.count / limit);

    res.render('public', {
      title: 'Service Status Website',
      bannerClass,
      bannerTitle,
      bannerText,
      activeIncidentsCount,
      activeServers,
      currentIncidents,
      currentPage,
      currentTotalPages,
      scheduledIncidents,
      scheduledPage,
      scheduledTotalPages,
      pastIncidents,
      pastPage,
      pastTotalPages
    });
  } catch (err) {
    console.error('Error loading public page:', err);
    res.status(500).send('Internal Server Error');
  }
});

// JSON API endpoint for AJAX summary refresh (every 5 seconds)
app.get('/api/status-summary', async (req, res) => {
  try {
    const activeIncidentCountRow = await query.get(`
      SELECT COUNT(DISTINCT i.id) as count 
      FROM incidents i 
      JOIN incident_services ise ON i.id = ise.incident_id 
      WHERE i.status = 'Active' AND ise.is_affected = 1
    `);
    const activeIncidentsCount = activeIncidentCountRow.count;

    let statusClass = 'operational';
    let bannerTitle = 'All Systems Operational';
    let bannerText = 'Everything is working as expected.';

    if (activeIncidentsCount > 0) {
      const outageCountRow = await query.get(`
        SELECT COUNT(*) as count 
        FROM incidents i 
        JOIN incident_services ise ON i.id = ise.incident_id
        WHERE i.status = 'Active' AND ise.is_affected = 1 
          AND (i.type = 'Down' OR i.type = 'Major Outage' OR i.type = 'Partial Outage')
      `);
      if (outageCountRow.count > 0) {
        statusClass = 'outage';
        bannerTitle = 'System Outages Reported';
        bannerText = 'We are currently experiencing service interruptions.';
      } else {
        statusClass = 'maintenance';
        bannerTitle = 'System Maintenance / Performance Issues';
        bannerText = 'Some services are undergoing scheduled maintenance or experiencing degraded performance.';
      }
    }

    const activeServers = await query.all(`
      SELECT DISTINCT s.server_name, s.server_code, s.location, i.title as incident_title, i.type as incident_type, i.start_time, i.end_time, i.public_message, i.description
      FROM servers s
      JOIN incident_servers isv ON s.id = isv.server_id
      JOIN incidents i ON isv.incident_id = i.id
      WHERE i.status = 'Active'
    `);

    res.json({
      statusClass,
      bannerTitle,
      bannerText,
      activeIncidentsCount,
      activeServers
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve system status summary' });
  }
});

// JSON API for searching status of a specific domain
app.get('/api/search', async (req, res) => {
  const domain = req.query.domain ? req.query.domain.trim() : '';
  if (!domain) {
    return res.status(400).json({ error: 'Service ID / Domain is required.' });
  }

  try {
    const service = await query.get(`
      SELECT s.service_id, s.active_status, c.client_name, c.company_name, sv.server_name, sv.server_code, sv.status as server_status
      FROM services s
      JOIN clients c ON s.client_id = c.id
      JOIN servers sv ON s.server_id = sv.id
      WHERE s.service_id = ?
    `, [domain]);

    if (!service) {
      return res.status(404).json({ error: 'Service ID not found. Verify domain and try again.' });
    }

    // Check if there is an active incident affecting this service
    const activeIncident = await query.get(`
      SELECT i.title, i.type, i.severity, i.start_time, i.end_time, i.public_message, i.description, i.expected_resolution
      FROM incidents i
      JOIN incident_services ise ON i.id = ise.incident_id
      WHERE i.status = 'Active' 
        AND ise.service_id = ? 
        AND ise.is_affected = 1
      ORDER BY i.start_time DESC
      LIMIT 1
    `, [domain]);

    res.json({
      service_id: service.service_id,
      client_name: service.client_name,
      company_name: service.company_name,
      active_status: service.active_status,
      incident: activeIncident || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed due to internal error.' });
  }
});

// =========================================================================
// ========================== ADMIN AUTHENTICATION ==========================
// =========================================================================

app.get('/admin.html', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('login', { title: 'Admin Login' });
});

app.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const grecaptcha_token = req.body.grecaptcha_token || '';
  req.session.formData = { email };

  if (!email || !password) {
    req.session.errors = ['Admin email and password are required.'];
    return res.redirect('/login');
  }

  try {
    // Verify reCAPTCHA
    const recaptchaApproved = await verifyRecaptcha(grecaptcha_token, req.ip);
    if (!recaptchaApproved) {
      req.session.errors = ['reCAPTCHA validation failed. Please try again.'];
      return res.redirect('/login');
    }

    const admin = await query.get('SELECT * FROM admins WHERE LOWER(email) = ?', [email]);
    if (!admin) {
      req.session.errors = ['Invalid email address or password.'];
      return res.redirect('/login');
    }

    const match = await comparePassword(password, admin.password_hash);
    if (!match) {
      req.session.errors = ['Invalid email address or password.'];
      return res.redirect('/login');
    }

    // Success login
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    req.session.errors = ['An error occurred during sign in.'];
    res.redirect('/login');
  }
});

// Forgot Password
app.get('/forgot-password', (req, res) => {
  res.render('forgot', { title: 'Recover Password' });
});

app.post('/forgot-password', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const secret_code = (req.body.secret_code || '').trim();
  req.session.formData = { email };

  if (!email || !secret_code) {
    req.session.errors = ['Email address and security secret code are required.'];
    return res.redirect('/forgot-password');
  }

  try {
    const admin = await query.get('SELECT * FROM admins WHERE LOWER(email) = ? AND secret_code = ?', [email, secret_code]);
    if (!admin) {
      req.session.errors = ['Invalid email address or security secret code.'];
      return res.redirect('/forgot-password');
    }

    const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 10) + '1906!';
    const bcrypt = require('bcryptjs');
    const newHash = await bcrypt.hash(tempPassword, 10);

    await query.run('UPDATE admins SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [newHash, admin.id]);
    await sendAdminPasswordEmail(admin.email, tempPassword);

    req.session.success_msg = 'Identity verified! A new temporary password has been sent to your admin email.';
    res.redirect('/forgot-password');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to recover password.'];
    res.redirect('/forgot-password');
  }
});

// Reset Password View
app.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    req.session.errors = ['Invalid or missing reset token.'];
    return res.redirect('/login');
  }

  try {
    const admin = await query.get('SELECT id FROM admins WHERE reset_token = ? AND reset_token_expires > ?', [token, Date.now()]);
    if (!admin) {
      req.session.errors = ['Reset token has expired or is invalid. Please request a new link.'];
      return res.redirect('/forgot-password');
    }

    res.render('reset', { title: 'Reset Password', token });
  } catch (err) {
    console.error(err);
    res.redirect('/login');
  }
});

// Reset Password Post
app.post('/reset-password', async (req, res) => {
  const { token, password, confirm_password, grecaptcha_token } = req.body;

  if (password !== confirm_password) {
    req.session.errors = ['Passwords do not match.'];
    return res.redirect(`/reset-password?token=${token}`);
  }

  try {
    const recaptchaApproved = await verifyRecaptcha(grecaptcha_token, req.ip);
    if (!recaptchaApproved) {
      req.session.errors = ['reCAPTCHA validation failed. Please try again.'];
      return res.redirect(`/reset-password?token=${token}`);
    }

    const admin = await query.get('SELECT id FROM admins WHERE reset_token = ? AND reset_token_expires > ?', [token, Date.now()]);
    if (!admin) {
      req.session.errors = ['Reset token has expired. Please request a new link.'];
      return res.redirect('/forgot-password');
    }

    const newHash = await hashPassword(password);
    await query.run(
      'UPDATE admins SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [newHash, admin.id]
    );

    req.session.success_msg = 'Password reset complete. You can now sign in.';
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to update password.'];
    res.redirect('/login');
  }
});

// =========================================================================
// ======================== SECURE ADMIN CONTROLLER ========================
// =========================================================================

app.post('/admin/logout', requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

app.post('/admin/edit-profile', requireAuth, async (req, res) => {
  const { username, email, secret_code, password } = req.body;
  if (!username || !email || !secret_code) {
    req.session.errors = ['Username, email, and secret code are mandatory.'];
    return res.redirect('/admin');
  }

  try {
    const updates = [username, email, secret_code, req.session.adminId];
    let sql = 'UPDATE admins SET username = ?, email = ?, secret_code = ?, updated_at = CURRENT_TIMESTAMP';
    let params = [username, email, secret_code];

    if (password && password.trim()) {
      const hashed = await hashPassword(password.trim());
      sql += ', password_hash = ?';
      params.push(hashed);
    }

    sql += ' WHERE id = ?';
    params.push(req.session.adminId);

    await query.run(sql, params);

    req.session.adminUsername = username;
    req.session.success_msg = 'Admin profile updated successfully.';
    res.redirect('/admin');
  } catch (err) {
    console.error('Error updating admin profile:', err);
    req.session.errors = ['Failed to update admin profile details.'];
    res.redirect('/admin');
  }
});

app.get('/admin', requireAuth, async (req, res) => {
  const activeTab = req.query.tab || 'servers';
  
  // Pagination & Search settings
  const serverPage = parseInt(req.query.server_page) || 1;
  const serverSearch = req.query.server_search ? req.query.server_search.trim() : '';
  
  const clientPage = parseInt(req.query.client_page) || 1;
  const clientSearch = req.query.client_search ? req.query.client_search.trim() : '';
  
  const incidentPage = parseInt(req.query.incident_page) || 1;
  const incidentSearch = req.query.incident_search ? req.query.incident_search.trim() : '';
  
  const limit = 10;

  try {
    // 1. Dashboard Stats
    const totalServersRow = await query.get('SELECT COUNT(*) as count FROM servers');
    const totalServicesRow = await query.get('SELECT COUNT(*) as count FROM services');
    const activeIncidentsRow = await query.get("SELECT COUNT(*) as count FROM incidents WHERE status = 'Active'");
    
    const stats = {
      serversCount: totalServersRow.count,
      servicesCount: totalServicesRow.count,
      activeIncidentsCount: activeIncidentsRow.count
    };

    // 2. Fetch full list of servers for dropdowns (unpaginated)
    const allServersList = await query.all('SELECT id, server_name, server_code FROM servers ORDER BY server_name ASC');

    // 3. MODULE 1: SERVERS PAGINATION & SEARCH
    const sOffset = (serverPage - 1) * limit;
    let sQuery = 'SELECT * FROM servers';
    let sParams = [];
    if (serverSearch) {
      sQuery += ' WHERE server_name LIKE ? OR server_code LIKE ? OR location LIKE ?';
      sParams = [`%${serverSearch}%`, `%${serverSearch}%`, `%${serverSearch}%`];
    }
    sQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const servers = await query.all(sQuery, [...sParams, limit, sOffset]);
    
    let sCountQuery = 'SELECT COUNT(*) as count FROM servers';
    if (serverSearch) sCountQuery += ' WHERE server_name LIKE ? OR server_code LIKE ? OR location LIKE ?';
    const sCount = await query.get(sCountQuery, sParams);
    const serverTotalPages = Math.ceil(sCount.count / limit);

    // 4. MODULE 2: CLIENTS & SERVICES PAGINATION & SEARCH
    const cOffset = (clientPage - 1) * limit;
    let cQuery = `
      SELECT c.*, s.service_id, s.active_status, sv.server_name, sv.server_code, sv.id as server_id,
             i.type as incident_type
      FROM clients c
      JOIN services s ON c.id = s.client_id
      JOIN servers sv ON s.server_id = sv.id
      LEFT JOIN incident_servers isv ON sv.id = isv.server_id
      LEFT JOIN incidents i ON isv.incident_id = i.id AND i.status = 'Active'
    `;
    let cParams = [];
    if (clientSearch) {
      cQuery += ' WHERE c.client_name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ? OR s.service_id LIKE ? OR sv.server_name LIKE ?';
      cParams = [`%${clientSearch}%`, `%${clientSearch}%`, `%${clientSearch}%`, `%${clientSearch}%`, `%${clientSearch}%`];
    }
    cQuery += ' GROUP BY s.service_id ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    const clients = await query.all(cQuery, [...cParams, limit, cOffset]);

    let cCountQuery = `
      SELECT COUNT(DISTINCT s.service_id) as count 
      FROM clients c
      JOIN services s ON c.id = s.client_id
      JOIN servers sv ON s.server_id = sv.id
    `;
    if (clientSearch) {
      cCountQuery += ' WHERE c.client_name LIKE ? OR c.company_name LIKE ? OR c.email LIKE ? OR s.service_id LIKE ? OR sv.server_name LIKE ?';
    }
    const cCount = await query.get(cCountQuery, cParams);
    const clientTotalPages = Math.ceil(cCount.count / limit);

    // 5. MODULE 3: INCIDENTS PAGINATION & SEARCH
    const iOffset = (incidentPage - 1) * limit;
    let iQuery = `
      SELECT i.*, group_concat(s.server_code, ', ') as server_names
      FROM incidents i
      LEFT JOIN incident_servers isv ON i.id = isv.incident_id
      LEFT JOIN servers s ON isv.server_id = s.id
    `;
    let iParams = [];
    if (incidentSearch) {
      iQuery += ' WHERE i.title LIKE ? OR i.type LIKE ? OR s.server_code LIKE ?';
      iParams = [`%${incidentSearch}%`, `%${incidentSearch}%`, `%${incidentSearch}%`];
    }
    iQuery += ' GROUP BY i.id ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
    const incidents = await query.all(iQuery, [...iParams, limit, iOffset]);

    let iCountQuery = 'SELECT COUNT(DISTINCT i.id) as count FROM incidents i LEFT JOIN incident_servers isv ON i.id = isv.incident_id LEFT JOIN servers s ON isv.server_id = s.id';
    if (incidentSearch) {
      iCountQuery += ' WHERE i.title LIKE ? OR i.type LIKE ? OR s.server_code LIKE ?';
    }
    const iCount = await query.get(iCountQuery, iParams);
    const incidentTotalPages = Math.ceil(iCount.count / limit);

    res.render('admin', {
      title: 'Admin Dashboard',
      activeTab,
      stats,
      allServersList,
      
      // Servers
      servers,
      serverPage,
      serverTotalPages,
      serverSearch,
      
      // Clients
      clients,
      clientPage,
      clientTotalPages,
      clientSearch,
      
      // Incidents
      incidents,
      incidentPage,
      incidentTotalPages,
      incidentSearch
    });
  } catch (err) {
    console.error('Error loading admin page:', err);
    res.status(500).send('Internal Server Error');
  }
});

// CRUD: Add Server
app.post('/admin/servers/add', requireAuth, serverRules, validate, async (req, res) => {
  const { server_name, server_code, ip_address, location, status, description } = req.body;
  try {
    await query.run(
      'INSERT INTO servers (server_name, server_code, ip_address, location, status, description) VALUES (?, ?, ?, ?, ?, ?)',
      [server_name, server_code, ip_address, location, status, description]
    );
    req.session.success_msg = `Server ${server_name} successfully registered.`;
    res.redirect('/admin?tab=servers');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Database insert error. Please try again.'];
    res.redirect('/admin?tab=servers');
  }
});

// CRUD: Edit Server
app.post('/admin/servers/:id/edit', requireAuth, serverRules, validate, async (req, res) => {
  const serverId = req.params.id;
  const { server_name, server_code, ip_address, location, status, description } = req.body;
  try {
    await query.run(`
      UPDATE servers 
      SET server_name = ?, server_code = ?, ip_address = ?, location = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [server_name, server_code, ip_address, location, status, description, serverId]);
    req.session.success_msg = `Server ${server_name} updated successfully.`;
    res.redirect('/admin?tab=servers');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to update server.'];
    res.redirect('/admin?tab=servers');
  }
});

// CRUD: Delete Server
app.post('/admin/servers/:id/delete', requireAuth, async (req, res) => {
  const serverId = req.params.id;
  try {
    // Check if server is hosting any service
    const serviceCount = await query.get('SELECT COUNT(*) as count FROM services WHERE server_id = ?', [serverId]);
    if (serviceCount.count > 0) {
      req.session.errors = ['Cannot delete server because it has active client services assigned to it. Move those services to another server first.'];
      return res.redirect('/admin?tab=servers');
    }
    
    await query.run('DELETE FROM servers WHERE id = ?', [serverId]);
    req.session.success_msg = 'Server deleted successfully.';
    res.redirect('/admin?tab=servers');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to delete server.'];
    res.redirect('/admin?tab=servers');
  }
});

// CRUD: Add Client & Service
app.post('/admin/clients/add', requireAuth, clientRules, validate, async (req, res) => {
  const { client_name, company_name, contact_person, email, phone, service_id, server_id, notify_client } = req.body;
  
  try {
    // 1. Create client row
    const clientResult = await query.run(`
      INSERT INTO clients (client_name, company_name, contact_person, email, phone)
      VALUES (?, ?, ?, ?, ?)
    `, [client_name, company_name, contact_person, email, phone]);
    const clientId = clientResult.lastID;

    // 2. Create service row
    await query.run(`
      INSERT INTO services (service_id, client_id, server_id, active_status)
      VALUES (?, ?, ?, 1)
    `, [service_id, clientId, server_id]);

    req.session.success_msg = `Client service ${service_id} successfully created.`;

    // 3. Automatic Incident Check & Notification
    if (notify_client === '1') {
      // Find any active or scheduled incidents for this server
      const serverIncidents = await query.all(`
        SELECT i.* FROM incidents i
        JOIN incident_servers isv ON i.id = isv.incident_id
        WHERE isv.server_id = ? AND i.status != 'Resolved'
      `, [server_id]);

      for (const incident of serverIncidents) {
        // Link service to the incident
        await query.run(`
          INSERT OR IGNORE INTO incident_services (incident_id, service_id, is_affected)
          VALUES (?, ?, 1)
        `, [incident.id, service_id]);

        // Send alert email immediately (suppress for Maintenance)
        if (incident.type !== 'Maintenance') {
          console.log(`[Auto Incident Check] Triggering initial incident alert to ${email} for service ${service_id}...`);
          await sendIncidentEmail(incident, service_id, email, 'Initial');
          
          // Log in email_logs
          await query.run(`
            INSERT INTO email_logs (incident_id, service_id, email_type)
            VALUES (?, ?, 'Initial')
          `, [incident.id, service_id]);
        } else {
          console.log(`[Auto Incident Check] Suppression: Incident ${incident.id} is Maintenance. Skipping email.`);
        }
      }
    }

    res.redirect('/admin?tab=clients');
  } catch (err) {
    console.error('Error creating client service:', err);
    req.session.errors = ['An error occurred while creating client service.'];
    res.redirect('/admin?tab=clients');
  }
});

// CRUD: Edit Client & Service
app.post('/admin/clients/:id/edit', requireAuth, clientRules, validate, async (req, res) => {
  const clientId = req.params.id;
  const { client_name, company_name, contact_person, email, phone, service_id, server_id, original_service_id } = req.body;
  
  try {
    // 1. Update client details
    await query.run(`
      UPDATE clients
      SET client_name = ?, company_name = ?, contact_person = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [client_name, company_name, contact_person, email, phone, clientId]);

    // 2. Update service details
    await query.run(`
      UPDATE services
      SET service_id = ?, server_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ? AND service_id = ?
    `, [service_id, server_id, clientId, original_service_id]);

    req.session.success_msg = `Client service details for ${service_id} updated.`;
    res.redirect('/admin?tab=clients');
  } catch (err) {
    console.error('Error updating client service:', err);
    req.session.errors = ['Failed to update client details.'];
    res.redirect('/admin?tab=clients');
  }
});

// CRUD: Delete Client
app.post('/admin/clients/:id/delete', requireAuth, async (req, res) => {
  const clientId = req.params.id;
  try {
    // Services cascade delete automatically thanks to ON DELETE CASCADE
    await query.run('DELETE FROM clients WHERE id = ?', [clientId]);
    req.session.success_msg = 'Client service deleted successfully.';
    res.redirect('/admin?tab=clients');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to delete client service.'];
    res.redirect('/admin?tab=clients');
  }
});

// CRUD: Add Incident
app.post('/admin/incidents/add', requireAuth, incidentRules, validate, async (req, res) => {
  const { title, type, severity, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window } = req.body;
  
  // Ensure servers is treated as an array
  let servers = req.body.servers;
  if (!Array.isArray(servers)) {
    servers = [servers];
  }

  // Get services that were checked in the affected services checklist
  let checkedServices = req.body.services;
  if (!checkedServices) {
    checkedServices = [];
  } else if (!Array.isArray(checkedServices)) {
    checkedServices = [checkedServices];
  }

  try {
    // Determine lifecycle status based on times
    const now = new Date();
    const start = new Date(start_time);
    let status = 'Scheduled';
    if (start <= now) {
      status = 'Active';
    }

    // 1. Create incident
    const incidentResult = await query.run(`
      INSERT INTO incidents (title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window, req.session.adminUsername]);
    const incidentId = incidentResult.lastID;

    // 2. Link servers
    for (const serverId of servers) {
      await query.run('INSERT INTO incident_servers (incident_id, server_id) VALUES (?, ?)', [incidentId, serverId]);
    }

    // 3. Link all hosted services, marking checked ones as is_affected = 1 and unchecked as is_affected = 0
    // Get ALL services on these servers
    const serverIdsPlaceholder = servers.map(() => '?').join(',');
    const allServices = await query.all(`
      SELECT service_id FROM services WHERE server_id IN (${serverIdsPlaceholder})
    `, servers);

    for (const service of allServices) {
      const isAffected = checkedServices.includes(service.service_id) ? 1 : 0;
      await query.run(`
        INSERT INTO incident_services (incident_id, service_id, is_affected)
        VALUES (?, ?, ?)
      `, [incidentId, service.service_id, isAffected]);
    }

    // 4. If status is Active, trigger the activateIncident job to handle transitions, email logs, and resolve others
    if (status === 'Active') {
      await activateIncident(incidentId, now.toISOString());
    }

    req.session.success_msg = `Incident "${title}" successfully declared.`;
    res.redirect('/admin?tab=incidents');
  } catch (err) {
    console.error('Error declaring incident:', err);
    req.session.errors = ['An error occurred while declaring the incident.'];
    res.redirect('/admin?tab=incidents');
  }
});

// CRUD: Edit Incident
app.post('/admin/incidents/:id/edit', requireAuth, incidentRules, validate, async (req, res) => {
  const incidentId = req.params.id;
  const { title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window } = req.body;
  
  let servers = req.body.servers;
  if (!Array.isArray(servers)) {
    servers = [servers];
  }

  let checkedServices = req.body.services;
  if (!checkedServices) {
    checkedServices = [];
  } else if (!Array.isArray(checkedServices)) {
    checkedServices = [checkedServices];
  }

  try {
    // 1. Update incident
    await query.run(`
      UPDATE incidents
      SET title = ?, type = ?, severity = ?, status = ?, start_time = ?, end_time = ?, description = ?, public_message = ?, internal_notes = ?, root_cause = ?, expected_resolution = ?, maintenance_window = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window, incidentId]);

    // 2. Re-map servers (Delete and re-insert)
    await query.run('DELETE FROM incident_servers WHERE incident_id = ?', [incidentId]);
    for (const serverId of servers) {
      await query.run('INSERT INTO incident_servers (incident_id, server_id) VALUES (?, ?)', [incidentId, serverId]);
    }

    // 3. Re-map services (Delete and re-insert)
    await query.run('DELETE FROM incident_services WHERE incident_id = ?', [incidentId]);
    const serverIdsPlaceholder = servers.map(() => '?').join(',');
    const allServices = await query.all(`
      SELECT service_id FROM services WHERE server_id IN (${serverIdsPlaceholder})
    `, servers);

    for (const service of allServices) {
      const isAffected = checkedServices.includes(service.service_id) ? 1 : 0;
      await query.run(`
        INSERT INTO incident_services (incident_id, service_id, is_affected)
        VALUES (?, ?, ?)
      `, [incidentId, service.service_id, isAffected]);
    }

    // 4. Enforce status flow triggers
    const editNow = new Date().toISOString();
    if (status === 'Active') {
      await activateIncident(incidentId, editNow);
    } else if (status === 'Resolved') {
      await resolveIncident(incidentId, editNow);
    }

    req.session.success_msg = `Incident "${title}" updated.`;
    res.redirect('/admin?tab=incidents');
  } catch (err) {
    console.error('Error updating incident:', err);
    req.session.errors = ['An error occurred while updating the incident.'];
    res.redirect('/admin?tab=incidents');
  }
});

// CRUD: Delete Incident
app.post('/admin/incidents/:id/delete', requireAuth, async (req, res) => {
  const incidentId = req.params.id;
  try {
    await query.run('DELETE FROM incidents WHERE id = ?', [incidentId]);
    req.session.success_msg = 'Incident deleted successfully.';
    res.redirect('/admin?tab=incidents');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to delete incident.'];
    res.redirect('/admin?tab=incidents');
  }
});

// Manual Reminder Notification trigger
app.post('/admin/incidents/:id/notify', requireAuth, async (req, res) => {
  const incidentId = req.params.id;
  try {
    const notifyCount = await sendManualReminders(incidentId);
    req.session.success_msg = `Manual reminder alerts sent to ${notifyCount} service client(s) successfully.`;
    res.redirect('/admin?tab=incidents');
  } catch (err) {
    console.error(err);
    req.session.errors = ['Failed to send manual reminder alerts.'];
    res.redirect('/admin?tab=incidents');
  }
});

// =========================================================================
// ========================== AJAX REST API ENDPOINTS ==========================
// =========================================================================

// Checks if a server has active/scheduled incidents (Client creation alert check)
app.get('/api/servers/:serverId/active-incidents', async (req, res) => {
  const serverId = req.params.serverId;
  try {
    const activeCount = await query.get(`
      SELECT COUNT(*) as count 
      FROM incidents i
      JOIN incident_servers isv ON i.id = isv.incident_id
      WHERE isv.server_id = ? AND i.status != 'Resolved'
    `, [serverId]);
    
    res.json({ hasIncident: activeCount.count > 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to inspect server incidents.' });
  }
});

// Fetch services hosted on a set of server IDs (Incident creation check list)
app.get('/api/servers/services', async (req, res) => {
  const serverIds = req.query.serverIds;
  if (!serverIds) {
    return res.json([]);
  }

  // Ensure serverIds is treated as an array
  const ids = Array.isArray(serverIds) ? serverIds : [serverIds];
  const placeholder = ids.map(() => '?').join(',');

  try {
    const services = await query.all(`
      SELECT s.service_id, c.client_name 
      FROM services s
      JOIN clients c ON s.client_id = c.id
      WHERE s.server_id IN (${placeholder})
    `, ids);
    
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services.' });
  }
});

// Fetch single incident details (for populating edit modal)
app.get('/api/incidents/:id', async (req, res) => {
  const incidentId = req.params.id;
  try {
    const incident = await query.get('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const servers = await query.all('SELECT server_id FROM incident_servers WHERE incident_id = ?', [incidentId]);
    const services = await query.all('SELECT service_id FROM incident_services WHERE incident_id = ? AND is_affected = 1', [incidentId]);

    res.json({
      incident,
      serverIds: servers.map(s => s.server_id),
      affectedServices: services.map(s => s.service_id)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch incident details.' });
  }
});

// Bootstrapping Server
initDb()
  .then(() => {
    console.log('Database connected and schemas initialized.');
    
    // Start server listening
    app.listen(PORT, () => {
      console.log(`Web Portal running at: http://localhost:${PORT}`);
      
      // Start Background Cron Jobs
      startCron();
    });
  })
  .catch(err => {
    console.error('Fatal: Database initialization failed:', err);
    process.exit(1);
  });
