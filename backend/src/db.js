const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Wrap sqlite3 operations in Promises
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Initialize schema
async function initDb() {
  await query.run('PRAGMA foreign_keys = ON;');
  
  // admins
  await query.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL,
      secret_code TEXT,
      reset_token TEXT,
      reset_token_expires INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await query.run('ALTER TABLE admins ADD COLUMN secret_code TEXT;');
  } catch (err) {
    // Safely ignore error if column already exists
  }

  // servers
  await query.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name TEXT NOT NULL,
      server_code TEXT UNIQUE NOT NULL,
      ip_address TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // clients
  await query.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      company_name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // services (One Client -> Many Services, One Server -> Many Services)
  await query.run(`
    CREATE TABLE IF NOT EXISTS services (
      service_id TEXT PRIMARY KEY,
      client_id INTEGER NOT NULL,
      server_id INTEGER NOT NULL,
      active_status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE RESTRICT
    )
  `);

  // incidents
  await query.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      description TEXT,
      public_message TEXT,
      internal_notes TEXT,
      root_cause TEXT,
      expected_resolution TEXT,
      maintenance_window TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // incident_servers (Many Incidents -> Many Servers)
  await query.run(`
    CREATE TABLE IF NOT EXISTS incident_servers (
      incident_id INTEGER NOT NULL,
      server_id INTEGER NOT NULL,
      PRIMARY KEY (incident_id, server_id),
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    )
  `);

  // incident_services (To track which specific services under the affected servers are impacted)
  await query.run(`
    CREATE TABLE IF NOT EXISTS incident_services (
      incident_id INTEGER NOT NULL,
      service_id TEXT NOT NULL,
      is_affected INTEGER DEFAULT 1,
      PRIMARY KEY (incident_id, service_id),
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE CASCADE
    )
  `);

  // email_logs (Prevents sending duplicate notification emails)
  await query.run(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      service_id TEXT NOT NULL,
      email_type TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE CASCADE
    )
  `);
}

module.exports = {
  db,
  query,
  initDb
};
