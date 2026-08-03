const { initDb, query } = require('./src/db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Initializing database schema...');
  await initDb();

  console.log('Seeding database...');

  // 1. Clear existing data
  await query.run('DELETE FROM email_logs');
  await query.run('DELETE FROM incident_services');
  await query.run('DELETE FROM incident_servers');
  await query.run('DELETE FROM incidents');
  await query.run('DELETE FROM services');
  await query.run('DELETE FROM clients');
  await query.run('DELETE FROM servers');
  await query.run('DELETE FROM admins');

  const adminPasswordHash = await bcrypt.hash('admin@1906', 10);
  await query.run(
    'INSERT INTO admins (username, password_hash, email, secret_code) VALUES (?, ?, ?, ?)',
    ['admin', adminPasswordHash, 'servicestatusapp1906@gmail.com', 'StatusSecret99!']
  );
  console.log('Admin account created: servicestatusapp1906@gmail.com / admin@1906');

  // 3. Servers
  const s1Result = await query.run(
    'INSERT INTO servers (server_name, server_code, ip_address, location, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    ['Web Host USA 01', 'SRV-USA-01', '192.168.1.10', 'New York, USA', 'Operational', 'Primary shared hosting server for US clients.']
  );
  const s2Result = await query.run(
    'INSERT INTO servers (server_name, server_code, ip_address, location, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    ['Database Cluster EU', 'SRV-EU-DB', '10.0.2.15', 'Frankfurt, Germany', 'Operational', 'High-performance database hosting.']
  );
  const s3Result = await query.run(
    'INSERT INTO servers (server_name, server_code, ip_address, location, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    ['Email Gateway APAC', 'SRV-APAC-MAIL', '172.16.5.4', 'Singapore', 'Operational', 'SMTP and IMAP mail routing server.']
  );
  console.log('Servers seeded.');

  const s1 = s1Result.lastID;
  const s2 = s2Result.lastID;
  const s3 = s3Result.lastID;

  // 4. Clients
  const c1Result = await query.run(
    'INSERT INTO clients (client_name, company_name, contact_person, email, phone) VALUES (?, ?, ?, ?, ?)',
    ['Acme Corp', 'Acme Inc.', 'John Acme', 'contact@acme.com', '123-456-7890']
  );
  const c2Result = await query.run(
    'INSERT INTO clients (client_name, company_name, contact_person, email, phone) VALUES (?, ?, ?, ?, ?)',
    ['John Doe', 'Doe Ventures', 'John Doe', 'john@doe.com', '987-654-3210']
  );
  const c3Result = await query.run(
    'INSERT INTO clients (client_name, company_name, contact_person, email, phone) VALUES (?, ?, ?, ?, ?)',
    ['Global Retail', 'Global Retail LLC', 'Sarah Smith', 'ops@globalretail.com', '555-019-2834']
  );
  console.log('Clients seeded.');

  const c1 = c1Result.lastID;
  const c2 = c2Result.lastID;
  const c3 = c3Result.lastID;

  // 5. Services
  // Acme Corp
  await query.run(
    'INSERT INTO services (service_id, client_id, server_id, active_status) VALUES (?, ?, ?, ?)',
    ['acme.com', c1, s1, 1]
  );
  await query.run(
    'INSERT INTO services (service_id, client_id, server_id, active_status) VALUES (?, ?, ?, ?)',
    ['billing.acme.com', c1, s2, 1]
  );

  // John Doe
  await query.run(
    'INSERT INTO services (service_id, client_id, server_id, active_status) VALUES (?, ?, ?, ?)',
    ['doe.com', c2, s1, 1]
  );

  // Global Retail
  await query.run(
    'INSERT INTO services (service_id, client_id, server_id, active_status) VALUES (?, ?, ?, ?)',
    ['shop.globalretail.com', c3, s1, 1]
  );
  await query.run(
    'INSERT INTO services (service_id, client_id, server_id, active_status) VALUES (?, ?, ?, ?)',
    ['mail.globalretail.com', c3, s3, 1]
  );
  console.log('Services seeded.');

  // Helper date calculations
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const fortyFiveMinutesLater = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
  
  // 6. Incidents
  // Active Incident (Server B)
  const inc1Result = await query.run(
    'INSERT INTO incidents (title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      'EU Database Performance Degradation',
      'Degraded Performance',
      'Medium',
      'Active',
      oneHourAgo,
      twoHoursLater,
      'We are experiencing higher than normal CPU usage on the EU database server.',
      'EU Database latency is currently increased. Queries might take longer to execute.',
      'Investigating slow query logs. Might need to optimize database indexes.',
      'A massive reporting query ran from an unoptimized background cron.',
      'Indices optimization and cron rescheduling.'
    ]
  );
  const inc1 = inc1Result.lastID;
  await query.run('INSERT INTO incident_servers (incident_id, server_id) VALUES (?, ?)', [inc1, s2]);
  await query.run('INSERT INTO incident_services (incident_id, service_id, is_affected) VALUES (?, ?, 1)', [inc1, 'billing.acme.com']);

  // Scheduled Maintenance Incident (Server C) - 45 mins later (so scheduled)
  const inc2Result = await query.run(
    'INSERT INTO incidents (title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution, maintenance_window) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      'APAC Mail Gateway Upgrades',
      'Maintenance',
      'Low',
      'Scheduled',
      fortyFiveMinutesLater,
      twoHoursLater,
      'Scheduled security patching and hardware maintenance on the Singapore gateway.',
      'Email routing in APAC region may experience brief interruptions of 5-10 minutes.',
      'Apply OS security updates.',
      'Regular maintenance window.',
      'OS patching and system reboot.',
      '45 mins'
    ]
  );
  const inc2 = inc2Result.lastID;
  await query.run('INSERT INTO incident_servers (incident_id, server_id) VALUES (?, ?)', [inc2, s3]);
  await query.run('INSERT INTO incident_services (incident_id, service_id, is_affected) VALUES (?, ?, 1)', [inc2, 'mail.globalretail.com']);

  // Resolved Incident (Server A)
  const inc3Result = await query.run(
    'INSERT INTO incidents (title, type, severity, status, start_time, end_time, description, public_message, internal_notes, root_cause, expected_resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      'Network Outage USA West',
      'Network Issue',
      'Critical',
      'Resolved',
      threeHoursAgo,
      twoHoursAgo,
      'A fiber cut near the datacenter caused packet loss and brief disconnection.',
      'Network connectivity has been restored. All services are back online.',
      'Upstream ISP resolved the fiber cut.',
      'Fiber cut.',
      'ISP rerouted traffic.'
    ]
  );
  const inc3 = inc3Result.lastID;
  await query.run('INSERT INTO incident_servers (incident_id, server_id) VALUES (?, ?)', [inc3, s1]);
  await query.run('INSERT INTO incident_services (incident_id, service_id, is_affected) VALUES (?, ?, 1)', [inc3, 'acme.com']);
  await query.run('INSERT INTO incident_services (incident_id, service_id, is_affected) VALUES (?, ?, 1)', [inc3, 'doe.com']);
  await query.run('INSERT INTO incident_services (incident_id, service_id, is_affected) VALUES (?, ?, 1)', [inc3, 'shop.globalretail.com']);

  console.log('Incidents and relations seeded.');
  console.log('Database seeding completed successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
