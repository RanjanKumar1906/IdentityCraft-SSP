require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { useMongo, Admin, Server, Client, Incident } = require('./src/models/db-adapter');

async function seed() {
  console.log(`[Seed] Starting database seed (Database mode: ${useMongo ? 'MongoDB' : 'JSON DB'})...`);

  // Clear existing databases
  if (useMongo) {
    // Wait for mongoose to connect
    await new Promise((resolve) => {
      if (mongoose.connection.readyState === 1) resolve();
      else mongoose.connection.once('open', resolve);
    });
    console.log('[Seed] Dropping MongoDB database...');
    await mongoose.connection.db.dropDatabase();
  } else {
    console.log('[Seed] Re-initializing local JSON file database...');
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, 'data', 'db.json');
    
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const emptyDb = {
      admins: [],
      servers: [],
      clients: [],
      services: [],
      incidents: [],
      incident_servers: [],
      incident_services: [],
      email_logs: []
    };
    fs.writeFileSync(dbPath, JSON.stringify(emptyDb, null, 2), 'utf8');
  }

  // Hash password
  const adminPasswordHash = await bcrypt.hash('admin@1906', 10);

  // 1. Create Default Admin
  console.log('[Seed] Creating default administrative account...');
  const admin = await Admin.create({
    username: 'admin',
    email: 'servicestatusapp1906@gmail.com',
    password_hash: adminPasswordHash,
    secret_code: 'StatusSecret99!'
  });

  // 2. Create Servers
  console.log('[Seed] Seeding server nodes...');
  const s1 = await Server.create({
    server_name: 'Web Host USA 01',
    server_code: 'SRV-USA-01',
    ip_address: '192.168.1.10',
    location: 'New York, USA',
    status: 'Operational',
    description: 'Primary shared hosting server for US clients.'
  });

  const s2 = await Server.create({
    server_name: 'Database Cluster EU',
    server_code: 'SRV-EU-DB',
    ip_address: '10.0.2.15',
    location: 'Frankfurt, Germany',
    status: 'Operational',
    description: 'High-performance database hosting.'
  });

  const s3 = await Server.create({
    server_name: 'Email Gateway APAC',
    server_code: 'SRV-APAC-MAIL',
    ip_address: '172.16.5.4',
    location: 'Singapore',
    status: 'Operational',
    description: 'SMTP and IMAP mail routing server.'
  });

  // 3. Create Clients & Services
  console.log('[Seed] Seeding client domains and services...');
  const c1 = await Client.create({
    client_name: 'Acme Corp',
    company_name: 'Acme Inc.',
    contact_person: 'John Acme',
    email: 'contact@acme.com',
    phone: '123-456-7890',
    service_id: 'acme.com',
    server_id: s1.id || s1._id
  });

  await Client.create({
    client_name: 'Acme Corp Billing',
    company_name: 'Acme Inc.',
    contact_person: 'John Acme',
    email: 'billing@acme.com',
    phone: '123-456-7890',
    service_id: 'billing.acme.com',
    server_id: s2.id || s2._id
  });

  const c2 = await Client.create({
    client_name: 'John Doe',
    company_name: 'Doe Ventures',
    contact_person: 'John Doe',
    email: 'john@doe.com',
    phone: '987-654-3210',
    service_id: 'doe.com',
    server_id: s1.id || s1._id
  });

  const c3 = await Client.create({
    client_name: 'Global Retail',
    company_name: 'Global Retail LLC',
    contact_person: 'Sarah Smith',
    email: 'ops@globalretail.com',
    phone: '555-019-2834',
    service_id: 'shop.globalretail.com',
    server_id: s1.id || s1._id
  });

  await Client.create({
    client_name: 'Global Retail Mail',
    company_name: 'Global Retail LLC',
    contact_person: 'Sarah Smith',
    email: 'ops@globalretail.com',
    phone: '555-019-2834',
    service_id: 'mail.globalretail.com',
    server_id: s3.id || s3._id
  });

  // 4. Create Incidents
  console.log('[Seed] Seeding past incident logs...');
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const fortyFiveMinutesLater = new Date(now.getTime() + 45 * 60 * 1000).toISOString();

  // Active incident
  await Incident.create({
    title: 'EU Database Performance Degradation',
    type: 'Degraded Performance',
    severity: 'Medium',
    status: 'Active',
    start_time: oneHourAgo,
    end_time: twoHoursLater,
    description: 'We are experiencing higher than normal CPU usage on the EU database server.',
    public_message: 'EU Database latency is currently increased. Queries might take longer to execute.',
    internal_notes: 'Investigating slow query logs. Might need to optimize database indexes.',
    root_cause: 'A massive reporting query ran from an unoptimized background cron.',
    expected_resolution: 'Indices optimization and cron rescheduling.',
    created_by: admin.username,
    servers: [s2.id || s2._id],
    services: ['billing.acme.com']
  });

  // Scheduled incident
  await Incident.create({
    title: 'APAC Mail Gateway Upgrades',
    type: 'Maintenance',
    severity: 'Low',
    status: 'Scheduled',
    start_time: fortyFiveMinutesLater,
    end_time: twoHoursLater,
    description: 'Scheduled security patching and hardware maintenance on the Singapore gateway.',
    public_message: 'Email routing in APAC region may experience brief interruptions of 5-10 minutes.',
    internal_notes: 'Apply OS security updates.',
    root_cause: 'Regular maintenance window.',
    expected_resolution: 'OS patching and system reboot.',
    maintenance_window: '45 mins',
    created_by: admin.username,
    servers: [s3.id || s3._id],
    services: ['mail.globalretail.com']
  });

  // Resolved incident
  await Incident.create({
    title: 'Network Outage USA West',
    type: 'Down',
    severity: 'Critical',
    status: 'Resolved',
    start_time: threeHoursAgo,
    end_time: twoHoursAgo,
    description: 'A fiber cut near the datacenter caused packet loss and brief disconnection.',
    public_message: 'Network connectivity has been restored. All services are back online.',
    internal_notes: 'Upstream ISP resolved the fiber cut.',
    root_cause: 'Fiber cut.',
    expected_resolution: 'ISP rerouted traffic.',
    created_by: admin.username,
    servers: [s1.id || s1._id],
    services: ['acme.com', 'doe.com', 'shop.globalretail.com']
  });

  console.log(`[Seed] Purge & Seeding completed successfully. Admin login: ${admin.email} / admin@1906`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Database seeding failed:', err);
  process.exit(1);
});
